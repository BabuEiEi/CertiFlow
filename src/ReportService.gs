const ReportService = {
  submit(certificateId, message, contact) {
    const cleanId = String(certificateId || '').trim();
    const cert = CertificateService.getById(cleanId);
    if (!cert || cert.certificateStatus === Config.CERT_STATUS.DELETED) throw new Error('ไม่พบเกียรติบัตรที่ต้องการแจ้ง');
    const cleanMessage = Validation.sanitizeSheetText(message);
    const cleanContact = Validation.sanitizeSheetText(contact);
    if (cleanMessage.length < 10 || cleanMessage.length > 1000) throw new Error('รายละเอียดต้องมีความยาว 10-1,000 ตัวอักษร');
    if (cleanContact.length > 200) throw new Error('ข้อมูลติดต่อยาวเกินกำหนด');
    this.enforceRateLimit_(cleanId);
    const nonce = typeof Utilities !== 'undefined' ? Utilities.getUuid().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    const report = {
      reportId: `REPORT-${Date.now()}-${nonce}`,
      certificateId: cleanId,
      message: cleanMessage,
      contact: cleanContact,
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      resolvedAt: '',
      resolvedBy: ''
    };
    const values = Config.HEADERS.CertificateReports.map(key => report[key]);
    SheetService.appendRowsBatch(Config.SHEETS.CERTIFICATE_REPORTS, [values]);
    return { reportId: report.reportId, status: report.status };
  },

  enforceRateLimit_(certificateId) {
    if (typeof CacheService === 'undefined') return;
    const client = typeof Session !== 'undefined' && Session.getTemporaryActiveUserKey
      ? (Session.getTemporaryActiveUserKey() || 'anonymous') : 'anonymous';
    const key = `report:${client}:${certificateId}`;
    const cache = CacheService.getScriptCache();
    const count = parseInt(cache.get(key) || 0, 10) + 1;
    if (count > 3) throw new Error('ส่งรายงานถี่เกินไป กรุณาลองใหม่ภายหลัง');
    cache.put(key, String(count), 3600);
  },

  list() {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    return SheetService.readRows(Config.SHEETS.CERTIFICATE_REPORTS).slice(-200).reverse();
  },

  resolve(reportId) {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    const report = SheetService.readRows(Config.SHEETS.CERTIFICATE_REPORTS)
      .find(item => String(item.reportId).trim() === String(reportId || '').trim());
    if (!report || !report._rowIndex) throw new Error('ไม่พบรายงาน');
    report.status = 'RESOLVED';
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = AuthService.getCurrentUserEmail();
    const values = Config.HEADERS.CertificateReports.map(key => report[key] !== undefined ? report[key] : '');
    SheetService.getSheet(Config.SHEETS.CERTIFICATE_REPORTS).getRange(report._rowIndex, 1, 1, values.length).setValues([values]);
    return report;
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ReportService;
