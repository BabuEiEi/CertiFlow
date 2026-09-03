/**
 * Participant Management & Import Service
 */
const ParticipantService = {
  /**
   * Generate composite duplicate check key: activityId + firstName + lastName + school
   * @param {string} activityId
   * @param {string} firstName
   * @param {string} lastName
   * @param {string} school
   * @return {string}
   */
  generateDuplicateKey(activityId, firstName, lastName, school) {
    const actId = String(activityId || '').trim();
    const fn = typeof Validation !== 'undefined' ? Validation.sanitizeText(firstName).toLowerCase() : String(firstName || '').trim().toLowerCase();
    const ln = typeof Validation !== 'undefined' ? Validation.sanitizeText(lastName).toLowerCase() : String(lastName || '').trim().toLowerCase();
    const sch = typeof Validation !== 'undefined' ? Validation.sanitizeText(school).toLowerCase() : String(school || '').trim().toLowerCase();

    return `${actId}|${fn}|${ln}|${sch}`;
  },

  /**
   * Get all participants for an activity
   * @param {string} activityId
   * @return {Array<Object>}
   */
  getParticipants(activityId) {
    if (typeof SheetService === 'undefined') return [];
    const rows = SheetService.readRows(Config.SHEETS.PARTICIPANTS);
    if (!activityId) return rows;
    return rows.filter(r => String(r.activityId).trim() === String(activityId).trim());
  },

  /**
   * Validate raw input rows for import preview before committing
   * @param {string} activityId
   * @param {Array<Object>} rows
   * @return {Object} { validRows, errorRows, duplicateRows, summary }
   */
  validateImport(activityId, rows) {
    const validRows = [];
    const errorRows = [];
    const duplicateRows = [];

    const cleanActivityId = String(activityId || '').trim();
    if (!cleanActivityId) {
      return { validRows: [], errorRows: [{ sourceRow: 0, row: {}, error: 'กรุณาระบุกิจกรรม' }], duplicateRows: [], summary: { total: Array.isArray(rows) ? rows.length : 0, valid: 0, error: 1, duplicate: 0 } };
    }
    if (typeof ActivityService !== 'undefined' && !ActivityService.getActivityById(cleanActivityId)) {
      return { validRows: [], errorRows: [{ sourceRow: 0, row: {}, error: `ไม่พบกิจกรรม '${cleanActivityId}'` }], duplicateRows: [], summary: { total: Array.isArray(rows) ? rows.length : 0, valid: 0, error: 1, duplicate: 0 } };
    }
    if (!rows || !Array.isArray(rows)) {
      return { validRows: [], errorRows: [], duplicateRows: [], summary: { total: 0, valid: 0, error: 0, duplicate: 0 } };
    }
    if (rows.length > 5000) {
      return { validRows: [], errorRows: [{ sourceRow: 0, row: {}, error: 'นำเข้าได้ไม่เกิน 5,000 แถวต่อครั้ง' }], duplicateRows: [], summary: { total: rows.length, valid: 0, error: 1, duplicate: 0 } };
    }

    const existingParticipants = this.getParticipants(cleanActivityId);
    const existingKeys = new Set(
      existingParticipants.map(p => this.generateDuplicateKey(p.activityId, p.firstName, p.lastName, p.school))
    );

    const payloadKeys = new Set();

    rows.forEach((row, index) => {
      const sourceRow = index + 1;
      const prefixName = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.prefixName) : String(row.prefixName || '').trim();
      const firstName = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.firstName) : String(row.firstName || '').trim();
      const lastName = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.lastName) : String(row.lastName || '').trim();
      const school = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.school) : String(row.school || '').trim();
      const trainingType = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.trainingType) : String(row.trainingType || '').trim();

      let status = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.participantStatus) : String(row.participantStatus || '').trim();
      if (!status) status = 'ผ่านการอบรม';

      if (!firstName || !lastName) {
        errorRows.push({
          sourceRow,
          row,
          error: 'ชื่อหรือนามสกุลจำเป็นต้องระบุ'
        });
        return;
      }
      if (!['เข้าร่วม', 'ผ่านการอบรม'].includes(status)) {
        errorRows.push({ sourceRow, row, error: 'participantStatus ต้องเป็น เข้าร่วม หรือ ผ่านการอบรม' });
        return;
      }

      const dupKey = this.generateDuplicateKey(cleanActivityId, firstName, lastName, school);
      const isDuplicateInDb = existingKeys.has(dupKey);
      const isDuplicateInPayload = payloadKeys.has(dupKey);

      const parsedItem = {
        sourceRow,
        activityId: cleanActivityId,
        prefixName,
        firstName,
        lastName,
        school,
        trainingType,
        participantStatus: status,
        duplicateKey: dupKey
      };

      if (isDuplicateInDb || isDuplicateInPayload) {
        duplicateRows.push({
          ...parsedItem,
          duplicateReason: isDuplicateInDb ? 'พบในฐานข้อมูลแล้ว' : 'ซ้ำกันเองในไฟล์นำเข้า'
        });
      } else {
        payloadKeys.add(dupKey);
        validRows.push(parsedItem);
      }
    });

    return {
      validRows,
      errorRows,
      duplicateRows,
      summary: {
        total: rows.length,
        valid: validRows.length,
        error: errorRows.length,
        duplicate: duplicateRows.length
      }
    };
  },

  /**
   * Commit validated rows to database
   * @param {string} activityId
   * @param {Array<Object>} rows
   * @param {boolean} allowOverride Allow committing duplicate rows if requested
   * @return {Object} { importedCount, batchId }
   */
  commitImport(activityId, rows, allowOverride = false) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const cleanActivityId = String(activityId || '').trim();
    const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    if (lock) lock.waitLock(20000);
    try {
      // Revalidate after acquiring the lock so concurrent imports cannot pass
      // duplicate checks against the same stale snapshot.
      const validation = this.validateImport(cleanActivityId, rows);
      let rowsToImport = validation.validRows;
      if (allowOverride && validation.duplicateRows.length > 0) {
        rowsToImport = rowsToImport.concat(validation.duplicateRows);
      }
      if (rowsToImport.length === 0) {
        return { importedCount: 0, batchId: '', validation };
      }

      const uuid = typeof Utilities !== 'undefined' ? Utilities.getUuid().slice(0, 8) : Math.random().toString(36).slice(2, 10);
      const batchId = `BATCH-${Date.now()}-${uuid}`;
      const now = new Date().toISOString();
      const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';
      const existingParticipants = this.getParticipants(cleanActivityId);
      let currentCount = existingParticipants.reduce((max, participant) => {
        const match = String(participant.participantId || '').match(/-(\d{6})$/);
        return match ? Math.max(max, parseInt(match[1], 10)) : max;
      }, 0);

      // Rows that leave "ด้านการอบรม" blank inherit the activity-level default.
      const activity = typeof ActivityService !== 'undefined' ? ActivityService.getActivityById(cleanActivityId) : null;
      const defaultTrainingType = activity ? String(activity.trainingType || '').trim() : '';

      const participantBatchMatrix = [];
      const certificateBatchMatrix = [];

      rowsToImport.forEach(item => {
        currentCount++;
        const suffix = String(currentCount).padStart(6, '0');
        const pId = `PAR-${cleanActivityId}-${suffix}`;
        const certId = `CERT-${cleanActivityId}-${suffix}`;
        const prefixName = Validation.sanitizeSheetText(item.prefixName);
        const firstName = Validation.sanitizeSheetText(item.firstName);
        const lastName = Validation.sanitizeSheetText(item.lastName);
        const school = Validation.sanitizeSheetText(item.school);
        const trainingType = Validation.sanitizeSheetText(item.trainingType || defaultTrainingType);

        const pRow = [
        pId,
        cleanActivityId,
        prefixName,
        firstName,
        lastName,
        school,
        item.participantStatus,
        batchId,
        item.sourceRow,
        now,
        actorEmail,
        now,
        actorEmail,
        trainingType
      ];
        participantBatchMatrix.push(pRow);

        const cRow = [
        certId,
        cleanActivityId,
        pId,
        '', // certificateNo (unassigned)
        '', // runningNumber is allocated only when the certificate is issued
        prefixName,
        firstName,
        lastName,
        school,
        item.participantStatus,
        Config.CERT_STATUS.DRAFT,
        prefixName, // originalPrefixName
        firstName,  // originalFirstName
        lastName,   // originalLastName
        '', // issuedAt
        '', // issuedBy
        '', // revokedAt
        '', // revokedBy
        '', // revokeReason
        now,
        actorEmail,
        now,
        actorEmail,
        trainingType
      ];
        certificateBatchMatrix.push(cRow);
      });

      let participantAppend = null;
      if (typeof SheetService !== 'undefined') {
        participantAppend = SheetService.appendRowsBatch(Config.SHEETS.PARTICIPANTS, participantBatchMatrix);
        try {
          SheetService.appendRowsBatch(Config.SHEETS.CERTIFICATES, certificateBatchMatrix);
        } catch (error) {
          if (participantAppend) {
            SheetService.deleteRows(Config.SHEETS.PARTICIPANTS, participantAppend.startRow, participantAppend.rowCount);
          }
          throw error;
        }
      }

      if (typeof AuditService !== 'undefined') {
        AuditService.log(
        AuditService.ACTIONS.IMPORT_PARTICIPANTS,
        'ParticipantBatch',
        batchId,
        null,
        { activityId: cleanActivityId, importedCount: rowsToImport.length, batchId },
        `Imported ${rowsToImport.length} participants for activity ${cleanActivityId}`
        );
      }
      return { importedCount: rowsToImport.length, batchId };
    } finally {
      if (lock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }
  },

  updateParticipant(participantId, updates) {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    const cleanId = String(participantId || '').trim();
    const participant = this.getParticipants('').find(item => String(item.participantId).trim() === cleanId);
    if (!participant) throw new Error(`ไม่พบ Participant '${cleanId}'`);
    const certificate = typeof CertificateService !== 'undefined'
      ? CertificateService.getAllCertificates().find(item => String(item.participantId).trim() === cleanId && item.certificateStatus !== Config.CERT_STATUS.DELETED)
      : null;
    if (!certificate) throw new Error('ไม่พบ Certificate registry ที่เชื่อมกับ Participant');
    const updatedCertificate = CertificateService.updateCertificate(certificate.certificateId, updates || {});
    return this.getParticipants('').find(item => String(item.participantId).trim() === cleanId) || {
      ...participant,
      prefixName: updatedCertificate.prefixName,
      firstName: updatedCertificate.firstName,
      lastName: updatedCertificate.lastName,
      school: updatedCertificate.school,
      participantStatus: updatedCertificate.participantStatus
    };
  }
};


if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticipantService;
}
