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
    try {
      const rows = SheetService.readRows(Config.SHEETS.PARTICIPANTS);
      if (!activityId) return rows;
      return rows.filter(r => String(r.activityId).trim() === String(activityId).trim());
    } catch (e) {
      return [];
    }
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

    if (!rows || !Array.isArray(rows)) {
      return { validRows: [], errorRows: [], duplicateRows: [], summary: { total: 0, valid: 0, error: 0, duplicate: 0 } };
    }

    const existingParticipants = this.getParticipants(activityId);
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
      
      let status = typeof Validation !== 'undefined' ? Validation.sanitizeText(row.participantStatus) : String(row.participantStatus || '').trim();
      if (status !== 'เข้าร่วม' && status !== 'ผ่านการอบรม') {
        status = 'ผ่านการอบรม'; // Default
      }

      if (!firstName || !lastName) {
        errorRows.push({
          sourceRow,
          row,
          error: 'ชื่อหรือนามสกุลจำเป็นต้องระบุ'
        });
        return;
      }

      const dupKey = this.generateDuplicateKey(activityId, firstName, lastName, school);
      const isDuplicateInDb = existingKeys.has(dupKey);
      const isDuplicateInPayload = payloadKeys.has(dupKey);

      const parsedItem = {
        sourceRow,
        activityId,
        prefixName,
        firstName,
        lastName,
        school,
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

    const validation = this.validateImport(activityId, rows);
    let rowsToImport = validation.validRows;

    if (allowOverride && validation.duplicateRows.length > 0) {
      rowsToImport = rowsToImport.concat(validation.duplicateRows);
    }

    if (rowsToImport.length === 0) {
      return { importedCount: 0, batchId: '' };
    }

    const batchId = `BATCH-${Date.now()}`;
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    const existingParticipants = this.getParticipants(activityId);
    let currentCount = existingParticipants.length;

    const participantBatchMatrix = [];
    const certificateBatchMatrix = [];

    rowsToImport.forEach(item => {
      currentCount++;
      const pId = `PAR-${activityId}-${('00000' + currentCount).slice(-6)}`;
      const certId = `CERT-${activityId}-${('00000' + currentCount).slice(-6)}`;

      // Mapped to Config.HEADERS.Participants
      const pRow = [
        pId,
        activityId,
        item.prefixName,
        item.firstName,
        item.lastName,
        item.school,
        item.participantStatus,
        batchId,
        item.sourceRow,
        now,
        actorEmail,
        now,
        actorEmail
      ];
      participantBatchMatrix.push(pRow);

      // Mapped to Config.HEADERS.Certificates (Default DRAFT state)
      const cRow = [
        certId,
        activityId,
        pId,
        '', // certificateNo (unassigned)
        currentCount, // runningNumber
        item.prefixName,
        item.firstName,
        item.lastName,
        item.school,
        item.participantStatus,
        Config.CERT_STATUS.DRAFT,
        item.prefixName, // originalPrefixName
        item.firstName,  // originalFirstName
        item.lastName,   // originalLastName
        '', // issuedAt
        '', // issuedBy
        '', // revokedAt
        '', // revokedBy
        '', // revokeReason
        now,
        actorEmail,
        now,
        actorEmail
      ];
      certificateBatchMatrix.push(cRow);
    });

    if (typeof SheetService !== 'undefined') {
      SheetService.appendRowsBatch(Config.SHEETS.PARTICIPANTS, participantBatchMatrix);
      SheetService.appendRowsBatch(Config.SHEETS.CERTIFICATES, certificateBatchMatrix);
    }

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.IMPORT_PARTICIPANTS,
        'ParticipantBatch',
        batchId,
        null,
        { activityId, importedCount: rowsToImport.length, batchId },
        `Imported ${rowsToImport.length} participants for activity ${activityId}`
      );
    }

    return {
      importedCount: rowsToImport.length,
      batchId: batchId
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticipantService;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ParticipantService;
}
