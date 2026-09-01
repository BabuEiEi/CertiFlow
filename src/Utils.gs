/**
 * Utility Functions & Standard Response Builders
 */
const Utils = {
  /**
   * Build standard API response
   * @param {boolean} success
   * @param {*} data
   * @param {string|null} error
   * @return {Object}
   */
  buildResponse(success, data = null, error = null) {
    return {
      success: success,
      data: data,
      error: error,
      requestId: Utilities.getUuid()
    };
  },

  sanitizePublicError(error) {
    const message = error && error.message ? error.message : String(error || '');
    if (/(SpreadsheetApp|DriveApp|SlidesApp|UrlFetchApp|Service invoked|Exception:|not configured|HTTP\s*\d{3}|permission|OAuth)/i.test(message)) {
      return 'ระบบไม่สามารถดำเนินการได้ในขณะนี้ กรุณาลองใหม่ภายหลัง';
    }
    return message || 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
  }
};
