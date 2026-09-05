/**
 * Audit Log Service
 */
const AuditService = {
  ACTIONS: {
    CREATE_ACTIVITY: 'CREATE_ACTIVITY',
    UPDATE_ACTIVITY: 'UPDATE_ACTIVITY',
    DELETE_ACTIVITY: 'DELETE_ACTIVITY',
    IMPORT_PARTICIPANTS: 'IMPORT_PARTICIPANTS',
    DELETE_PARTICIPANT: 'DELETE_PARTICIPANT',
    ASSIGN_NUMBER: 'ASSIGN_NUMBER',
    UPDATE_NAME: 'UPDATE_NAME',
    ISSUE_CERTIFICATE: 'ISSUE_CERTIFICATE',
    REVOKE_CERTIFICATE: 'REVOKE_CERTIFICATE',
    REISSUE_CERTIFICATE: 'REISSUE_CERTIFICATE',
    DELETE_CERTIFICATE: 'DELETE_CERTIFICATE',
    RESTORE_CERTIFICATE: 'RESTORE_CERTIFICATE',
    MANAGE_USER: 'MANAGE_USER',
    UPDATE_SETTINGS: 'UPDATE_SETTINGS',
    CREATE_QUEUE: 'CREATE_QUEUE'
  },

  /**
   * Safely stringify object payload for audit log, stripping non-serializable data
   * @param {Object|Array|null} data
   * @return {string}
   */
  stringifyPayload(data) {
    if (data === null || data === undefined) return '';
    try {
      const cleanData = JSON.parse(JSON.stringify(data));
      return JSON.stringify(cleanData);
    } catch (e) {
      return String(data);
    }
  },

  /**
   * Log action to AuditLogs sheet
   * @param {string} action
   * @param {string} entityType
   * @param {string} entityId
   * @param {Object} before
   * @param {Object} after
   * @param {string} note
   * @param {string} [actorEmail] Optional explicit email
   * @param {string} [actorRole] Optional explicit role
   */
  log(action, entityType, entityId, before = null, after = null, note = '', actorEmail = '', actorRole = '') {
    const context = typeof AuthService !== 'undefined'
      ? AuthService.getCurrentUserContext()
      : null;
    const email = actorEmail || (context && (context.email || context.userId)) || 'SYSTEM';
    const role = actorRole || (context && context.role) || 'SYSTEM';
    const logId = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const createdAt = new Date().toISOString();

    const beforeJson = this.stringifyPayload(before);
    const afterJson = this.stringifyPayload(after);

    const row = [
      logId, action, entityType, String(entityId), email, role,
      beforeJson, afterJson, note, createdAt
    ];

    if (typeof SheetService !== 'undefined' && SheetService.appendRowsBatch) {
      SheetService.appendRowsBatch(Config.SHEETS.AUDIT_LOGS, [row]);
    }

    return { logId, createdAt };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuditService;
}
