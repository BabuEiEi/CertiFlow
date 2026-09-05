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

    const cleanActivityId = String(activityId || '').trim();
    if (!cleanActivityId || (typeof ActivityService !== 'undefined' && !ActivityService.getActivityById(cleanActivityId))) {
      throw new Error('ไม่พบกิจกรรมสำหรับสร้างคิว');
    }
    const cleanJobType = String(jobType || '').trim().toUpperCase();
    if (cleanJobType !== 'ASSIGN_NUMBER') {
      throw new Error('ขณะนี้ Queue รองรับเฉพาะ ASSIGN_NUMBER; preview/export ให้สร้างแบบ on demand เพื่อไม่เก็บไฟล์ถาวร');
    }
    const firstRow = Validation.parseInteger(startRow || 1, 'startRow', 1, 999999999);
    const available = typeof CertificateService !== 'undefined'
      ? CertificateService.getCertificates(cleanActivityId).length
      : Validation.parseInteger(totalCount || 0, 'totalCount', 1, 999999999);
    const requestedTotal = totalCount
      ? Validation.parseInteger(totalCount, 'totalCount', 1, available || 1)
      : available;
    if (!requestedTotal || firstRow > available) throw new Error('ไม่พบรายการเกียรติบัตรในช่วงที่เลือก');

    const nonce = typeof Utilities !== 'undefined' ? Utilities.getUuid().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    const queueId = `QUEUE-${Date.now()}-${nonce}`;
    const now = new Date().toISOString();

    const job = {
      queueId: queueId,
      activityId: cleanActivityId,
      jobType: cleanJobType,
      startRow: firstRow,
      endRow: firstRow + requestedTotal - 1,
      currentRow: firstRow,
      totalCount: requestedTotal,
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

    if (typeof AuditService !== 'undefined') {
      AuditService.log(AuditService.ACTIONS.CREATE_QUEUE, 'GenerationQueue', queueId, null, job, `Created ${cleanJobType} queue for ${cleanActivityId}`);
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
    const start = parseInt(job.startRow || 1, 10);
    const current = parseInt(job.currentRow || start, 10);
    const processed = Math.max(0, Math.min(total, current - start));
    const progressPercent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 100;

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
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }

    const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    let job;
    try {
      if (lock) lock.waitLock(15000);
      job = this.getJobProgress(queueId);
      if (!job || job.status === 'DONE' || job.status === 'CANCELLED') {
        return job;
      }
      if (job.status === 'RUNNING') return job;
      job.status = 'RUNNING';
      job.updatedAt = new Date().toISOString();
      this.saveJobRow(job);
    } finally {
      if (lock) {
        try { lock.releaseLock(); } catch (e) {}
      }
    }

    const now = new Date().toISOString();
    let current = parseInt(job.currentRow || job.startRow || 1, 10);
    let success = parseInt(job.successCount || 0, 10);
    let fail = parseInt(job.failCount || 0, 10);
    let retries = parseInt(job.retryCount || 0, 10);
    const endRow = parseInt(job.endRow || 0, 10);

    const targetEnd = Math.min(endRow, current + this.BATCH_SIZE - 1);
    let lastError = '';
    const certs = CertificateService.getCertificates(job.activityId);

    for (let i = current; i <= targetEnd; i++) {
      try {
        const targetCert = certs[i - 1];
        if (!targetCert) throw new Error(`ไม่พบ Certificate ลำดับที่ ${i}`);
        if ([Config.CERT_STATUS.DRAFT, Config.CERT_STATUS.PENDING].includes(targetCert.certificateStatus)) {
          CertificateService.issueCertificate(targetCert.certificateId);
        } else if (targetCert.certificateStatus !== Config.CERT_STATUS.ISSUED) {
          throw new Error(`${targetCert.certificateId} อยู่ในสถานะ ${targetCert.certificateStatus}`);
        }
        success++;
      } catch (err) {
        fail++;
        retries++;
        lastError = err.message || String(err);
      }
    }

    current = targetEnd + 1;
    const finalStatus = current > endRow ? 'DONE' : 'WAITING';

    const updatedJob = {
      ...job,
      currentRow: current,
      successCount: success,
      failCount: fail,
      retryCount: retries,
      status: finalStatus,
      lastError,
      updatedAt: now
    };

    const finishLock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
    try {
      if (finishLock) finishLock.waitLock(15000);
      this.saveJobRow(updatedJob);
    } finally {
      if (finishLock) {
        try { finishLock.releaseLock(); } catch (e) {}
      }
    }
    return this.getJobProgress(queueId) || updatedJob;
  },

  cancelJob(queueId) {
    if (typeof AuthService !== 'undefined') {
      AuthService.requireRole([Config.ROLES.ADMIN, Config.ROLES.STAFF]);
    }
    const job = this.getJobProgress(queueId);
    if (!job || job.status === 'DONE') return job;
    job.status = 'CANCELLED';
    job.updatedAt = new Date().toISOString();
    this.saveJobRow(job);
    return job;
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
