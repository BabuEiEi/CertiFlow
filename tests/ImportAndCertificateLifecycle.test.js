/**
 * Unit tests for Participant import validation & Certificate lifecycle management
 */
const assert = require('node:assert/strict');
global.Config = require('../src/Config.gs');
global.Validation = require('../src/Validation.gs');
const ParticipantService = require('../src/ParticipantService.gs');
const CertificateService = require('../src/CertificateService.gs');

function testImportValidationAndDuplicates() {
  const rows = [
    { prefixName: 'นาย', firstName: 'ภัทรพล', lastName: 'แก้วเสนา', school: 'โรงเรียนสาธิต', participantStatus: 'ผ่านการอบรม' },
    { prefixName: 'นาย', firstName: 'ภัทรพล', lastName: 'แก้วเสนา', school: 'โรงเรียนสาธิต', participantStatus: 'ผ่านการอบรม' }, // Duplicate in payload
    { prefixName: '', firstName: '', lastName: 'สมชาย', school: 'โรงเรียนอนุบาล', participantStatus: 'เข้าร่วม' } // Invalid missing firstName
  ];

  const res = ParticipantService.validateImport('ACT001', rows);

  assert.ok(res.summary.total === 3, 'Total import count mismatch');
  assert.ok(res.summary.valid === 1, 'Valid import count mismatch');
  assert.ok(res.summary.duplicate === 1, 'Duplicate import count mismatch');
  assert.ok(res.summary.error === 1, 'Error import count mismatch');
  const invalidStatus = ParticipantService.validateImport('ACT001', [{ firstName: 'A', lastName: 'B', participantStatus: 'UNKNOWN' }]);
  assert.equal(invalidStatus.summary.error, 1);
  console.log('Import validation and duplicate detection test passed.');
}

function testCertificateLifecycleAndOriginalName() {
  const mockCert = {
    _rowIndex: 2,
    certificateId: 'CERT-ACT001-000001',
    activityId: 'ACT001',
    participantId: 'PAR-ACT001-000001',
    certificateNo: 'เลขที่ 0001/2569',
    runningNumber: 1,
    prefixName: 'นาย',
    firstName: 'ภัทรพล',
    lastName: 'แก้วเสนา',
    school: 'โรงเรียนเดิม',
    participantStatus: 'ผ่านการอบรม',
    certificateStatus: Config.CERT_STATUS.ISSUED,
    originalPrefixName: '',
    originalFirstName: '',
    originalLastName: ''
  };

  // Mock CertificateService.getAllCertificates for local node testing
  CertificateService.getAllCertificates = () => [mockCert];
  CertificateService.saveCertificateRow = () => {};

  const updated = CertificateService.updateCertificate('CERT-ACT001-000001', {
    prefixName: 'ดร.',
    firstName: 'ภัทรพล',
    lastName: 'แก้วเสนาพร'
  });

  assert.ok(updated.prefixName === 'ดร.', 'Updated prefixName mismatch');
  assert.ok(updated.lastName === 'แก้วเสนาพร', 'Updated lastName mismatch');
  assert.ok(updated.originalPrefixName === 'นาย', 'Original prefixName not preserved');
  assert.ok(updated.originalLastName === 'แก้วเสนา', 'Original lastName not preserved');

  // Test revocation
  const revoked = CertificateService.revokeCertificate('CERT-ACT001-000001', 'สะกดชื่อผิดร้ายแรง');
  assert.ok(revoked.certificateStatus === Config.CERT_STATUS.REVOKED, 'Status should be REVOKED');
  assert.ok(revoked.revokeReason === 'สะกดชื่อผิดร้ายแรง', 'Revoke reason mismatch');
  CertificateService.getAllCertificates = () => [{ ...mockCert, certificateStatus: Config.CERT_STATUS.DRAFT }];
  assert.throws(() => CertificateService.revokeCertificate('CERT-ACT001-000001', 'ไม่ควรได้'), /เฉพาะเกียรติบัตรสถานะ ISSUED/);
  CertificateService.getAllCertificates = () => [{ ...mockCert, certificateStatus: Config.CERT_STATUS.ISSUED }];
  assert.throws(() => CertificateService.deleteCertificate('CERT-ACT001-000001'), /ต้องใช้ REVOKED/);

  console.log('Certificate lifecycle and original name test passed.');
}

function testCertificateReissue() {
  const revokedCert = {
    _rowIndex: 2,
    certificateId: 'CERT-ACT001-000001',
    activityId: 'ACT001',
    participantId: 'PAR-ACT001-000001',
    certificateNo: 'เลขที่ 0001/2569',
    runningNumber: 1,
    prefixName: 'นาย',
    firstName: 'ภัทรพล',
    lastName: 'แก้วเสนา',
    school: 'โรงเรียนเดิม',
    participantStatus: 'ผ่านการอบรม',
    certificateStatus: Config.CERT_STATUS.REVOKED,
    revokedAt: '2026-01-01T00:00:00.000Z',
    revokedBy: 'admin@test.com',
    revokeReason: 'สะกดชื่อผิดร้ายแรง'
  };

  CertificateService.getAllCertificates = () => [revokedCert];
  CertificateService.saveCertificateRow = () => {};

  assert.throws(() => CertificateService.reissueCertificate('CERT-ACT001-000001', ''), /กรุณาระบุเหตุผล/);

  const reissued = CertificateService.reissueCertificate('CERT-ACT001-000001', 'ออกให้ใหม่ตามคำร้อง');
  assert.equal(reissued.certificateStatus, Config.CERT_STATUS.DRAFT, 'Status should return to DRAFT');
  assert.equal(reissued.certificateNo, '', 'certificateNo should be cleared for reallocation');
  assert.equal(reissued.revokedAt, '', 'revokedAt should be cleared');
  assert.equal(reissued.revokeReason, '', 'revokeReason should be cleared');

  CertificateService.getAllCertificates = () => [{ ...revokedCert, certificateStatus: Config.CERT_STATUS.ISSUED }];
  assert.throws(() => CertificateService.reissueCertificate('CERT-ACT001-000001', 'ไม่ควรได้'), /เฉพาะเกียรติบัตรสถานะ REVOKED/);

  console.log('Certificate reissue test passed.');
}

testImportValidationAndDuplicates();
testCertificateLifecycleAndOriginalName();
testCertificateReissue();
