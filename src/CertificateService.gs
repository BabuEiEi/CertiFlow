/**
 * Certificate Registry & Lifecycle State Management Service
 */
const CertificateService = {
  /**
   * Hard ceiling for one bulk round. Issuing a number is the heaviest per-row action
   * (lock + number allocation + row write + audit row), so the cap keeps a single
   * Apps Script call well inside the 6-minute execution limit. The UI splits larger
   * selections into consecutive rounds of this size.
   */
  MAX_BULK_PER_ROUND: 25,

  /**
   * Get all certificates
   * @return {Array<Object>}
   */
  getAllCertificates() {
    if (typeof SheetService === 'undefined') return [];
    return SheetService.readRows(Config.SHEETS.CERTIFICATES);
  },

  /**
   * Get certificate by ID
   * @param {string} certificateId
   * @param {Array<Object>} [cache] Pre-read registry rows, so bulk callers avoid one sheet read per item
   * @return {Object|null}
   */
  getById(certificateId, cache) {
    const certs = cache || this.getAllCertificates();
    const cleanId = String(certificateId || '').trim();
    return certs.find(c => String(c.certificateId).trim() === cleanId) || null;
  },

  /**
   * Query certificates by activity or filter
   * @param {string} activityId
   * @param {Object} [filter] { status, query }
   * @return {Array<Object>}
   */
  getCertificates(activityId, filter = {}) {
    let list = this.getAllCertificates();
    if (activityId) {
      list = list.filter(c => String(c.activityId).trim() === String(activityId).trim());
    }
    if (filter.status) {
      list = list.filter(c => c.certificateStatus === filter.status);
    } else {
      // Exclude DELETED by default for registry list
      list = list.filter(c => c.certificateStatus !== Config.CERT_STATUS.DELETED);
    }
    return list;
  },

  /**
   * Update certificate details (Name, School, Status)
   * Preserves original name fields on first edit.
   * @param {string} certificateId
   * @param {Object} updates
   * @return {Object} Updated certificate
   */
  updateCertificate(certificateId, updates) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const cert = this.getById(certificateId);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus === Config.CERT_STATUS.DELETED) {
      throw new Error(`Cannot update deleted certificate '${certificateId}'.`);
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    // Name change tracking: preserve original names on first edit
    let origPrefix = cert.originalPrefixName || cert.prefixName;
    let origFirst = cert.originalFirstName || cert.firstName;
    let origLast = cert.originalLastName || cert.lastName;

    const newPrefixName = updates.prefixName !== undefined ? Validation.sanitizeSheetText(updates.prefixName) : cert.prefixName;
    const newFirstName = updates.firstName !== undefined ? Validation.sanitizeSheetText(updates.firstName) : cert.firstName;
    const newLastName = updates.lastName !== undefined ? Validation.sanitizeSheetText(updates.lastName) : cert.lastName;
    const newSchool = updates.school !== undefined ? Validation.sanitizeSheetText(updates.school) : cert.school;
    if (!newFirstName || !newLastName) {
      throw new Error('ชื่อและนามสกุลจำเป็นต้องระบุ');
    }

    const updatedCert = {
      ...cert,
      prefixName: newPrefixName,
      firstName: newFirstName,
      lastName: newLastName,
      school: newSchool,
      originalPrefixName: origPrefix,
      originalFirstName: origFirst,
      originalLastName: origLast,
      updatedAt: now,
      updatedBy: actorEmail
    };

    if (updates.participantStatus !== undefined) {
      const participantStatus = Validation.sanitizeText(updates.participantStatus);
      if (!['เข้าร่วม', 'ผ่านการอบรม'].includes(participantStatus)) {
        throw new Error('participantStatus ต้องเป็น เข้าร่วม หรือ ผ่านการอบรม');
      }
      updatedCert.participantStatus = participantStatus;
    }

    this.saveCertificateRow(updatedCert);
    this.syncParticipantFromCertificate(updatedCert);

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.UPDATE_NAME,
        'Certificate',
        certificateId,
        beforeObj,
        updatedCert,
        `Updated certificate details for ${certificateId}`
      );
    }

    return updatedCert;
  },

  /**
   * Issue certificate (assign certNo if missing, transition status to ISSUED)
   * @param {string} certificateId
   * @param {Array<Object>} [cache] Pre-read registry rows for bulk callers
   * @return {Object}
   */
  issueCertificate(certificateId, cache) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const cert = this.getById(certificateId, cache);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus === Config.CERT_STATUS.ISSUED) {
      return cert;
    }
    if (![Config.CERT_STATUS.DRAFT, Config.CERT_STATUS.PENDING].includes(cert.certificateStatus)) {
      throw new Error(`Cannot issue certificate in status '${cert.certificateStatus}'.`);
    }
    if (!Validation.sanitizeText(cert.firstName) || !Validation.sanitizeText(cert.lastName)) {
      throw new Error('ไม่สามารถออกเกียรติบัตรที่ไม่มีชื่อหรือนามสกุล');
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    let certNo = cert.certificateNo;
    let runningNumber = cert.runningNumber;

    if (certNo) {
      const collision = (cache || this.getAllCertificates()).find(item =>
        item.certificateId !== cert.certificateId &&
        String(item.certificateNo || '').trim() === String(certNo).trim()
      );
      if (collision) throw new Error(`เลขเกียรติบัตร '${certNo}' ซ้ำกับ ${collision.certificateId}`);
    } else if (typeof NumberService !== 'undefined') {
      const generated = NumberService.generateNextNumbers(cert.activityId);
      certNo = generated.certificateNo;
      runningNumber = generated.runningNumber;
    }

    const issuedCert = {
      ...cert,
      certificateNo: certNo,
      runningNumber: runningNumber,
      certificateStatus: Config.CERT_STATUS.ISSUED,
      issuedAt: cert.issuedAt || now,
      issuedBy: cert.issuedBy || actorEmail,
      updatedAt: now,
      updatedBy: actorEmail
    };

    this.saveCertificateRow(issuedCert);

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.ISSUE_CERTIFICATE,
        'Certificate',
        certificateId,
        beforeObj,
        issuedCert,
        `Issued certificate ${certificateId} with certNo ${certNo}`
      );
    }

    return issuedCert;
  },

  /**
   * Revoke certificate
   * @param {string} certificateId
   * @param {string} reason
   * @param {Array<Object>} [cache] Pre-read registry rows for bulk callers
   * @return {Object}
   */
  revokeCertificate(certificateId, reason, cache) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    if (!reason || String(reason).trim() === '') {
      throw new Error('กรุณาระบุเหตุผลการยกเลิกเกียรติบัตร');
    }

    const cert = this.getById(certificateId, cache);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus !== Config.CERT_STATUS.ISSUED) {
      throw new Error(`ยกเลิกได้เฉพาะเกียรติบัตรสถานะ ISSUED (สถานะปัจจุบัน: ${cert.certificateStatus})`);
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    const revokedCert = {
      ...cert,
      certificateStatus: Config.CERT_STATUS.REVOKED,
      revokedAt: now,
      revokedBy: actorEmail,
      revokeReason: Validation.sanitizeText(reason),
      updatedAt: now,
      updatedBy: actorEmail
    };

    this.saveCertificateRow(revokedCert);

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.REVOKE_CERTIFICATE,
        'Certificate',
        certificateId,
        beforeObj,
        revokedCert,
        `Revoked certificate ${certificateId}. Reason: ${reason}`
      );
    }

    return revokedCert;
  },

  /**
   * Bulk issue: assigns numbers to every given certificate under one shared registry read.
   * @param {Array<string>} certificateIds
   * @return {{total: number, successCount: number, failCount: number, results: Array<Object>}}
   */
  issueCertificates(certificateIds) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }
    return this.runBulk(certificateIds, (id, cache) => this.issueCertificate(id, cache));
  },

  /**
   * Bulk revoke: revokes every given certificate under one shared registry read.
   * Never aborts the whole batch on a single bad row — each failure is reported per item.
   * @param {Array<string>} certificateIds
   * @param {string} reason
   * @return {{total: number, successCount: number, failCount: number, results: Array<Object>}}
   */
  revokeCertificates(certificateIds, reason) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }
    if (!reason || String(reason).trim() === '') {
      throw new Error('กรุณาระบุเหตุผลการยกเลิกเกียรติบัตร');
    }
    return this.runBulk(certificateIds, (id, cache) => this.revokeCertificate(id, reason, cache));
  },

  /**
   * Bulk permanent delete (ADMIN only), same per-item error reporting as revokeCertificates.
   * @param {Array<string>} certificateIds
   * @return {{total: number, successCount: number, failCount: number, results: Array<Object>}}
   */
  deleteCertificates(certificateIds) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN]);
    }
    return this.runBulk(certificateIds, (id, cache) => this.deleteCertificate(id, cache));
  },

  /**
   * Shared driver for the bulk actions: one registry read, one pass, per-item outcome.
   * @param {Array<string>} certificateIds
   * @param {Function} handler (certificateId, cache) => void
   * @return {{total: number, successCount: number, failCount: number, results: Array<Object>}}
   */
  runBulk(certificateIds, handler) {
    const ids = (Array.isArray(certificateIds) ? certificateIds : [])
      .map(id => String(id || '').trim())
      .filter(id => id !== '');
    if (!ids.length) {
      throw new Error('กรุณาเลือกเกียรติบัตรอย่างน้อย 1 รายการ');
    }
    if (ids.length > this.MAX_BULK_PER_ROUND) {
      throw new Error(`ดำเนินการได้สูงสุด ${this.MAX_BULK_PER_ROUND} รายการต่อรอบ (ส่งมา ${ids.length} รายการ) กรุณาแบ่งเป็นหลายรอบ`);
    }

    const cache = this.getAllCertificates();
    const results = ids.map(certificateId => {
      try {
        handler(certificateId, cache);
        return { certificateId, success: true, error: '' };
      } catch (err) {
        return { certificateId, success: false, error: err && err.message ? err.message : String(err) };
      }
    });

    const successCount = results.filter(item => item.success).length;
    return { total: results.length, successCount, failCount: results.length - successCount, results };
  },

  /**
   * Reissue a revoked certificate: returns it to DRAFT so it can be issued again,
   * keeping the original certificate number — the number stays bound to this record
   * for life and is only ever given up by deleting the record.
   * @param {string} certificateId
   * @param {string} reason
   * @return {Object}
   */
  reissueCertificate(certificateId, reason) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    if (!reason || String(reason).trim() === '') {
      throw new Error('กรุณาระบุเหตุผลการออกเกียรติบัตรใหม่');
    }

    const cert = this.getById(certificateId);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus !== Config.CERT_STATUS.REVOKED) {
      throw new Error(`ออกใหม่ได้เฉพาะเกียรติบัตรสถานะ REVOKED (สถานะปัจจุบัน: ${cert.certificateStatus})`);
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    const reissuedCert = {
      ...cert,
      certificateStatus: Config.CERT_STATUS.DRAFT,
      // certificateNo / runningNumber are deliberately preserved: reissuing must never
      // consume a new number from the activity range.
      issuedAt: '',
      issuedBy: '',
      revokedAt: '',
      revokedBy: '',
      revokeReason: '',
      updatedAt: now,
      updatedBy: actorEmail
    };

    this.saveCertificateRow(reissuedCert);

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.REISSUE_CERTIFICATE,
        'Certificate',
        certificateId,
        beforeObj,
        reissuedCert,
        `Reissued certificate ${certificateId} keeping certNo ${cert.certificateNo || '-'}. Reason: ${reason}`
      );
    }

    return reissuedCert;
  },

  /**
   * Permanent delete certificate (ADMIN only!)
   * @param {string} certificateId
   * @param {Array<Object>} [cache] Pre-read registry rows for bulk callers
   * @return {Object}
   */
  deleteCertificate(certificateId, cache) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN]);
    }

    const cert = this.getById(certificateId, cache);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (![Config.CERT_STATUS.DRAFT, Config.CERT_STATUS.PENDING, Config.CERT_STATUS.REVOKED].includes(cert.certificateStatus)) {
      throw new Error('เกียรติบัตรที่ยังใช้งานอยู่ (ISSUED) ต้องยกเลิก (REVOKED) ก่อน จึงจะลบถาวรได้');
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    const deletedCert = {
      ...cert,
      certificateStatus: Config.CERT_STATUS.DELETED,
      updatedAt: now,
      updatedBy: actorEmail
    };

    this.saveCertificateRow(deletedCert);

    if (typeof AuditService !== 'undefined') {
      AuditService.log(
        AuditService.ACTIONS.DELETE_CERTIFICATE,
        'Certificate',
        certificateId,
        beforeObj,
        deletedCert,
        `Marked certificate ${certificateId} as DELETED by ADMIN`
      );
    }

    return deletedCert;
  },

  /**
   * Internal helper to persist updated certificate object to sheet row
   * @param {Object} certObj
   */
  saveCertificateRow(certObj) {
    if (typeof SheetService === 'undefined') return;
    const headers = Config.HEADERS.Certificates;
    const rowValues = headers.map(key => certObj[key] !== undefined ? certObj[key] : '');

    const sheet = SheetService.getSheet(Config.SHEETS.CERTIFICATES);
    if (certObj._rowIndex) {
      sheet.getRange(certObj._rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      SheetService.appendRowsBatch(Config.SHEETS.CERTIFICATES, [rowValues]);
    }
  },

  /** Keep the participant registry consistent after certificate corrections. */
  syncParticipantFromCertificate(certObj) {
    if (typeof SheetService === 'undefined' || !certObj.participantId) return;
    const participants = SheetService.readRows(Config.SHEETS.PARTICIPANTS);
    const participant = participants.find(item => String(item.participantId).trim() === String(certObj.participantId).trim());
    if (!participant || !participant._rowIndex) return;
    const updated = {
      ...participant,
      prefixName: certObj.prefixName,
      firstName: certObj.firstName,
      lastName: certObj.lastName,
      school: certObj.school,
      participantStatus: certObj.participantStatus,
      updatedAt: certObj.updatedAt,
      updatedBy: certObj.updatedBy
    };
    const values = Config.HEADERS.Participants.map(key => updated[key] !== undefined ? updated[key] : '');
    SheetService.getSheet(Config.SHEETS.PARTICIPANTS)
      .getRange(participant._rowIndex, 1, 1, values.length)
      .setValues([values]);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateService;
}
