/**
 * Activity Management Service
 */
const ActivityService = {
  /**
   * Get all activities
   * @return {Array<Object>}
   */
  getActivities() {
    if (typeof SheetService === 'undefined') return [];
    try {
      return SheetService.readRows(Config.SHEETS.ACTIVITIES);
    } catch (e) {
      return [];
    }
  },

  /**
   * Get activity by ID
   * @param {string} activityId
   * @return {Object|null}
   */
  getActivityById(activityId) {
    const activities = this.getActivities();
    return activities.find(a => String(a.activityId).trim() === String(activityId).trim()) || null;
  },

  /**
   * Save (create or update) activity
   * Validates templateId before saving
   * @param {Object} activityData
   * @return {Object} Saved activity object
   */
  saveActivity(activityData) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN]);
    }

    const reqCheck = Validation.validateRequiredFields(activityData, [
      'activityName', 'organizer', 'issueAgency', 'templateId'
    ]);

    if (!reqCheck.valid) {
      throw new Error(`ข้อมูลกิจกรรมไม่ครบถ้วน ขาดฟิลด์: ${reqCheck.missing.join(', ')}`);
    }

    // 1. Validate templateId via TemplateService
    if (typeof TemplateService !== 'undefined') {
      const templateResult = TemplateService.validateTemplate(activityData.templateId);
      if (!templateResult.valid) {
        throw new Error(`Google Slides Template ไม่ผ่านการตรวจสอบ: ${templateResult.errors.join('; ')}`);
      }
    }

    const existingList = this.getActivities();
    const isUpdate = !!activityData.activityId;
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    let activityId = activityData.activityId;
    if (!isUpdate) {
      const count = existingList.length + 1;
      activityId = `ACT${('000' + count).slice(-3)}`;
    }

    const activityObj = {
      activityId: activityId,
      sequence: parseInt(activityData.sequence || 0, 10),
      activityName: Validation.sanitizeText(activityData.activityName),
      organizer: Validation.sanitizeText(activityData.organizer),
      issueAgency: Validation.sanitizeText(activityData.issueAgency),
      startDate: activityData.startDate || '',
      endDate: activityData.endDate || '',
      issueDate: activityData.issueDate || '',
      prefixText: activityData.prefixText || 'เลขที่',
      prefix: activityData.prefix || '',
      startNumber: parseInt(activityData.startNumber || 1, 10),
      endNumber: parseInt(activityData.endNumber || 9999, 10),
      digitLength: parseInt(activityData.digitLength || 4, 10),
      separator: activityData.separator || '/',
      year: String(activityData.year || '2569'),
      numberFormat: activityData.numberFormat || Config.NUMBER_FORMAT.ARABIC,
      templateId: String(activityData.templateId).trim(),
      status: activityData.status || Config.ACTIVITY_STATUS.DRAFT,
      createdBy: isUpdate ? (activityData.createdBy || actorEmail) : actorEmail,
      createdAt: isUpdate ? (activityData.createdAt || now) : now,
      updatedBy: actorEmail,
      updatedAt: now
    };

    // Prepare row matching Config.HEADERS.Activities
    const headers = Config.HEADERS.Activities;
    const rowValues = headers.map(key => activityObj[key] !== undefined ? activityObj[key] : '');

    if (typeof SheetService !== 'undefined') {
      const sheet = SheetService.getSheet(Config.SHEETS.ACTIVITIES);
      if (isUpdate) {
        const existingRow = existingList.find(a => a.activityId === activityId);
        if (existingRow && existingRow._rowIndex) {
          sheet.getRange(existingRow._rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
        } else {
          SheetService.appendRowsBatch(Config.SHEETS.ACTIVITIES, [rowValues]);
        }
      } else {
        SheetService.appendRowsBatch(Config.SHEETS.ACTIVITIES, [rowValues]);
      }
    }

    // Log Audit
    if (typeof AuditService !== 'undefined') {
      const action = isUpdate ? AuditService.ACTIONS.UPDATE_ACTIVITY : AuditService.ACTIONS.CREATE_ACTIVITY;
      AuditService.log(action, 'Activity', activityId, isUpdate ? existingList.find(a => a.activityId === activityId) : null, activityObj, `Saved activity ${activityId}`);
    }

    return activityObj;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivityService;
}
