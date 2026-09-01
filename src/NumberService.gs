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
      const localActivity = activityConfig || {};
      const start = parseInt(localActivity.startNumber === undefined ? 1 : localActivity.startNumber, 10);
      const current = parseInt(localActivity.sequence === undefined || localActivity.sequence === '' ? start - 1 : localActivity.sequence, 10);
      const next = current + 1;
      return {
        certificateId: this.formatCertificateId(activityId, next),
        certificateNo: this.formatCertificateNo(localActivity, next),
        runningNumber: next
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

      const startNumber = Validation.parseInteger(activity.startNumber === '' || activity.startNumber === undefined ? 1 : activity.startNumber, 'startNumber', 0, 999999999);
      const endNumber = Validation.parseInteger(activity.endNumber === '' || activity.endNumber === undefined ? 9999 : activity.endNumber, 'endNumber', startNumber, 999999999);
      const certificates = typeof CertificateService !== 'undefined'
        ? CertificateService.getAllCertificates().filter(c => String(c.activityId).trim() === String(activityId).trim())
        : [];
      const maxAssigned = certificates.reduce((max, cert) => {
        if (!cert.certificateNo) return max;
        const value = parseInt(cert.runningNumber, 10);
        return Number.isFinite(value) ? Math.max(max, value) : max;
      }, startNumber - 1);
      const storedSequence = parseInt(activity.sequence === '' || activity.sequence === undefined ? startNumber - 1 : activity.sequence, 10);
      let nextRunningNumber = Math.max(startNumber - 1, storedSequence, maxAssigned) + 1;
      let certNo = this.formatCertificateNo(activity, nextRunningNumber);
      const existingNumbers = new Set(certificates
        .filter(cert => cert.certificateNo)
        .map(cert => String(cert.certificateNo).trim()));
      while (existingNumbers.has(certNo) && nextRunningNumber <= endNumber) {
        nextRunningNumber++;
        certNo = this.formatCertificateNo(activity, nextRunningNumber);
      }
      if (nextRunningNumber > endNumber) {
        throw new Error(`เลขเกียรติบัตรของกิจกรรม '${activityId}' เกิน endNumber (${endNumber}) แล้ว`);
      }

      const certId = this.formatCertificateId(activityId, nextRunningNumber);
      if (typeof ActivityService !== 'undefined' && ActivityService.updateSequence) {
        ActivityService.updateSequence(activityId, nextRunningNumber);
      }

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
