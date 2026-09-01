/**
 * Unit tests for Participant import validation & Certificate lifecycle management
 */
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

  console.assert(res.summary.total === 3, 'Total import count mismatch');
  console.assert(res.summary.valid === 1, 'Valid import count mismatch');
  console.assert(res.summary.duplicate === 1, 'Duplicate import count mismatch');
  console.assert(res.summary.error === 1, 'Error import count mismatch');
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

  console.assert(updated.prefixName === 'ดร.', 'Updated prefixName mismatch');
  console.assert(updated.lastName === 'แก้วเสนาพร', 'Updated lastName mismatch');
  console.assert(updated.originalPrefixName === 'นาย', 'Original prefixName not preserved');
  console.assert(updated.originalLastName === 'แก้วเสนา', 'Original lastName not preserved');

  // Test revocation
  const revoked = CertificateService.revokeCertificate('CERT-ACT001-000001', 'สะกดชื่อผิดร้ายแรง');
  console.assert(revoked.certificateStatus === Config.CERT_STATUS.REVOKED, 'Status should be REVOKED');
  console.assert(revoked.revokeReason === 'สะกดชื่อผิดร้ายแรง', 'Revoke reason mismatch');

  console.log('Certificate lifecycle and original name test passed.');
}

testImportValidationAndDuplicates();
testCertificateLifecycleAndOriginalName();
