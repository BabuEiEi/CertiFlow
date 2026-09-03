/**
 * Authentication & Authorization Service
 *
 * Management users authenticate with a userId and password. A short-lived,
 * opaque token is stored in ScriptCache and must accompany every management
 * API call. Google account identity is intentionally not used so the public
 * and management UI can safely share one anonymous web-app deployment.
 */
const AuthService = {
  SESSION_TTL_SECONDS: 6 * 60 * 60,
  LOGIN_WINDOW_SECONDS: 15 * 60,
  MAX_LOGIN_ATTEMPTS: 5,
  _requestContext: null,
  _localSessions: {},
  _localLoginAttempts: {},

  normalizeUserId(userId) {
    return String(userId || '').trim().toLowerCase();
  },

  validateUserId(userId) {
    return /^[a-z0-9._@+-]{3,64}$/.test(this.normalizeUserId(userId));
  },

  validatePassword(password) {
    return typeof password === 'string' && password.length >= 8 && password.length <= 128;
  },

  hasPermission(role, allowedRoles) {
    if (!role) return false;
    const normalizedRole = String(role).trim().toUpperCase();
    const rolesArray = (Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles])
      .map(item => String(item).trim().toUpperCase());
    return rolesArray.includes(normalizedRole);
  },

  getPublicContext() {
    return {
      userId: '',
      email: '',
      role: null,
      status: null,
      name: 'Public Visitor',
      isPublicUser: true
    };
  },

  sanitizeUser(user) {
    if (!user) return this.getPublicContext();
    return {
      userId: this.normalizeUserId(user.userId),
      email: String(user.email || '').toLowerCase().trim(),
      role: String(user.role || '').trim().toUpperCase(),
      status: String(user.status || '').trim().toUpperCase(),
      name: user.name || user.userId,
      isPublicUser: false
    };
  },

  getUserRecord(userId) {
    const normalizedId = this.normalizeUserId(userId);
    if (!normalizedId || typeof SheetService === 'undefined') return null;
    const users = SheetService.readRows(Config.SHEETS.USERS);
    return users.find(user => this.normalizeUserId(user.userId) === normalizedId) || null;
  },

  getUserContext(userId) {
    const user = this.getUserRecord(userId);
    if (!user || String(user.status || '').trim().toUpperCase() !== Config.USER_STATUS.ACTIVE) {
      return this.getPublicContext();
    }
    return this.sanitizeUser(user);
  },

  getCurrentUserContext() {
    return this._requestContext || this.getPublicContext();
  },

  getCurrentUserEmail() {
    const context = this.getCurrentUserContext();
    return context.email || context.userId || '';
  },

  getAuthPepper_() {
    if (typeof PropertiesService === 'undefined') return 'LOCAL_TEST_PEPPER';
    const properties = PropertiesService.getScriptProperties();
    let pepper = properties.getProperty(Config.KEYS.AUTH_PEPPER);
    if (!pepper) {
      pepper = `${Utilities.getUuid()}${Utilities.getUuid()}`;
      properties.setProperty(Config.KEYS.AUTH_PEPPER, pepper);
    }
    return pepper;
  },

  hashPassword(userId, password, salt) {
    const payload = `${this.normalizeUserId(userId)}|${salt}|${String(password)}`;
    const pepper = this.getAuthPepper_();

    if (typeof Utilities !== 'undefined') {
      const signature = Utilities.computeHmacSha256Signature(
        payload,
        pepper,
        Utilities.Charset.UTF_8
      );
      return Utilities.base64EncodeWebSafe(signature);
    }

    // Deterministic local-test fallback; production always uses Apps Script HMAC.
    let hash = 2166136261;
    const source = `${pepper}|${payload}`;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `local-${(hash >>> 0).toString(16)}`;
  },

  constantTimeEqual_(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    let mismatch = a.length ^ b.length;
    const maxLength = Math.max(a.length, b.length);
    for (let i = 0; i < maxLength; i++) {
      mismatch |= (a.charCodeAt(i % Math.max(a.length, 1)) || 0) ^
        (b.charCodeAt(i % Math.max(b.length, 1)) || 0);
    }
    return mismatch === 0;
  },

  createPasswordFields(userId, password) {
    if (!this.validatePassword(password)) {
      throw new Error('รหัสผ่านต้องมีความยาว 8-128 ตัวอักษร');
    }
    const salt = typeof Utilities !== 'undefined'
      ? Utilities.getUuid()
      : `local-salt-${Date.now()}`;
    return {
      passwordSalt: salt,
      passwordHash: this.hashPassword(userId, password, salt)
    };
  },

  getCache_() {
    return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  },

  getClientKey_() {
    if (typeof Session !== 'undefined' && Session.getTemporaryActiveUserKey) {
      return Session.getTemporaryActiveUserKey() || 'anonymous';
    }
    return 'local';
  },

  getAttemptKey_(userId) {
    return `login:${this.normalizeUserId(userId)}:${this.getClientKey_()}`;
  },

  getLoginAttemptCount_(userId) {
    const key = this.getAttemptKey_(userId);
    const cache = this.getCache_();
    const value = cache ? cache.get(key) : this._localLoginAttempts[key];
    return parseInt(value || 0, 10);
  },

  recordFailedLogin_(userId) {
    const key = this.getAttemptKey_(userId);
    const count = this.getLoginAttemptCount_(userId) + 1;
    const cache = this.getCache_();
    if (cache) cache.put(key, String(count), this.LOGIN_WINDOW_SECONDS);
    else this._localLoginAttempts[key] = count;
  },

  clearLoginAttempts_(userId) {
    const key = this.getAttemptKey_(userId);
    const cache = this.getCache_();
    if (cache) cache.remove(key);
    else delete this._localLoginAttempts[key];
  },

  createSession_(context) {
    const token = typeof Utilities !== 'undefined'
      ? `${Utilities.getUuid().replace(/-/g, '')}${Utilities.getUuid().replace(/-/g, '')}`
      : `local-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const session = {
      userId: context.userId,
      email: context.email,
      name: context.name,
      role: context.role,
      status: context.status,
      isPublicUser: false,
      expiresAt: Date.now() + (this.SESSION_TTL_SECONDS * 1000)
    };
    const cache = this.getCache_();
    if (cache) cache.put(`session:${token}`, JSON.stringify(session), this.SESSION_TTL_SECONDS);
    else this._localSessions[token] = session;
    return { token, session };
  },

  getSessionContext(token) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return null;
    const cache = this.getCache_();
    const raw = cache ? cache.get(`session:${cleanToken}`) : this._localSessions[cleanToken];
    if (!raw) return null;
    const session = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!session.expiresAt || session.expiresAt <= Date.now()) {
      this.logout(cleanToken);
      return null;
    }

    // Re-read role/status so disabling an account takes effect immediately. A failed
    // lookup denies this call but must NOT drop the cached session: a transient Users
    // sheet read failure during a long batch would otherwise log the operator out for
    // good, mid-run. A genuinely disabled account keeps being denied here every call.
    const current = this.getUserContext(session.userId);
    if (current.isPublicUser) {
      return null;
    }

    // Sliding expiry: an operator working continuously never hits the hard TTL edge
    // in the middle of a batch.
    const renewed = { ...session, expiresAt: Date.now() + (this.SESSION_TTL_SECONDS * 1000) };
    if (cache) cache.put(`session:${cleanToken}`, JSON.stringify(renewed), this.SESSION_TTL_SECONDS);
    else this._localSessions[cleanToken] = renewed;

    return { ...current, expiresAt: renewed.expiresAt };
  },

  login(userId, password) {
    const normalizedId = this.normalizeUserId(userId);
    if (!this.validateUserId(normalizedId) || !this.validatePassword(password)) {
      throw new Error('userId หรือรหัสผ่านไม่ถูกต้อง');
    }
    if (this.getLoginAttemptCount_(normalizedId) >= this.MAX_LOGIN_ATTEMPTS) {
      throw new Error('พยายามเข้าสู่ระบบเกินกำหนด กรุณารอ 15 นาทีแล้วลองใหม่');
    }

    const user = this.getUserRecord(normalizedId);
    const isActive = user && String(user.status || '').trim().toUpperCase() === Config.USER_STATUS.ACTIVE;
    const expectedHash = user ? String(user.passwordHash || '') : '';
    const actualHash = user
      ? this.hashPassword(normalizedId, password, String(user.passwordSalt || ''))
      : this.hashPassword(normalizedId, password, 'missing-user');

    if (!isActive || !expectedHash || !this.constantTimeEqual_(expectedHash, actualHash)) {
      this.recordFailedLogin_(normalizedId);
      throw new Error('userId หรือรหัสผ่านไม่ถูกต้อง');
    }

    this.clearLoginAttempts_(normalizedId);
    const now = new Date().toISOString();
    user.lastLogin = now;
    user.updatedAt = now;
    this.saveUserRecord(user);
    const context = this.sanitizeUser(user);
    const created = this.createSession_(context);
    return {
      authToken: created.token,
      expiresIn: this.SESSION_TTL_SECONDS,
      user: context
    };
  },

  logout(token) {
    const cleanToken = String(token || '').trim();
    if (!cleanToken) return { loggedOut: true };
    const cache = this.getCache_();
    if (cache) cache.remove(`session:${cleanToken}`);
    else delete this._localSessions[cleanToken];
    return { loggedOut: true };
  },

  setRequestContextFromToken(token) {
    this._requestContext = this.getSessionContext(token);
    return this._requestContext;
  },

  clearRequestContext() {
    this._requestContext = null;
  },

  requireAuthenticatedUser(token) {
    const context = token ? this.getSessionContext(token) : this.getCurrentUserContext();
    if (!context || context.isPublicUser || !context.userId) {
      throw new Error('กรุณาเข้าสู่ระบบ Management Mode');
    }
    return context;
  },

  requireRole(allowedRoles, token) {
    const context = this.requireAuthenticatedUser(token);
    if (!context.role || !this.hasPermission(context.role, allowedRoles)) {
      throw new Error(`ไม่มีสิทธิ์ใช้งาน: ต้องเป็น ${Array.isArray(allowedRoles) ? allowedRoles.join(' หรือ ') : allowedRoles}`);
    }
    return context;
  },

  saveUserRecord(userObj) {
    if (typeof SheetService === 'undefined') return userObj;
    const sheet = SheetService.getSheet(Config.SHEETS.USERS);
    const columnCount = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, columnCount)
      .getValues()[0]
      .map(header => String(header).trim());
    const rowValues = headers.map(key => userObj[key] !== undefined ? userObj[key] : '');
    if (userObj._rowIndex) {
      sheet.getRange(userObj._rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      SheetService.appendRowsBatch(Config.SHEETS.USERS, [rowValues]);
    }
    return userObj;
  },

  bootstrapAdmin(userId, password, name = 'System Administrator') {
    const normalizedId = this.normalizeUserId(userId);
    if (!this.validateUserId(normalizedId)) {
      throw new Error('BOOTSTRAP_ADMIN_USER_ID ต้องมี 3-64 ตัว และใช้ a-z, 0-9, @, จุด, +, ขีดกลาง หรือขีดล่างเท่านั้น');
    }
    const users = SheetService.readRows(Config.SHEETS.USERS);
    const configuredAdmin = users.find(user =>
      String(user.role || '').trim().toUpperCase() === Config.ROLES.ADMIN &&
      String(user.status || '').trim().toUpperCase() === Config.USER_STATUS.ACTIVE &&
      String(user.passwordHash || '').trim()
    );
    if (configuredAdmin && this.normalizeUserId(configuredAdmin.userId) !== normalizedId) {
      throw new Error('ระบบมี ADMIN ที่ตั้งรหัสผ่านแล้ว ไม่อนุญาตให้ bootstrap ซ้ำ');
    }

    const existing = users.find(user => this.normalizeUserId(user.userId) === normalizedId);
    const now = new Date().toISOString();
    const passwordFields = this.createPasswordFields(normalizedId, password);
    const admin = {
      ...(existing || {}),
      userId: normalizedId,
      email: existing ? (existing.email || '') : '',
      name: Validation.sanitizeText(name) || 'System Administrator',
      role: Config.ROLES.ADMIN,
      status: Config.USER_STATUS.ACTIVE,
      ...passwordFields,
      createdAt: existing ? (existing.createdAt || now) : now,
      updatedAt: now,
      lastLogin: existing ? (existing.lastLogin || '') : ''
    };
    this.saveUserRecord(admin);
    return this.sanitizeUser(admin);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthService;
}
