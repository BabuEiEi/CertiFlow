/**
 * CertiFlow - Certificate Management System
 * Web App Entry Point & API Router
 */

/**
 * Public and Management API Allowlist Routing Specification
 */
const API_ROUTES = {
  PUBLIC: ['activities', 'search', 'verify', 'preview', 'download', 'login', 'logout', 'session'],
  MANAGEMENT: {
    createActivity: ['ADMIN'],
    updateActivity: ['ADMIN'],
    validateTemplate: ['ADMIN'],
    importParticipants: ['ADMIN', 'STAFF'],
    validateImport: ['ADMIN', 'STAFF'],
    getParticipants: ['ADMIN', 'STAFF'],
    getCertificates: ['ADMIN', 'STAFF'],
    getDashboardStats: ['ADMIN', 'STAFF'],
    assignNumbers: ['ADMIN', 'STAFF'],
    createGenerationQueue: ['ADMIN', 'STAFF'],
    getGenerationProgress: ['ADMIN', 'STAFF'],
    updateCertificate: ['ADMIN', 'STAFF'],
    issueCertificate: ['ADMIN', 'STAFF'],
    revokeCertificate: ['ADMIN', 'STAFF'],
    deleteCertificate: ['ADMIN'],
    getUsers: ['ADMIN'],
    manageUser: ['ADMIN'],
    getAuditLogs: ['ADMIN']
  }
};

/**
 * Handles HTTP GET requests
 * @param {Object} e Event object
 * @return {HtmlOutput|TextOutput}
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const action = params.action;

    // Route API action if requested via GET
    if (action) {
      return handleApiRequest(action, params, 'GET');
    }

    // Default HTML page render
    const page = params.page || 'search';
    const template = HtmlService.createTemplateFromFile('web/Index');
    template.page = page;
    template.params = params;
    template.webAppUrl = (Config.get(Config.KEYS.WEB_APP_URL) ||
      'https://script.google.com/macros/s/AKfycbwEgpSmcBId4sCfVMbWxKdtiqVSLZpeRURPdu6xT-HB9kuyl55blv3tD37Cf7ILVSxb/exec')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');

    return template.evaluate()
      .setTitle('CertiFlow - Certificate Management System')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify(Utils.buildResponse(false, null, error.message || String(error))))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles HTTP POST requests
 * @param {Object} e Event object
 * @return {TextOutput}
 */
