const assert = require('node:assert/strict');
global.Config = require('../src/Config.gs');
global.Validation = require('../src/Validation.gs');
global.LockService = { getScriptLock() { return { waitLock() {}, releaseLock() {} }; } };
global.ActivityService = { getActivityById() { return { activityId: 'ACT001' }; } };

const certificates = [1, 2, 3].map(index => ({
  certificateId: `CERT-ACT001-${String(index).padStart(6, '0')}`,
  activityId: 'ACT001', certificateStatus: Config.CERT_STATUS.DRAFT
}));
global.CertificateService = {
  getCertificates() { return certificates; },
  issueCertificate(id) {
    const cert = certificates.find(item => item.certificateId === id);
    cert.certificateStatus = Config.CERT_STATUS.ISSUED;
    return cert;
  }
};

const jobs = [];
global.SheetService = {
  appendRowsBatch(sheetName, matrix) {
    assert.equal(sheetName, Config.SHEETS.GENERATION_QUEUE);
    matrix.forEach(values => {
      const job = { _rowIndex: jobs.length + 2 };
      Config.HEADERS.GenerationQueue.forEach((header, index) => { job[header] = values[index]; });
      jobs.push(job);
    });
  },
  readRows() { return jobs; },
  getSheet() {
    return { getRange(rowIndex) { return { setValues(matrix) {
      const updated = { _rowIndex: rowIndex };
      Config.HEADERS.GenerationQueue.forEach((header, index) => { updated[header] = matrix[0][index]; });
      jobs[rowIndex - 2] = updated;
    } }; } };
  }
};

const QueueService = require('../src/QueueService.gs');
QueueService.BATCH_SIZE = 2;
const created = QueueService.createJob('ACT001', 'ASSIGN_NUMBER');
assert.equal(created.totalCount, 3);

const firstPass = QueueService.processNextBatch(created.queueId);
assert.equal(firstPass.status, 'WAITING');
assert.equal(firstPass.successCount, 2);
assert.equal(firstPass.progressPercent, 67);

const finished = QueueService.processNextBatch(created.queueId);
assert.equal(finished.status, 'DONE');
assert.equal(finished.successCount, 3);
assert.equal(finished.progressPercent, 100);
assert.ok(certificates.every(cert => cert.certificateStatus === Config.CERT_STATUS.ISSUED));
console.log('Queue resume tests passed.');
