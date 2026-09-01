/**
 * Generation Queue & Batch Processing Service
 * Prevents execution timeouts by chunking large operations into manageable batches (default 25 per run).
 */
const QueueService = {
  BATCH_SIZE: 25,

  /**
   * Create new background processing job in GenerationQueue sheet
   * @param {string} activityId
   * @param {string} jobType 'ASSIGN_NUMBER' | 'PREVIEW_BATCH' | 'EXPORT_BATCH'
   * @param {number} totalCount
   * @param {number} [startRow=1]
   * @return {Object} Created queue job
   */
  createJob(activityId, jobType, totalCount, startRow = 1) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const queueId = `QUEUE-${Date.now()}`;
    const now = new Date().toISOString();

    const job = {
      queueId: queueId,
      activityId: activityId,
      jobType: jobType,
      startRow: startRow,
      endRow: totalCount,
      currentRow: startRow,
      totalCount: totalCount,
      successCount: 0,
      failCount: 0,
      status: 'WAITING',
      retryCount: 0,
      lastError: '',
      createdAt: now,
      updatedAt: now
    };

    if (typeof SheetService !== 'undefined') {
      const headers = Config.HEADERS.GenerationQueue;
      const rowValues = headers.map(key => job[key] !== undefined ? job[key] : '');
      SheetService.appendRowsBatch(Config.SHEETS.GENERATION_QUEUE, [rowValues]);
    }

    return job;
  },

  /**
   * Get queue job status by queueId
   * @param {string} queueId
   * @return {Object|null}
   */
  getJobProgress(queueId) {
    if (typeof SheetService === 'undefined') {
      return { queueId, status: 'DONE', progress: 100, successCount: 0, failCount: 0 };
    }

    const rows = SheetService.readRows(Config.SHEETS.GENERATION_QUEUE);
    const job = rows.find(j => String(j.queueId).trim() === String(queueId).trim());
    if (!job) return null;

    const total = parseInt(job.totalCount || 0, 10);
    const current = parseInt(job.currentRow || 0, 10);
    const progressPercent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;

    return {
      ...job,
      progressPercent
    };
  },

  /**
   * Process next batch chunk safely using LockService to prevent worker overlap
   * @param {string} queueId
   * @return {Object} Updated job status
   */
  processNextBatch(queueId) {
    if (typeof LockService === 'undefined') {
      return { queueId, status: 'DONE', progressPercent: 100 };
    }

    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000); // 15s lock limit

      const job = this.getJobProgress(queueId);
      if (!job || job.status === 'DONE' || job.status === 'CANCELLED') {
        return job;
      }

      const now = new Date().toISOString();
      let current = parseInt(job.currentRow || 1, 10);
      let success = parseInt(job.successCount || 0, 10);
      let fail = parseInt(job.failCount || 0, 10);
      const total = parseInt(job.totalCount || 0, 10);

      const targetEnd = Math.min(total, current + this.BATCH_SIZE - 1);
      let lastError = '';

      // Update status to RUNNING
      job.status = 'RUNNING';

      for (let i = current; i <= targetEnd; i++) {
        try {
          if (job.jobType === 'ASSIGN_NUMBER') {
            const certs = CertificateService.getCertificates(job.activityId);
            const targetCert = certs[i - 1];
            if (targetCert && !targetCert.certificateNo) {
              CertificateService.issueCertificate(targetCert.certificateId);
            }
          }
          success++;
        } catch (err) {
          fail++;
          lastError = err.message || String(err);
        }
      }

      current = targetEnd + 1;
      const finalStatus = current > total ? 'DONE' : 'RUNNING';

      const updatedJob = {
        ...job,
        currentRow: Math.min(current, total),
        successCount: success,
        failCount: fail,
        status: finalStatus,
        lastError: lastError,
        updatedAt: now
      };

      this.saveJobRow(updatedJob);

      return {
        ...updatedJob,
        progressPercent: total > 0 ? Math.min(100, Math.round((updatedJob.currentRow / total) * 100)) : 100
      };

    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  },

  /**
   * Helper to persist updated job row
   * @param {Object} jobObj
   */
  saveJobRow(jobObj) {
    if (typeof SheetService === 'undefined') return;
    const headers = Config.HEADERS.GenerationQueue;
    const rowValues = headers.map(key => jobObj[key] !== undefined ? jobObj[key] : '');

    const sheet = SheetService.getSheet(Config.SHEETS.GENERATION_QUEUE);
    if (jobObj._rowIndex) {
      sheet.getRange(jobObj._rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = QueueService;
}
