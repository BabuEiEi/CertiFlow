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
    return SheetService.readRows(Config.SHEETS.ACTIVITIES);
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

    const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    if (lock) lock.waitLock(15000);

    try {
      const existingList = this.getActivities();
      const requestedId = Validation.sanitizeText(activityData.activityId);
      const isUpdate = !!requestedId;
      const existing = isUpdate
        ? existingList.find(a => String(a.activityId).trim() === requestedId)
        : null;
      if (isUpdate && !existing) {
        throw new Error(`ไม่พบกิจกรรม '${requestedId}' จึงไม่สามารถแก้ไขได้`);
      }

      const now = new Date().toISOString();
      const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';
      let activityId = requestedId;
      if (!isUpdate) {
        const maxId = existingList.reduce((max, item) => {
          const match = String(item.activityId || '').match(/^ACT(\d+)$/);
          return match ? Math.max(max, parseInt(match[1], 10)) : max;
        }, 0);
        activityId = `ACT${String(maxId + 1).padStart(3, '0')}`;
      }

      const merged = { ...(existing || {}), ...activityData };
      const startNumber = Validation.parseInteger(merged.startNumber === '' || merged.startNumber === undefined ? 1 : merged.startNumber, 'startNumber', 0, 999999999);
      const endNumber = Validation.parseInteger(merged.endNumber === '' || merged.endNumber === undefined ? 9999 : merged.endNumber, 'endNumber', startNumber, 999999999);
      const digitLength = Validation.parseInteger(merged.digitLength === '' || merged.digitLength === undefined ? 4 : merged.digitLength, 'digitLength', 1, 12);
      const status = String(merged.status || Config.ACTIVITY_STATUS.DRAFT).trim().toUpperCase();
      const numberFormat = String(merged.numberFormat || Config.NUMBER_FORMAT.ARABIC).trim().toUpperCase();
      if (!Object.values(Config.ACTIVITY_STATUS).includes(status)) {
        throw new Error('status ต้องเป็น DRAFT, ACTIVE หรือ CLOSED');
      }
      if (!Object.values(Config.NUMBER_FORMAT).includes(numberFormat)) {
        throw new Error('numberFormat ต้องเป็น THAI หรือ ARABIC');
      }

      const existingSequence = existing
        ? parseInt(existing.sequence === '' ? startNumber - 1 : existing.sequence, 10)
        : startNumber - 1;
      const requestedSequence = merged.sequence === '' || merged.sequence === undefined
        ? existingSequence
        : Validation.parseInteger(merged.sequence, 'sequence', 0, 999999999);
      if (existing && requestedSequence < existingSequence) {
        throw new Error('ไม่อนุญาตให้ลด sequence เพราะอาจทำให้เลขเกียรติบัตรซ้ำ');
      }
      if (requestedSequence < startNumber - 1) {
        throw new Error('startNumber ใหม่สูงกว่า sequence ปัจจุบัน กรุณาใช้ช่วงเลขที่ต่อเนื่อง');
      }
      if (requestedSequence > endNumber) {
        throw new Error('sequence ต้องไม่เกิน endNumber');
      }

      const activityObj = {
        activityId,
        sequence: requestedSequence,
        activityName: Validation.sanitizeSheetText(merged.activityName),
        organizer: Validation.sanitizeSheetText(merged.organizer),
        issueAgency: Validation.sanitizeSheetText(merged.issueAgency),
        startDate: Validation.sanitizeSheetText(merged.startDate),
        endDate: Validation.sanitizeSheetText(merged.endDate),
        issueDate: Validation.sanitizeSheetText(merged.issueDate),
        prefixText: Validation.sanitizeSheetText(merged.prefixText || 'เลขที่'),
        prefix: Validation.sanitizeSheetText(merged.prefix),
        startNumber,
        endNumber,
        digitLength,
        separator: Validation.sanitizeSheetText(merged.separator || '/'),
        year: Validation.sanitizeSheetText(merged.year || '2569'),
        numberFormat,
        templateId: String(merged.templateId).trim(),
        status,
        createdBy: existing ? existing.createdBy : actorEmail,
        createdAt: existing ? existing.createdAt : now,
        updatedBy: actorEmail,
        updatedAt: now
      };

      const headers = Config.HEADERS.Activities;
      const rowValues = headers.map(key => activityObj[key] !== undefined ? activityObj[key] : '');
      if (typeof SheetService !== 'undefined') {
        const sheet = SheetService.getSheet(Config.SHEETS.ACTIVITIES);
        if (existing && existing._rowIndex) {
          sheet.getRange(existing._rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
        } else {
          SheetService.appendRowsBatch(Config.SHEETS.ACTIVITIES, [rowValues]);
        }
      }

      if (typeof AuditService !== 'undefined') {
        const action = isUpdate ? AuditService.ACTIONS.UPDATE_ACTIVITY : AuditService.ACTIONS.CREATE_ACTIVITY;
        AuditService.log(action, 'Activity', activityId, existing, activityObj, `Saved activity ${activityId}`);
      }
      return activityObj;
    } finally {
      if (lock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
  },

  /** Persist only the allocation sequence without rebuilding the activity row. */
  updateSequence(activityId, nextSequence) {
    if (typeof SheetService === 'undefined') return;
    const activity = this.getActivityById(activityId);
    if (!activity || !activity._rowIndex) throw new Error(`Activity '${activityId}' not found.`);
    const current = parseInt(activity.sequence || 0, 10);
    if (nextSequence < current) throw new Error('Refusing to decrease activity sequence.');
    const sequenceColumn = Config.HEADERS.Activities.indexOf('sequence') + 1;
    SheetService.getSheet(Config.SHEETS.ACTIVITIES)
      .getRange(activity._rowIndex, sequenceColumn)
      .setValue(nextSequence);
  },

  deleteActivity(activityId) {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    const activity = this.getActivityById(activityId);
    if (!activity || !activity._rowIndex) throw new Error('ไม่พบกิจกรรม');
    const hasParticipants = typeof ParticipantService !== 'undefined' && ParticipantService.getParticipants(activityId).length > 0;
    const hasCertificates = typeof CertificateService !== 'undefined' && CertificateService.getAllCertificates().some(cert => String(cert.activityId).trim() === String(activityId).trim());
    if (hasParticipants || hasCertificates) {
      throw new Error('กิจกรรมมีข้อมูลอ้างอิงแล้ว ห้ามลบ กรุณาเปลี่ยนสถานะเป็น CLOSED');
    }
    SheetService.deleteRows(Config.SHEETS.ACTIVITIES, activity._rowIndex, 1);
    if (typeof AuditService !== 'undefined') {
      AuditService.log(AuditService.ACTIONS.DELETE_ACTIVITY, 'Activity', activityId, activity, null, `Deleted empty activity ${activityId}`);
    }
    return { activityId, deleted: true };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ActivityService;
}
