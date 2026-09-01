/**
 * On-demand Temporary PDF/JPEG Export Service
 * Strictly creates temporary Google Slides copies and deletes them after returning Blob/URL.
 */
const ExportService = {
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
    const cleanFormat = String(format).toLowerCase() === 'jpeg' ? 'jpeg' : 'pdf';
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
      const tempFolder = tempFolderId ? DriveApp.getFolderById(tempFolderId) : DriveApp.getRootFolder();

      const nonce = Utilities.getUuid().substring(0, 8);
      const tempFileName = `TEMP_${cleanId}_${nonce}`;

      tempCopyFile = templateFile.makeCopy(tempFileName, tempFolder);
      const tempCopyId = tempCopyFile.getId();

      const presentation = SlidesApp.openById(tempCopyId);
      presentation.replaceAllText('{{name}}', fullName);
      presentation.replaceAllText('{{certNo}}', certNo);
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
          // Log cleanup failure gracefully
        }
      }
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ExportService;
}
