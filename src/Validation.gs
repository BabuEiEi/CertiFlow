/**
 * Input & Data Sanitization & Validation Helpers
 */
const Validation = {
  /**
   * Sanitize text input (trim whitespace and normalize multiple spaces)
   * @param {string} str
   * @return {string}
   */
  sanitizeText(str) {
    if (str === null || str === undefined) return '';
    return String(str).trim().replace(/\s+/g, ' ');
  },

  /**
   * Format full name from prefixName, firstName, lastName
   * @param {string} prefixName
   * @param {string} firstName
   * @param {string} lastName
   * @return {string}
   */
  formatName(prefixName, firstName, lastName) {
    const p = this.sanitizeText(prefixName);
    const f = this.sanitizeText(firstName);
    const l = this.sanitizeText(lastName);
    return `${p}${f} ${l}`.trim();
  },

  /**
   * Normalize name string for flexible search matching (strips Thai honorific prefixes and extra spaces)
   * @param {string} str
   * @return {string}
   */
  normalizeNameForSearch(str) {
    const text = this.sanitizeText(str).toLowerCase();
    return text
      .replace(/^(นาย|นางสาว|นาง|น\.ส\.|ว่าที่ ?พ?ต?ร?\.?ต?\.?|ดร\.|ผศ\.|รศ\.|ศ\.)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Validate email format
   * @param {string} email
   * @return {boolean}
   */
  isValidEmail(email) {
    if (!email) return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email).trim().toLowerCase());
  },

  /**
   * Check if required fields exist in object
   * @param {Object} obj
   * @param {Array<string>} requiredFields
   * @return {Object} { valid: boolean, missing: Array<string> }
   */
  validateRequiredFields(obj, requiredFields) {
    const missing = [];
    if (!obj) {
      return { valid: false, missing: requiredFields };
    }
    requiredFields.forEach(field => {
      if (obj[field] === undefined || obj[field] === null || String(obj[field]).trim() === '') {
        missing.push(field);
      }
    });
    return {
      valid: missing.length === 0,
      missing: missing
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Validation;
}