function doPost(e) {
  try {
    const contents = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    const action = contents.action;
    const payload = contents.payload || contents;

    return handleApiRequest(action, payload, 'POST');
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify(Utils.buildResponse(false, null, error.message || String(error))))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main Centralized API Action Handler & Router
 * @param {string} action
 * @param {Object} payload
 * @param {string} method 'GET' | 'POST' | 'RPC'
 * @return {TextOutput|Object} Response envelope or TextOutput depending on environment
 */
function handleApiRequest(action, payload, method = 'RPC') {
  try {
    AuthService.clearRequestContext();
    if (!action) {
      throw new Error('Missing API action parameter.');
    }

    let resultData = null;

    if (method === 'GET' && ['login', 'logout', 'session'].includes(action)) {
      throw new Error('Authentication actions must use POST or google.script.run.');
    }

    // 1. Check Public Routes
    if (API_ROUTES.PUBLIC.includes(action)) {
      resultData = executePublicAction(action, payload);
    } 
    // 2. Check Management Routes
    else if (API_ROUTES.MANAGEMENT[action]) {
      const allowedRoles = API_ROUTES.MANAGEMENT[action];
      const authToken = payload && payload.authToken ? payload.authToken : '';
      AuthService.setRequestContextFromToken(authToken);
      const userContext = AuthService.requireRole(allowedRoles);
      resultData = executeManagementAction(action, payload, userContext);
    } 
    else {
      throw new Error(`Invalid API action: '${action}' is not supported.`);
    }

    const response = Utils.buildResponse(true, resultData);

    if (method === 'GET' || method === 'POST') {
      return ContentService.createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return response;
  } catch (error) {
    const response = Utils.buildResponse(false, null, error.message || String(error));
    if (method === 'GET' || method === 'POST') {
      return ContentService.createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return response;
  } finally {
    AuthService.clearRequestContext();
  }
}

/**
 * Execute public endpoint action
 * @param {string} action
 * @param {Object} payload
 * @return {*}
 */
function executePublicAction(action, payload) {
  switch (action) {
    case 'activities':
      return ActivityService.getActivities();
    case 'search':
      const q = Validation.sanitizeText(payload.q);
      const activityId = payload.activityId || '';
      const page = parseInt(payload.page || 1, 10);
      const pageSize = Math.min(parseInt(payload.pageSize || 10, 10), 50); // Hard limit pageSize <= 50
      return SearchService.search(activityId, q, page, pageSize);
    case 'verify':
      const certId = payload.id || payload.certificateId || '';
      return SearchService.verify(certId);
    case 'preview':
      return ExportService.generateExportBlob(payload.id, 'jpeg');
    case 'download':
      const format = (payload.format || 'pdf').toLowerCase();
      return ExportService.generateExportBlob(payload.id, format);
    case 'login':
      return AuthService.login(payload.userId, payload.password);
    case 'logout':
      return AuthService.logout(payload.authToken);
    case 'session':
      return AuthService.getSessionContext(payload.authToken) || AuthService.getPublicContext();
    default:
      throw new Error(`Unsupported public action '${action}'.`);
  }
}

/**
 * Execute management endpoint action
 * @param {string} action
 * @param {Object} payload
 * @param {Object} userContext
 * @return {*}
 */
function executeManagementAction(action, payload, userContext) {
  switch (action) {
    case 'createActivity':
    case 'updateActivity':
      return ActivityService.saveActivity(payload);
    case 'validateTemplate':
      return TemplateService.validateTemplate(payload.templateId);
    case 'importParticipants':
      return ParticipantService.commitImport(payload.activityId, payload.rows, payload.allowOverride);
    case 'validateImport':
      return ParticipantService.validateImport(payload.activityId, payload.rows);
    case 'getParticipants':
      return ParticipantService.getParticipants(payload.activityId);
    case 'getCertificates':
      return CertificateService.getCertificates(payload.activityId, payload.filter || {});
    case 'getDashboardStats':
      const activities = ActivityService.getActivities();
      const allCertificates = CertificateService.getAllCertificates();
      const allParticipants = ParticipantService.getParticipants('');

      const issuedCount = allCertificates.filter(c => c.certificateStatus === Config.CERT_STATUS.ISSUED).length;
      const revokedCount = allCertificates.filter(c => c.certificateStatus === Config.CERT_STATUS.REVOKED).length;

      const activitySummaries = activities.map(act => {
        const actCerts = allCertificates.filter(c => String(c.activityId).trim() === String(act.activityId).trim());
        const actParts = allParticipants.filter(p => String(p.activityId).trim() === String(act.activityId).trim());
        const actIssued = actCerts.filter(c => c.certificateStatus === Config.CERT_STATUS.ISSUED).length;
        return {
          activityId: act.activityId,
          activityName: act.activityName,
          status: act.status,
          participantCount: actParts.length,
          issuedCount: actIssued
        };
      });

      return {
        totalActivities: activities.length,
        totalParticipants: allParticipants.length,
        totalIssued: issuedCount,
        totalRevoked: revokedCount,
        activitiesSummary: activitySummaries
      };

    case 'assignNumbers':
      return NumberService.generateNextNumbers(payload.activityId);
    case 'createGenerationQueue':
      return QueueService.createJob(payload.activityId, payload.jobType, payload.totalCount, payload.startRow);
    case 'getGenerationProgress':
      return QueueService.getJobProgress(payload.queueId);
    case 'updateCertificate':
      return CertificateService.updateCertificate(payload.certificateId, payload.updates || payload);
    case 'issueCertificate':
      return CertificateService.issueCertificate(payload.certificateId);
    case 'revokeCertificate':
      return CertificateService.revokeCertificate(payload.certificateId, payload.reason);
    case 'deleteCertificate':
      return CertificateService.deleteCertificate(payload.certificateId);
    case 'getUsers':
      if (typeof SheetService === 'undefined') return [];
      return SheetService.readRows(Config.SHEETS.USERS).map(user => ({
        userId: user.userId,
        email: user.email || '',
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLogin: user.lastLogin
      }));
    case 'manageUser':
      if (typeof SheetService !== 'undefined') {
        const userId = AuthService.normalizeUserId(payload.userId);
        if (!AuthService.validateUserId(userId)) {
          throw new Error('userId ต้องมี 3-64 ตัว และใช้ a-z, 0-9, @, จุด, +, ขีดกลาง หรือขีดล่างเท่านั้น');
        }
        const users = SheetService.readRows(Config.SHEETS.USERS);
        const existing = users.find(u => AuthService.normalizeUserId(u.userId) === userId);
        const now = new Date().toISOString();
        const role = String(payload.role || Config.ROLES.STAFF).trim().toUpperCase();
        const status = String(payload.status || Config.USER_STATUS.ACTIVE).trim().toUpperCase();
        const name = Validation.sanitizeText(payload.name);

        if (![Config.ROLES.ADMIN, Config.ROLES.STAFF].includes(role)) {
          throw new Error('role ต้องเป็น ADMIN หรือ STAFF');
        }
        if (![Config.USER_STATUS.ACTIVE, Config.USER_STATUS.INACTIVE].includes(status)) {
          throw new Error('status ต้องเป็น ACTIVE หรือ INACTIVE');
        }
        if (!name) {
          throw new Error('กรุณาระบุชื่อผู้ใช้งาน');
        }
        if (!existing && !AuthService.validatePassword(payload.password)) {
          throw new Error('ผู้ใช้ใหม่ต้องมีรหัสผ่าน 8-128 ตัวอักษร');
        }
        if (userId === userContext.userId && status === Config.USER_STATUS.INACTIVE) {
          throw new Error('ไม่สามารถปิดใช้งานบัญชีที่กำลังเข้าสู่ระบบอยู่');
        }
        if (userId === userContext.userId && role !== Config.ROLES.ADMIN) {
          throw new Error('ไม่สามารถลดสิทธิ์บัญชี ADMIN ที่กำลังเข้าสู่ระบบอยู่');
        }

        const userObj = {
          ...(existing || {}),
          userId: userId,
          email: String(payload.email || (existing ? existing.email : '') || '').toLowerCase().trim(),
          name: name,
          role: role,
          status: status,
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
          lastLogin: existing ? (existing.lastLogin || '') : ''
        };

        if (payload.password) {
          Object.assign(userObj, AuthService.createPasswordFields(userId, payload.password));
        }
        AuthService.saveUserRecord(userObj);

        if (typeof AuditService !== 'undefined') {
          AuditService.log(
            AuditService.ACTIONS.MANAGE_USER,
            'User',
            userObj.userId,
            existing ? AuthService.sanitizeUser(existing) : null,
            AuthService.sanitizeUser(userObj),
            `Saved user ${userId} with role ${userObj.role}`
          );
        }

        return AuthService.sanitizeUser(userObj);
      }
      return {};
    case 'getAuditLogs':
      if (typeof SheetService === 'undefined') return { logs: [] };
      const logs = SheetService.readRows(Config.SHEETS.AUDIT_LOGS);
      // Return last 100 logs reverse sorted
      return { logs: logs.slice(-100).reverse() };
    default:
      return { status: 'acknowledged', action, actor: userContext.email };
  }
}

/**
 * Client-side google.script.run bridge
 * @param {string} action
 * @param {Object} payload
 * @return {Object} Standard response envelope
 */
function apiCall(action, payload) {
  return handleApiRequest(action, payload, 'RPC');
}

/**
 * Helper to include partial HTML files into templates
 * @param {string} filename File path without extension
 * @return {string} Evaluated content
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Setup and initialize database sheets & headers (Run once from Apps Script Editor)
 */
function setupDatabase() {
  const result = SheetService.initializeDatabase();
  Logger.log('Database Initialization Result: ' + JSON.stringify(result));
  return result;
}

/**
 * Create the first ADMIN account from temporary Script Properties.
 * Required properties: BOOTSTRAP_ADMIN_USER_ID, BOOTSTRAP_ADMIN_PASSWORD.
 * Optional property: BOOTSTRAP_ADMIN_NAME.
 * Run setupDatabase() first, then run this function once from the editor.
 */
function bootstrapAdmin() {
  const userId = Config.get(Config.KEYS.BOOTSTRAP_ADMIN_USER_ID);
  const password = Config.get(Config.KEYS.BOOTSTRAP_ADMIN_PASSWORD);
  const name = Config.get(Config.KEYS.BOOTSTRAP_ADMIN_NAME) || 'System Administrator';
  if (!userId || !password) {
    throw new Error('กรุณาตั้ง BOOTSTRAP_ADMIN_USER_ID และ BOOTSTRAP_ADMIN_PASSWORD ใน Script Properties');
  }
  const admin = AuthService.bootstrapAdmin(userId, password, name);
  if (typeof PropertiesService !== 'undefined') {
    PropertiesService.getScriptProperties().deleteProperty(Config.KEYS.BOOTSTRAP_ADMIN_PASSWORD);
  }
  Logger.log('Bootstrap ADMIN completed: ' + JSON.stringify(admin));
  return admin;
}
