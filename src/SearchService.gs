/**
 * Public Registry Search & Verification Service
 */
const SearchService = {
  /**
   * Search certificates in Public Registry
   * @param {string} activityId Filter by specific activity ID
   * @param {string} query Search query (name, school, or certNo)
   * @param {number} page 1-based page number
   * @param {number} pageSize Results per page (max 50)
   * @return {Object} { results: Array, total: number, page: number, totalPages: number }
   */
  search(activityId, query, page = 1, pageSize = 10) {
    if (typeof CertificateService === 'undefined') {
      return { results: [], total: 0, page: 1, totalPages: 0 };
    }

    const cleanQuery = typeof Validation !== 'undefined'
      ? Validation.normalizeNameForSearch(query)
      : String(query || '').trim().toLowerCase();
    if (cleanQuery.length > 100) throw new Error('คำค้นหายาวเกิน 100 ตัวอักษร');
    if (!activityId && cleanQuery.length < 2) {
      throw new Error('กรุณาระบุคำค้นหาอย่างน้อย 2 ตัวอักษร หรือเลือกกิจกรรม');
    }

    let certs = CertificateService.getCertificates(activityId);

    // Only allow public search on ISSUED certificates
    certs = certs.filter(c => c.certificateStatus === Config.CERT_STATUS.ISSUED);

    if (cleanQuery) {
      certs = certs.filter(c => {
        const fullName = Validation.formatName(c.prefixName, c.firstName, c.lastName);
        const normFullName = Validation.normalizeNameForSearch(fullName);
        const normSchool = Validation.normalizeNameForSearch(c.school);
        const certNo = String(c.certificateNo || '').toLowerCase();

        return normFullName.includes(cleanQuery) ||
               normSchool.includes(cleanQuery) ||
               certNo.includes(cleanQuery);
      });
    }

    const total = certs.length;
    const limit = Math.min(Math.max(1, parseInt(pageSize || 10, 10)), 50);
    const currentPage = Math.max(1, parseInt(page || 1, 10));
    const totalPages = Math.ceil(total / limit);

    const startIndex = (currentPage - 1) * limit;
    const paginatedCerts = certs.slice(startIndex, startIndex + limit);

    // Sanitize results for Public View (exclude internal metadata & Audit details)
    const activityMap = new Map((typeof ActivityService !== 'undefined' ? ActivityService.getActivities() : [])
      .map(activity => [String(activity.activityId).trim(), activity]));
    const results = paginatedCerts.map(c => {
      const activity = activityMap.get(String(c.activityId).trim()) || null;
      return {
        certificateId: c.certificateId,
        activityId: c.activityId,
        activityName: activity ? activity.activityName : '',
        fullName: Validation.formatName(c.prefixName, c.firstName, c.lastName),
        school: c.school,
        certificateNo: c.certificateNo,
        participantStatus: c.participantStatus,
        issueDate: activity ? activity.issueDate : '',
        issueAgency: activity ? activity.issueAgency : '',
        certificateStatus: c.certificateStatus,
        verificationUrl: this.getVerificationUrl(c.certificateId)
      };
    });

    return {
      results,
      total,
      page: currentPage,
      totalPages: totalPages || 1
    };
  },

  /**
   * Verification URL Builder for QR Code
   * @param {string} certificateId
   * @return {string}
   */
  getVerificationUrl(certificateId) {
    const deployedUrl = typeof ScriptApp !== 'undefined' && ScriptApp.getService
      ? ScriptApp.getService().getUrl()
      : '';
    const baseUrl = Config.get(Config.KEYS.WEB_APP_URL) || deployedUrl;
    if (!baseUrl) return '';
    return `${baseUrl.replace(/\/+$/, '')}?page=verify&id=${encodeURIComponent(certificateId)}`;
  },

  /**
   * Verify certificate status by certificateId for QR Code verification page
   * @param {string} certificateId
   * @return {Object} { status, found, valid, certificate: Object|null }
   */
  verify(certificateId) {
    const cleanId = String(certificateId || '').trim();
    if (!cleanId) {
      return { found: false, valid: false, message: 'กรุณาระบุเลข Certificate ID', certificate: null };
    }

    if (typeof CertificateService === 'undefined') {
      return { found: false, valid: false, message: 'System error', certificate: null };
    }

    const cert = CertificateService.getById(cleanId);
    if (!cert) {
      return {
        found: false,
        valid: false,
        status: 'NOT_FOUND',
        message: '✕ ไม่พบข้อมูลเกียรติบัตรในระบบ',
        certificate: null
      };
    }

    const activity = typeof ActivityService !== 'undefined' ? ActivityService.getActivityById(cert.activityId) : null;

    const publicCertRecord = {
      certificateId: cert.certificateId,
      certificateNo: cert.certificateNo || 'ยังไม่ออกเลขที่',
      fullName: Validation.formatName(cert.prefixName, cert.firstName, cert.lastName),
      activityName: activity ? activity.activityName : '',
      issueAgency: activity ? activity.issueAgency : '',
      issueDate: activity ? activity.issueDate : '',
      status: cert.certificateStatus
    };

    if (cert.certificateStatus === Config.CERT_STATUS.ISSUED) {
      return {
        found: true,
        valid: true,
        status: Config.CERT_STATUS.ISSUED,
        message: '✓ เกียรติบัตรถูกต้องและได้รับการยืนยันจากระบบ',
        verificationUrl: this.getVerificationUrl(cleanId),
        certificate: publicCertRecord
      };
    } else if (cert.certificateStatus === Config.CERT_STATUS.REVOKED) {
      return {
        found: true,
        valid: false,
        status: Config.CERT_STATUS.REVOKED,
        message: '⚠ เกียรติบัตรฉบับนี้ถูกยกเลิกแล้ว',
        revokeReason: cert.revokeReason || 'ไม่ระบุเหตุผล',
        revokedAt: cert.revokedAt || '',
        certificate: publicCertRecord
      };
    } else {
      return {
        found: true,
        valid: false,
        status: cert.certificateStatus,
        message: `เกียรติบัตรอยู่ในสถานะ ${cert.certificateStatus}`,
        certificate: publicCertRecord
      };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SearchService;
}
