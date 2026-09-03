/**
 * Google Slides Template Validation & Inspection Service
 */
const TemplateService = {
  REQUIRED_PLACEHOLDERS: ['{{name}}', '{{certNo}}'],

  /**
   * Validate template slide file and placeholders
   * @param {string} templateId Google Slides Presentation ID
   * @return {Object} Validation result { valid: boolean, errors: Array<string>, details: Object }
   */
  validateTemplate(templateId) {
    const cleanId = String(templateId || '').trim();
    const errors = [];

    if (!cleanId) {
      return { valid: false, errors: ['กรุณาระบุ Google Slides Template ID'] };
    }

    if (typeof SlidesApp === 'undefined') {
      // Local node test environment mock
      return { valid: true, errors: [], details: { templateId: cleanId, slideCount: 1 } };
    }

    try {
      if (typeof DriveApp !== 'undefined') {
        const templateFolderId = Config.get(Config.KEYS.TEMPLATE_FOLDER_ID);
        if (!templateFolderId) return { valid: false, errors: ['กรุณาตั้งค่า TEMPLATE_FOLDER_ID ก่อนใช้งาน Template'] };
        const file = DriveApp.getFileById(cleanId);
        if (file.getMimeType() !== MimeType.GOOGLE_SLIDES) {
          return { valid: false, errors: ['ไฟล์ Template ต้องเป็น Google Slides'] };
        }
        const parents = file.getParents();
        let inApprovedFolder = false;
        while (parents.hasNext()) {
          if (parents.next().getId() === templateFolderId) inApprovedFolder = true;
        }
        if (!inApprovedFolder) return { valid: false, errors: ['Template ต้องอยู่ใน TEMPLATE_FOLDER_ID ที่กำหนด'] };
      }
      const presentation = SlidesApp.openById(cleanId);
      const slides = presentation.getSlides();

      if (!slides || slides.length === 0) {
        errors.push('ไฟล์ Google Slides ต้องมีอย่างน้อย 1 หน้า slide');
        return { valid: false, errors };
      }
      if (slides.length !== 1) {
        errors.push(`Template ต้องมี slide หลักเพียง 1 หน้า (พบ ${slides.length} หน้า)`);
      }

      const mainSlide = slides[0];
      const pageElements = mainSlide.getPageElements();
      let foundNameCount = 0;
      let foundCertNoCount = 0;
      let foundOfficeCount = 0;
      let foundTypeCount = 0;
      let foundQrCount = 0;

      pageElements.forEach(element => {
        if (element.getPageElementType() === SlidesApp.PageElementType.SHAPE) {
          const shape = element.asShape();
          if (shape.getText()) {
            const text = shape.getText().asString();
            if (text.includes('{{name}}')) {
              foundNameCount += (text.match(/\{\{name\}\}/g) || []).length;
            }
            if (text.includes('{{certNo}}')) {
              foundCertNoCount += (text.match(/\{\{certNo\}\}/g) || []).length;
            }
            foundOfficeCount += (text.match(/\{\{office\}\}/g) || []).length;
            foundTypeCount += (text.match(/\{\{type\}\}/g) || []).length;
            foundQrCount += (text.match(/\{\{qr\}\}/g) || []).length;
          }
        }
      });

      if (foundNameCount === 0) {
        errors.push('ไม่พบ placeholder {{name}} บน slide หลัก');
      } else if (foundNameCount > 1) {
        errors.push('พบ placeholder {{name}} ซ้ำมากกว่า 1 ตำแหน่ง');
      }

      if (foundCertNoCount === 0) {
        errors.push('ไม่พบ placeholder {{certNo}} บน slide หลัก');
      } else if (foundCertNoCount > 1) {
        errors.push('พบ placeholder {{certNo}} ซ้ำมากกว่า 1 ตำแหน่ง');
      }

      // {{office}}, {{type}} and {{qr}} are optional, but a duplicate is always a template mistake.
      if (foundOfficeCount > 1) errors.push('พบ placeholder {{office}} ซ้ำมากกว่า 1 ตำแหน่ง');
      if (foundTypeCount > 1) errors.push('พบ placeholder {{type}} ซ้ำมากกว่า 1 ตำแหน่ง');
      if (foundQrCount > 1) errors.push('พบ placeholder {{qr}} ซ้ำมากกว่า 1 ตำแหน่ง');

      return {
        valid: errors.length === 0,
        errors: errors,
        details: {
          templateId: cleanId,
          slideCount: slides.length,
          foundNameCount,
          foundCertNoCount,
          foundOfficeCount,
          foundTypeCount,
          foundQrCount
        }
      };

    } catch (e) {
      return {
        valid: false,
        errors: [`ไม่สามารถเปิด Google Slides Template ได้: ${e.message || String(e)}`]
      };
    }
  },

  /** Create a disposable JPEG preview using representative sample data. */
  createTemplatePreview(activityId) {
    if (typeof AuthService !== 'undefined') AuthService.requireRole([Config.ROLES.ADMIN]);
    const activity = ActivityService.getActivityById(String(activityId || '').trim());
    if (!activity) throw new Error('กรุณาบันทึกกิจกรรมก่อนสร้าง Preview Template');
    if (typeof DriveApp === 'undefined' || typeof SlidesApp === 'undefined') {
      return { filename: `template-preview-${activity.activityId}.jpeg`, mimeType: 'image/jpeg', base64: 'mock_base64_data' };
    }
    const tempFolderId = Config.get(Config.KEYS.TEMP_FOLDER_ID);
    if (!tempFolderId) throw new Error('TEMP_FOLDER_ID is not configured.');
    let tempFile = null;
    try {
      tempFile = DriveApp.getFileById(activity.templateId)
        .makeCopy(`TEMP_PREVIEW_${activity.activityId}_${Utilities.getUuid().slice(0, 8)}`, DriveApp.getFolderById(tempFolderId));
      const presentation = SlidesApp.openById(tempFile.getId());
      presentation.replaceAllText('{{name}}', 'นายตัวอย่าง ระบบทดสอบ');
      presentation.replaceAllText('{{certNo}}', NumberService.formatCertificateNo(activity, activity.startNumber || 1));
      presentation.replaceAllText('{{office}}', 'โรงเรียนตัวอย่างวิทยา');
      presentation.replaceAllText('{{type}}', String(activity.trainingType || 'ด้านการอ่าน'));
      const previewVerificationUrl = typeof SearchService !== 'undefined' ? SearchService.getVerificationUrl(`PREVIEW-${activity.activityId}`) : '';
      ExportService.insertQrCode_(presentation, previewVerificationUrl);
      const slideId = presentation.getSlides()[0].getObjectId();
      presentation.saveAndClose();
      const response = UrlFetchApp.fetch(`https://docs.google.com/presentation/d/${tempFile.getId()}/export/jpeg?id=${tempFile.getId()}&pageid=${slideId}`, {
        headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
        throw new Error(`สร้าง Preview ไม่สำเร็จ (HTTP ${response.getResponseCode()})`);
      }
      const blob = response.getBlob();
      return {
        filename: `template-preview-${activity.activityId}.jpeg`,
        mimeType: blob.getContentType(),
        base64: Utilities.base64Encode(blob.getBytes())
      };
    } finally {
      if (tempFile) {
        try { tempFile.setTrashed(true); } catch (e) {
          if (typeof console !== 'undefined') console.error('Template preview cleanup failed', e);
        }
      }
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemplateService;
}
