/**
 * Certificate Registry & Lifecycle State Management Service
 */
const CertificateService = {
  /**
   * Get all certificates
   * @return {Array<Object>}
   */
  getAllCertificates() {
    if (typeof SheetService === 'undefined') return [];
    try {
      return SheetService.readRows(Config.SHEETS.CERTIFICATES);
    } catch (e) {
      return [];
    }
  },

  /**
   * Get certificate by ID
   * @param {string} certificateId
   * @return {Object|null}
   */
  getById(certificateId) {
    const certs = this.getAllCertificates();
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

    const newPrefixName = updates.prefixName !== undefined ? Validation.sanitizeText(updates.prefixName) : cert.prefixName;
    const newFirstName = updates.firstName !== undefined ? Validation.sanitizeText(updates.firstName) : cert.firstName;
    const newLastName = updates.lastName !== undefined ? Validation.sanitizeText(updates.lastName) : cert.lastName;
    const newSchool = updates.school !== undefined ? Validation.sanitizeText(updates.school) : cert.school;

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

    if (updates.participantStatus) {
      updatedCert.participantStatus = updates.participantStatus;
    }

    this.saveCertificateRow(updatedCert);

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
   * @return {Object}
   */
  issueCertificate(certificateId) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const cert = this.getById(certificateId);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus === Config.CERT_STATUS.REVOKED || cert.certificateStatus === Config.CERT_STATUS.DELETED) {
      throw new Error(`Cannot issue certificate in status '${cert.certificateStatus}'.`);
    }

    const beforeObj = JSON.parse(JSON.stringify(cert));
    const now = new Date().toISOString();
    const actorEmail = typeof AuthService !== 'undefined' ? AuthService.getCurrentUserEmail() : 'SYSTEM';

    let certNo = cert.certificateNo;
    let runningNumber = cert.runningNumber;

    if (!certNo && typeof NumberService !== 'undefined') {
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
   * @return {Object}
   */
  revokeCertificate(certificateId, reason) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    if (!reason || String(reason).trim() === '') {
      throw new Error('กรุณาระบุเหตุผลการยกเลิกเกียรติบัตร');
    }

    const cert = this.getById(certificateId);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
    }

    if (cert.certificateStatus === Config.CERT_STATUS.DELETED) {
      throw new Error(`Certificate '${certificateId}' is already deleted.`);
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
   * Permanent delete certificate (ADMIN only!)
   * @param {string} certificateId
   * @return {Object}
   */
  deleteCertificate(certificateId) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN]);
    }

    const cert = this.getById(certificateId);
    if (!cert) {
      throw new Error(`Certificate '${certificateId}' not found.`);
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
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CertificateService;
}
