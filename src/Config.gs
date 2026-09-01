/**
 * Configuration and Database Schema Specifications
 */
const Config = {
  KEYS: {
    SYSTEM_NAME: 'SYSTEM_NAME',
    ORGANIZATION: 'ORGANIZATION',
    WEB_APP_URL: 'WEB_APP_URL',
    DATABASE_SPREADSHEET_ID: 'DATABASE_SPREADSHEET_ID',
    TEMPLATE_FOLDER_ID: 'TEMPLATE_FOLDER_ID',
    TEMP_FOLDER_ID: 'TEMP_FOLDER_ID',
    DEFAULT_TIMEZONE: 'DEFAULT_TIMEZONE',
    AUTH_PEPPER: 'AUTH_PEPPER',
    BOOTSTRAP_ADMIN_USER_ID: 'BOOTSTRAP_ADMIN_USER_ID',
    BOOTSTRAP_ADMIN_PASSWORD: 'BOOTSTRAP_ADMIN_PASSWORD',
    BOOTSTRAP_ADMIN_NAME: 'BOOTSTRAP_ADMIN_NAME'
  },

  SHEETS: {
    SETTINGS: 'Settings',
    ACTIVITIES: 'Activities',
    USERS: 'Users',
    PARTICIPANTS: 'Participants',
    CERTIFICATES: 'Certificates',
    GENERATION_QUEUE: 'GenerationQueue',
    AUDIT_LOGS: 'AuditLogs'
  },

  HEADERS: {
    Settings: ['key', 'value', 'description', 'updatedAt', 'updatedBy'],
    Activities: [
      'activityId', 'sequence', 'activityName', 'organizer', 'issueAgency',
      'startDate', 'endDate', 'issueDate', 'prefixText', 'prefix',
      'startNumber', 'endNumber', 'digitLength', 'separator', 'year',
      'numberFormat', 'templateId', 'status', 'createdBy', 'createdAt',
      'updatedBy', 'updatedAt'
    ],
    Users: [
      'userId', 'email', 'name', 'role', 'status', 'passwordSalt',
      'passwordHash', 'createdAt', 'updatedAt', 'lastLogin'
    ],
    Participants: [
      'participantId', 'activityId', 'prefixName', 'firstName', 'lastName',
      'school', 'participantStatus', 'importBatchId', 'sourceRow',
      'createdAt', 'createdBy', 'updatedAt', 'updatedBy'
    ],
    Certificates: [
      'certificateId', 'activityId', 'participantId', 'certificateNo',
      'runningNumber', 'prefixName', 'firstName', 'lastName', 'school',
      'participantStatus', 'certificateStatus', 'originalPrefixName',
      'originalFirstName', 'originalLastName', 'issuedAt', 'issuedBy',
      'revokedAt', 'revokedBy', 'revokeReason', 'createdAt', 'createdBy',
      'updatedAt', 'updatedBy'
    ],
    GenerationQueue: [
      'queueId', 'activityId', 'jobType', 'startRow', 'endRow',
      'currentRow', 'totalCount', 'successCount', 'failCount', 'status',
      'retryCount', 'lastError', 'createdAt', 'updatedAt'
    ],
    AuditLogs: [
      'logId', 'action', 'entityType', 'entityId', 'actorEmail',
      'actorRole', 'beforeJson', 'afterJson', 'note', 'createdAt'
    ]
  },

  ROLES: {
    ADMIN: 'ADMIN',
    STAFF: 'STAFF'
  },

  USER_STATUS: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE'
  },

  ACTIVITY_STATUS: {
    DRAFT: 'DRAFT',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED'
  },

  CERT_STATUS: {
    DRAFT: 'DRAFT',
    PENDING: 'PENDING',
    ISSUED: 'ISSUED',
    REVOKED: 'REVOKED',
    DELETED: 'DELETED'
  },

  NUMBER_FORMAT: {
    THAI: 'THAI',
    ARABIC: 'ARABIC'
  },

  /**
   * Get script property by key
   * @param {string} key
   * @return {string}
   */
  get(key) {
    if (typeof PropertiesService !== 'undefined') {
      return PropertiesService.getScriptProperties().getProperty(key) || '';
    }
    return '';
  },

  /**
   * Set script property by key
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    if (typeof PropertiesService !== 'undefined') {
      PropertiesService.getScriptProperties().setProperty(key, value);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Config;
}
