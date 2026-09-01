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
      const presentation = SlidesApp.openById(cleanId);
      const slides = presentation.getSlides();

      if (!slides || slides.length === 0) {
        errors.push('ไฟล์ Google Slides ต้องมีอย่างน้อย 1 หน้า slide');
        return { valid: false, errors };
      }

      const mainSlide = slides[0];
      const pageElements = mainSlide.getPageElements();
      let foundNameCount = 0;
      let foundCertNoCount = 0;

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

      return {
        valid: errors.length === 0,
        errors: errors,
        details: {
          templateId: cleanId,
          slideCount: slides.length,
          foundNameCount,
          foundCertNoCount
        }
      };

    } catch (e) {
      return {
        valid: false,
        errors: [`ไม่สามารถเปิด Google Slides Template ได้: ${e.message || String(e)}`]
      };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = TemplateService;
}
