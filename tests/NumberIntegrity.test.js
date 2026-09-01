const assert = require('node:assert/strict');
global.Config = require('../src/Config.gs');
global.Validation = require('../src/Validation.gs');

const activity = {
  activityId: 'ACT001', sequence: 2220, startNumber: 2221, endNumber: 2222,
  prefixText: 'เลขที่', prefix: 'TEST', digitLength: 4, separator: '/',
  year: '2569', numberFormat: 'ARABIC', _rowIndex: 2
};
const certificates = [];
global.LockService = {
  getScriptLock() { return { waitLock() {}, releaseLock() {} }; }
};
global.ActivityService = {
  getActivityById() { return activity; },
  updateSequence(id, value) { assert.equal(id, 'ACT001'); activity.sequence = value; }
};
global.CertificateService = { getAllCertificates() { return certificates; } };

const NumberService = require('../src/NumberService.gs');

const first = NumberService.generateNextNumbers('ACT001');
assert.equal(first.runningNumber, 2221);
assert.equal(first.certificateNo, 'เลขที่ TEST 2221/2569');
certificates.push({ activityId: 'ACT001', certificateId: 'CERT-ACT001-000001', runningNumber: 2221, certificateNo: first.certificateNo, certificateStatus: 'ISSUED' });

// Even with a stale sequence, the registry collision/max check must advance.
activity.sequence = 0;
const second = NumberService.generateNextNumbers('ACT001');
assert.equal(second.runningNumber, 2222);
certificates.push({ activityId: 'ACT001', certificateId: 'CERT-ACT001-000002', runningNumber: 2222, certificateNo: second.certificateNo, certificateStatus: 'REVOKED' });

assert.throws(() => NumberService.generateNextNumbers('ACT001'), /เกิน endNumber/);
console.log('Number allocation integrity tests passed.');
