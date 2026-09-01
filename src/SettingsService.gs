/** ADMIN-only configuration facade. Secrets such as AUTH_PEPPER and bootstrap
 * credentials are deliberately excluded from both reads and writes. */
const SettingsService = {
  EDITABLE_KEYS: [
    'SYSTEM_NAME', 'ORGANIZATION', 'WEB_APP_URL', 'TEMPLATE_FOLDER_ID',
    'TEMP_FOLDER_ID', 'DEFAULT_TIMEZONE'
  ],

  getSettings() {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    const result = {};
    this.EDITABLE_KEYS.forEach(key => { result[key] = Config.get(key); });
    const databaseId = Config.get(Config.KEYS.DATABASE_SPREADSHEET_ID);
    result.DATABASE_SPREADSHEET_ID_MASKED = databaseId
      ? `${databaseId.slice(0, 5)}…${databaseId.slice(-4)}`
      : '';
    return result;
  },

  validate_(key, value) {
    const clean = Validation.sanitizeText(value);
    if (key === 'WEB_APP_URL' && clean && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/i.test(clean.replace(/[?#].*$/, ''))) {
      throw new Error('WEB_APP_URL ต้องเป็น URL ของ Google Apps Script Web App ที่ลงท้ายด้วย /exec');
    }
    if (['TEMPLATE_FOLDER_ID', 'TEMP_FOLDER_ID'].includes(key) && clean && !/^[A-Za-z0-9_-]{10,}$/.test(clean)) {
      throw new Error(`${key} มีรูปแบบ Google Drive ID ไม่ถูกต้อง`);
    }
    if (key === 'DEFAULT_TIMEZONE' && clean && !/^[A-Za-z_]+\/[A-Za-z_+-]+(?:\/[A-Za-z_+-]+)?$/.test(clean)) {
      throw new Error('DEFAULT_TIMEZONE ไม่ถูกต้อง เช่น Asia/Bangkok');
    }
    return clean;
  },

  updateSettings(updates) {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    if (!updates || typeof updates !== 'object') throw new Error('ไม่พบข้อมูลการตั้งค่า');
    const before = this.getSettings();
    const changed = {};
    this.EDITABLE_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        const value = this.validate_(key, updates[key]);
        Config.set(key, value);
        changed[key] = value;
      }
    });
    this.syncSettingsSheet_(changed);
    const after = this.getSettings();
    if (typeof AuditService !== 'undefined') {
      AuditService.log('UPDATE_SETTINGS', 'Settings', 'SYSTEM', before, after, `Updated settings: ${Object.keys(changed).join(', ')}`);
    }
    return after;
  },

  syncSettingsSheet_(changed) {
    if (typeof SheetService === 'undefined') return;
    const rows = SheetService.readRows(Config.SHEETS.SETTINGS);
    const sheet = SheetService.getSheet(Config.SHEETS.SETTINGS);
    const now = new Date().toISOString();
    const actor = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';
    Object.keys(changed).forEach(key => {
      const existing = rows.find(row => row.key === key);
      const values = [key, changed[key], existing ? existing.description : '', now, actor];
      if (existing && existing._rowIndex) sheet.getRange(existing._rowIndex, 1, 1, values.length).setValues([values]);
      else SheetService.appendRowsBatch(Config.SHEETS.SETTINGS, [values]);
    });
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = SettingsService;
