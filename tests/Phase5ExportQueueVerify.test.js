/**
 * Integration & Unit tests for Phase 5 (Export, Queue, Search & Verify)
 */
const assert = require('node:assert/strict');
global.Config = require('../src/Config.gs');
global.Validation = require('../src/Validation.gs');
global.CertificateService = require('../src/CertificateService.gs');
global.ActivityService = require('../src/ActivityService.gs');
const ExportService = require('../src/ExportService.gs');
const QueueService = require('../src/QueueService.gs');
const SearchService = require('../src/SearchService.gs');

function testExportFilenameSanitize() {
  const filenamePdf = ExportService.formatOutputFilename('CERT-ACT001-000001', 'นายภัทรพล แก้วเสนา', 'pdf');
  assert.ok(filenamePdf === 'เกียรติบัตร_นายภัทรพล_แก้วเสนา_CERT-ACT001-000001.pdf', `PDF filename mismatch: ${filenamePdf}`);

  const filenameJpeg = ExportService.formatOutputFilename('CERT-ACT001-000001', 'ดร.สมชาย / ใจดี', 'jpeg');
  assert.ok(filenameJpeg === 'เกียรติบัตร_ดร.สมชาย_ใจดี_CERT-ACT001-000001.jpeg', `JPEG filename mismatch: ${filenameJpeg}`);
  console.log('ExportService filename sanitization test passed.');
}

function testVerificationAndSearchLogic() {
  const mockIssuedCert = {
    certificateId: 'CERT-ACT001-000001',
    activityId: 'ACT001',
    prefixName: 'นาย',
    firstName: 'ภัทรพล',
    lastName: 'แก้วเสนา',
    school: 'โรงเรียนสาธิต',
    certificateNo: 'เลขที่ 0001/2569',
    certificateStatus: Config.CERT_STATUS.ISSUED
  };

  const mockRevokedCert = {
    certificateId: 'CERT-ACT001-000002',
    activityId: 'ACT001',
    prefixName: 'นาย',
    firstName: 'สมศักดิ์',
    lastName: 'รักดี',
    school: 'โรงเรียนอนุบาล',
    certificateNo: 'เลขที่ 0002/2569',
    certificateStatus: Config.CERT_STATUS.REVOKED,
    revokeReason: 'ข้อมูลผิดพลาด'
  };

  CertificateService.getById = (id) => {
    if (id === 'CERT-ACT001-000001') return mockIssuedCert;
    if (id === 'CERT-ACT001-000002') return mockRevokedCert;
    return null;
  };

  CertificateService.getCertificates = () => [mockIssuedCert, mockRevokedCert];
  ActivityService.getActivityById = () => ({ activityName: 'อบรม PISA', organizer: 'สพม.', issueAgency: 'สพม.', issueDate: '2569' });

  // Test Verify ISSUED
  const verifyIssued = SearchService.verify('CERT-ACT001-000001');
  assert.ok(verifyIssued.valid === true, 'Issued certificate should be valid');
  assert.ok(verifyIssued.status === Config.CERT_STATUS.ISSUED, 'Verify status mismatch');

  // Test Verify REVOKED
  const verifyRevoked = SearchService.verify('CERT-ACT001-000002');
  assert.ok(verifyRevoked.valid === false, 'Revoked certificate should be invalid');
  assert.ok(verifyRevoked.status === Config.CERT_STATUS.REVOKED, 'Verify revoked status mismatch');

  // Test Verify NOT_FOUND
  const verifyNotFound = SearchService.verify('CERT-UNKNOWN');
  assert.ok(verifyNotFound.found === false, 'Unknown cert should not be found');

  // Test Public Search
  const searchRes = SearchService.search('ACT001', 'ภัทรพล');
  assert.ok(searchRes.total === 1, 'Search total mismatch');
  assert.ok(searchRes.results[0].fullName === 'นายภัทรพล แก้วเสนา', 'Search result fullName mismatch');

  console.log('SearchService and Verification test passed.');
}

testExportFilenameSanitize();
testVerificationAndSearchLogic();
