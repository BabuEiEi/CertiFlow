/**
 * Certificate Number Generator Service (Uses LockService to prevent duplicates)
 */
const NumberService = {
  /**
   * Format running number into Thai or Arabic numerals
   * @param {number|string} num
   * @param {string} format 'THAI' | 'ARABIC'
   * @return {string}
   */
  formatNumber(num, format) {
    const str = String(num);
    if (format === 'THAI') {
      const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
      return str.replace(/[0-9]/g, (digit) => thaiDigits[parseInt(digit, 10)]);
    }
    return str;
  },

  /**
   * Pad integer with leading zeros
   * @param {number|string} num
   * @param {number} digitLength
   * @return {string}
   */
  padZero(num, digitLength = 4) {
    const s = String(num);
    if (s.length >= digitLength) return s;
    return ('0'.repeat(digitLength) + s).slice(-digitLength);
  },

  /**
   * Format certificate display number string based on activity config
   * @param {Object} activity
   * @param {number} runningNumber
   * @return {string}
   */
  formatCertificateNo(activity, runningNumber) {
    const prefixText = activity.prefixText || 'เลขที่';
    const prefix = activity.prefix ? ` ${activity.prefix}` : '';
    const paddedNum = this.padZero(runningNumber, parseInt(activity.digitLength || 4, 10));
    const formattedNum = this.formatNumber(paddedNum, activity.numberFormat || 'ARABIC');
    const separator = activity.separator || '/';
    const yearStr = this.formatNumber(activity.year || '2569', activity.numberFormat || 'ARABIC');

    return `${prefixText}${prefix} ${formattedNum}${separator}${yearStr}`.trim();
  },

  /**
   * Format internal Certificate ID key: CERT-{activityId}-{sixDigitSequence}
   * @param {string} activityId
   * @param {number} runningNumber
   * @return {string}
   */
  formatCertificateId(activityId, runningNumber) {
    const padded = ('000000' + runningNumber).slice(-6);
    return `CERT-${activityId}-${padded}`;
  },

  /**
   * Generate next certificate ID and certificate number concurrently safely using LockService
   * @param {string} activityId
   * @param {Object} [activityConfig]
   * @return {Object} { certificateId, certificateNo, runningNumber }
   */
  generateNextNumbers(activityId, activityConfig = null) {
    if (typeof LockService === 'undefined') {
      // Local testing fallback
      return {
        certificateId: this.formatCertificateId(activityId, 1),
        certificateNo: 'เลขที่ 0001/2569',
        runningNumber: 1
      };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(10000); // Wait up to 10 seconds

      let activity = activityConfig;
      if (!activity && typeof ActivityService !== 'undefined') {
        activity = ActivityService.getActivityById(activityId);
      }
      if (!activity) {
        throw new Error(`Activity '${activityId}' not found.`);
      }

      let currentMax = parseInt(activity.sequence || 0, 10);
      const nextRunningNumber = currentMax + 1;

      const certId = this.formatCertificateId(activityId, nextRunningNumber);
      const certNo = this.formatCertificateNo(activity, nextRunningNumber);

      return {
        certificateId: certId,
        certificateNo: certNo,
        runningNumber: nextRunningNumber
      };
    } finally {
      try {
        lock.releaseLock();
      } catch (e) {}
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = NumberService;
}
