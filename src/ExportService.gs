/**
 * On-demand Temporary PDF/JPEG Export Service
 * Strictly creates temporary Google Slides copies and deletes them after returning Blob/URL.
 */
const ExportService = {
  RATE_LIMIT_PER_MINUTE: 10,

  enforceRateLimit_(certificateId) {
    if (typeof CacheService === 'undefined') return;
    const clientKey = typeof Session !== 'undefined' && Session.getTemporaryActiveUserKey
      ? (Session.getTemporaryActiveUserKey() || 'anonymous')
      : 'anonymous';
    const key = `export:${clientKey}:${certificateId}`;
    const cache = CacheService.getScriptCache();
    const count = parseInt(cache.get(key) || 0, 10) + 1;
    if (count > this.RATE_LIMIT_PER_MINUTE) {
      throw new Error('เรียกสร้างไฟล์ถี่เกินไป กรุณารอประมาณ 1 นาทีแล้วลองใหม่');
    }
    cache.put(key, String(count), 60);
  },
  /**
   * Helper to format filename safely
   * @param {string} certificateId
   * @param {string} fullName
   * @param {string} ext
   * @return {string}
   */
  formatOutputFilename(certificateId, fullName, ext) {
    const cleanName = String(fullName || 'Certificate')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '_');
    return `เกียรติบัตร_${cleanName}_${certificateId}.${ext}`;
  },

  /**
   * Generate temporary preview or export blob / base64 payload
   * @param {string} certificateId
   * @param {string} format 'pdf' | 'jpeg'
   * @return {Object} { filename, mimeType, base64 }
   */
  generateExportBlob(certificateId, format = 'pdf') {
    const cleanId = String(certificateId || '').trim();
    if (!cleanId) {
      throw new Error('กรุณาระบุ certificateId');
    }
    this.enforceRateLimit_(cleanId);

    if (typeof CertificateService === 'undefined') {
      throw new Error('CertificateService is required');
    }

    const cert = CertificateService.getById(cleanId);
    if (!cert) {
      throw new Error(`ไม่พบข้อมูลเกียรติบัตร '${cleanId}'`);
    }

    if (cert.certificateStatus !== Config.CERT_STATUS.ISSUED) {
      throw new Error(`ไม่อนุญาตให้ดาวน์โหลด: เกียรติบัตรอยู่ในสถานะ '${cert.certificateStatus}'`);
    }

    const activity = ActivityService.getActivityById(cert.activityId);
    if (!activity || !activity.templateId) {
      throw new Error(`ไม่พบ Template สำหรับกิจกรรม '${cert.activityId}'`);
    }

    const fullName = Validation.formatName(cert.prefixName, cert.firstName, cert.lastName);
    const certNo = cert.certificateNo;
    const cleanFormat = String(format || 'pdf').toLowerCase();
    if (!['pdf', 'jpeg'].includes(cleanFormat)) {
      throw new Error('format ต้องเป็น pdf หรือ jpeg');
    }
    const outputFilename = this.formatOutputFilename(cleanId, fullName, cleanFormat);

    if (typeof DriveApp === 'undefined' || typeof SlidesApp === 'undefined') {
      // Local Node test mock fallback
      return {
        filename: outputFilename,
        mimeType: cleanFormat === 'jpeg' ? 'image/jpeg' : 'application/pdf',
        base64: 'mock_base64_data'
      };
    }

    let tempCopyFile = null;

    try {
      const templateFile = DriveApp.getFileById(activity.templateId);
      const tempFolderId = Config.get(Config.KEYS.TEMP_FOLDER_ID);
      if (!tempFolderId) throw new Error('TEMP_FOLDER_ID is not configured.');
      const tempFolder = DriveApp.getFolderById(tempFolderId);

      const nonce = Utilities.getUuid().substring(0, 8);
      const tempFileName = `TEMP_${cleanId}_${nonce}`;

      tempCopyFile = templateFile.makeCopy(tempFileName, tempFolder);
      const tempCopyId = tempCopyFile.getId();

      const presentation = SlidesApp.openById(tempCopyId);
      presentation.replaceAllText('{{name}}', fullName);
      presentation.replaceAllText('{{certNo}}', certNo);
      // Optional placeholders — a template that does not use them is unaffected.
      presentation.replaceAllText('{{office}}', String(cert.school || ''));
      presentation.replaceAllText('{{type}}', String(cert.trainingType || activity.trainingType || ''));
      presentation.saveAndClose();

      let exportBlob;
      if (cleanFormat === 'jpeg') {
        const slideId = presentation.getSlides()[0].getObjectId();
        const url = `https://docs.google.com/presentation/d/${tempCopyId}/export/jpeg?id=${tempCopyId}&pageid=${slideId}`;
        const options = {
          headers: {
            Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
          },
          muteHttpExceptions: true
        };
        const response = UrlFetchApp.fetch(url, options);
        const responseCode = response.getResponseCode();
        if (responseCode < 200 || responseCode >= 300) {
          throw new Error(`สร้าง JPEG ไม่สำเร็จ (HTTP ${responseCode})`);
        }
        exportBlob = response.getBlob().setName(outputFilename);
      } else {
        exportBlob = tempCopyFile.getBlob().getAs('application/pdf').setName(outputFilename);
      }

      const base64Data = Utilities.base64Encode(exportBlob.getBytes());

      return {
        filename: outputFilename,
        mimeType: exportBlob.getContentType(),
        base64: base64Data
      };

    } finally {
      if (tempCopyFile) {
        try {
          tempCopyFile.setTrashed(true);
        } catch (cleanupErr) {
          if (typeof console !== 'undefined') console.error('Temporary export cleanup failed', cleanupErr);
        }
      }
    }
  },

  /** Safety net for copies left behind by an interrupted Apps Script run. */
  cleanupStaleTemporaryFiles(maxAgeMinutes = 120) {
    if (typeof DriveApp === 'undefined') return { trashed: 0 };
    const folderId = Config.get(Config.KEYS.TEMP_FOLDER_ID);
    if (!folderId) throw new Error('TEMP_FOLDER_ID is not configured.');
    const cutoff = Date.now() - (Math.max(30, Number(maxAgeMinutes) || 120) * 60 * 1000);
    const files = DriveApp.getFolderById(folderId).getFiles();
    let trashed = 0;
    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if ((name.startsWith('TEMP_') || name.startsWith('TEMP_PREVIEW_')) && file.getDateCreated().getTime() < cutoff) {
        file.setTrashed(true);
        trashed++;
      }
    }
    return { trashed };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportService;
}
