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

function testImportCarriesSchoolAndTrainingType() {
  const rows = [
    { prefixName: 'นาย', firstName: 'ภัทรพล', lastName: 'แก้วเสนา', school: 'โรงเรียนสาธิต', trainingType: 'ด้านการอ่าน', participantStatus: 'ผ่านการอบรม' },
    { prefixName: 'นางสาว', firstName: 'สมหญิง', lastName: 'รักดี', school: 'โรงเรียนอนุบาล', participantStatus: 'เข้าร่วม' }
  ];

  const validated = ParticipantService.validateImport('ACT001', rows);
  assert.equal(validated.summary.valid, 2);
  assert.equal(validated.validRows[0].school, 'โรงเรียนสาธิต', 'school must survive validation');
  assert.equal(validated.validRows[0].trainingType, 'ด้านการอ่าน', 'trainingType must survive validation');
  assert.equal(validated.validRows[1].trainingType, '', 'a blank trainingType stays blank until commit applies the activity default');

  // Rows are written positionally, so their width must track Config.HEADERS exactly.
  const written = {};
  global.SheetService = {
    readRows: () => [],
    appendRowsBatch: (sheetName, matrix) => { written[sheetName] = matrix; return { startRow: 2, rowCount: matrix.length }; },
    deleteRows: () => {}
  };
  global.ActivityService = { getActivityById: () => ({ activityId: 'ACT001', trainingType: 'ด้านวิทยาศาสตร์' }) };
  try {
    const result = ParticipantService.commitImport('ACT001', rows, false);
    assert.equal(result.importedCount, 2);

    const participantRow = written[Config.SHEETS.PARTICIPANTS][0];
    const certificateRow = written[Config.SHEETS.CERTIFICATES][0];
    assert.equal(participantRow.length, Config.HEADERS.Participants.length, 'Participant row width must match the header list');
    assert.equal(certificateRow.length, Config.HEADERS.Certificates.length, 'Certificate row width must match the header list');
    assert.equal(participantRow[Config.HEADERS.Participants.indexOf('school')], 'โรงเรียนสาธิต');
    assert.equal(participantRow[Config.HEADERS.Participants.indexOf('trainingType')], 'ด้านการอ่าน');
    assert.equal(certificateRow[Config.HEADERS.Certificates.indexOf('trainingType')], 'ด้านการอ่าน');

    const inheritedRow = written[Config.SHEETS.PARTICIPANTS][1];
    assert.equal(
      inheritedRow[Config.HEADERS.Participants.indexOf('trainingType')],
      'ด้านวิทยาศาสตร์',
      'A blank trainingType must fall back to the activity default'
    );
  } finally {
    delete global.SheetService;
    delete global.ActivityService;
  }

  console.log('Import school and trainingType mapping test passed.');
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
  assert.throws(() => CertificateService.deleteCertificate('CERT-ACT001-000001'), /ต้องยกเลิก \(REVOKED\) ก่อน/);

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
  assert.equal(reissued.certificateNo, 'เลขที่ 0001/2569', 'certificateNo must be kept on reissue');
  assert.equal(reissued.runningNumber, 1, 'runningNumber must be kept on reissue');
  assert.equal(reissued.revokedAt, '', 'revokedAt should be cleared');
  assert.equal(reissued.revokeReason, '', 'revokeReason should be cleared');

  // Re-issuing the kept number must not be blocked by the duplicate guard (only itself holds it).
  CertificateService.getAllCertificates = () => [reissued];
  const issuedAgain = CertificateService.issueCertificate('CERT-ACT001-000001');
  assert.equal(issuedAgain.certificateStatus, Config.CERT_STATUS.ISSUED, 'Reissued certificate should be issuable again');
  assert.equal(issuedAgain.certificateNo, 'เลขที่ 0001/2569', 'Issuing after reissue must not consume a new number');

  CertificateService.getAllCertificates = () => [{ ...revokedCert, certificateStatus: Config.CERT_STATUS.ISSUED }];
  assert.throws(() => CertificateService.reissueCertificate('CERT-ACT001-000001', 'ไม่ควรได้'), /เฉพาะเกียรติบัตรสถานะ REVOKED/);

  console.log('Certificate reissue test passed.');
}

function testBulkRevokeAndDelete() {
  const rows = [
    { _rowIndex: 2, certificateId: 'CERT-ACT001-000001', activityId: 'ACT001', certificateNo: 'เลขที่ 0001/2569', firstName: 'ก', lastName: 'ข', certificateStatus: Config.CERT_STATUS.ISSUED },
    { _rowIndex: 3, certificateId: 'CERT-ACT001-000002', activityId: 'ACT001', certificateNo: 'เลขที่ 0002/2569', firstName: 'ค', lastName: 'ง', certificateStatus: Config.CERT_STATUS.ISSUED },
    { _rowIndex: 4, certificateId: 'CERT-ACT001-000003', activityId: 'ACT001', certificateNo: '', firstName: 'จ', lastName: 'ฉ', certificateStatus: Config.CERT_STATUS.DRAFT }
  ];

  let readCount = 0;
  CertificateService.getAllCertificates = () => { readCount++; return rows; };
  CertificateService.saveCertificateRow = () => {};

  assert.throws(() => CertificateService.revokeCertificates([], 'เหตุผล'), /อย่างน้อย 1 รายการ/);
  assert.throws(() => CertificateService.revokeCertificates(['CERT-ACT001-000001'], ''), /กรุณาระบุเหตุผล/);

  readCount = 0;
  const revokeResult = CertificateService.revokeCertificates(
    ['CERT-ACT001-000001', 'CERT-ACT001-000002', 'CERT-ACT001-000003', 'CERT-MISSING'],
    'ยกเลิกทั้งชุด'
  );
  assert.equal(revokeResult.total, 4, 'Bulk revoke should report every requested id');
  assert.equal(revokeResult.successCount, 2, 'Only the two ISSUED rows can be revoked');
  assert.equal(revokeResult.failCount, 2, 'DRAFT row and missing id must fail individually');
  assert.equal(readCount, 1, 'Bulk revoke should read the registry only once');
  assert.match(revokeResult.results[2].error, /เฉพาะเกียรติบัตรสถานะ ISSUED/);

  const deleteResult = CertificateService.deleteCertificates(['CERT-ACT001-000003', 'CERT-ACT001-000001']);
  assert.equal(deleteResult.successCount, 1, 'Only the DRAFT row is deletable');
  assert.equal(deleteResult.results[1].success, false, 'ISSUED row must be rejected by bulk delete');

  console.log('Bulk revoke and delete test passed.');
}

function testBulkIssueAndRoundCap() {
  const rows = [
    { _rowIndex: 2, certificateId: 'CERT-ACT001-000001', activityId: 'ACT001', certificateNo: '', firstName: 'ก', lastName: 'ข', certificateStatus: Config.CERT_STATUS.DRAFT },
    { _rowIndex: 3, certificateId: 'CERT-ACT001-000002', activityId: 'ACT001', certificateNo: '', firstName: 'ค', lastName: 'ง', certificateStatus: Config.CERT_STATUS.REVOKED }
  ];
  CertificateService.getAllCertificates = () => rows;
  CertificateService.saveCertificateRow = () => {};

  const result = CertificateService.issueCertificates(['CERT-ACT001-000001', 'CERT-ACT001-000002']);
  assert.equal(result.successCount, 1, 'Only the DRAFT row can be issued');
  assert.match(result.results[1].error, /Cannot issue certificate in status 'REVOKED'/);

  // One round may never exceed the cap; the UI splits larger selections itself.
  const tooMany = [];
  for (let i = 0; i <= CertificateService.MAX_BULK_PER_ROUND; i++) tooMany.push(`CERT-ACT001-${i}`);
  assert.throws(
    () => CertificateService.issueCertificates(tooMany),
    new RegExp(`สูงสุด ${CertificateService.MAX_BULK_PER_ROUND} รายการต่อรอบ`),
    'Sending more than one round worth of ids must be refused'
  );

  console.log('Bulk issue and per-round cap test passed.');
}

function testImportNeverReusesDeletedIds() {
  // PAR-ACT001-000002 was deleted from the participants page: its participant row is gone
  // for real, but the certificate row survives as DELETED and still holds that suffix.
  const participants = [{ participantId: 'PAR-ACT001-000001', activityId: 'ACT001', firstName: 'ก', lastName: 'ก', school: 'ร.ร.A' }];
  const certificates = [
    { certificateId: 'CERT-ACT001-000001', activityId: 'ACT001', certificateStatus: Config.CERT_STATUS.DRAFT },
    { certificateId: 'CERT-ACT001-000002', activityId: 'ACT001', certificateStatus: Config.CERT_STATUS.DELETED }
  ];

  const written = {};
  global.SheetService = {
    readRows: (sheet) => (sheet === Config.SHEETS.PARTICIPANTS ? participants : []),
    appendRowsBatch: (sheet, matrix) => { written[sheet] = matrix; return { startRow: 2, rowCount: matrix.length }; },
    deleteRows: () => {}
  };
  global.ActivityService = { getActivityById: () => ({ activityId: 'ACT001', trainingType: '' }) };
  global.CertificateService = CertificateService;
  const realGetAll = CertificateService.getAllCertificates;
  CertificateService.getAllCertificates = () => certificates;

  try {
    ParticipantService.commitImport('ACT001', [{ firstName: 'ข', lastName: 'ข', school: 'ร.ร.B' }], false);
    assert.equal(
      written[Config.SHEETS.CERTIFICATES][0][Config.HEADERS.Certificates.indexOf('certificateId')],
      'CERT-ACT001-000003',
      'A suffix still held by a soft-deleted certificate must never be handed out again'
    );
    assert.equal(
      written[Config.SHEETS.PARTICIPANTS][0][Config.HEADERS.Participants.indexOf('participantId')],
      'PAR-ACT001-000003',
      'Participant ids follow the same suffix as their certificate'
    );
  } finally {
    CertificateService.getAllCertificates = realGetAll;
    delete global.SheetService;
    delete global.ActivityService;
    delete global.CertificateService;
  }

  console.log('Import id suffix never reuses deleted ids test passed.');
}

function testRestoreDeletedCertificate() {
  const deletedDraft = {
    _rowIndex: 2,
    certificateId: 'CERT-ACT001-000001',
    activityId: 'ACT001',
    participantId: 'PAR-ACT001-000001',
    certificateNo: '',
    prefixName: 'นาย',
    firstName: 'ภัทรพล',
    lastName: 'แก้วเสนา',
    school: 'โรงเรียนสาธิต',
    trainingType: 'ด้านการอ่าน',
    participantStatus: 'ผ่านการอบรม',
    certificateStatus: Config.CERT_STATUS.DELETED,
    revokedAt: ''
  };

  let saved = null;
  CertificateService.getAllCertificates = () => [deletedDraft];
  CertificateService.saveCertificateRow = (cert) => { saved = cert; };

  assert.throws(() => CertificateService.restoreCertificate('CERT-ACT001-000001', ''), /กรุณาระบุเหตุผลในการกู้คืน/);

  // The participant row was deleted along with it, so restoring has to rebuild it.
  const appended = {};
  global.SheetService = {
    readRows: () => [],
    appendRowsBatch: (sheet, matrix) => { appended[sheet] = matrix; return { startRow: 2, rowCount: matrix.length }; },
    deleteRows: () => {}
  };
  global.ParticipantService = ParticipantService;

  try {
    const restored = CertificateService.restoreCertificate('CERT-ACT001-000001', 'ลบผิดใบ');
    assert.equal(restored.certificateStatus, Config.CERT_STATUS.DRAFT, 'A never-revoked certificate returns to DRAFT');
    assert.equal(saved.certificateStatus, Config.CERT_STATUS.DRAFT, 'The restored status must be written back to the sheet');
    assert.equal(restored.participantRestored, true, 'A missing participant row must be rebuilt');

    const participantRow = appended[Config.SHEETS.PARTICIPANTS][0];
    assert.equal(participantRow.length, Config.HEADERS.Participants.length, 'Rebuilt participant row width must match the header list');
    assert.equal(participantRow[Config.HEADERS.Participants.indexOf('participantId')], 'PAR-ACT001-000001', 'Rebuilt row keeps the original participantId');
    assert.equal(participantRow[Config.HEADERS.Participants.indexOf('trainingType')], 'ด้านการอ่าน', 'Rebuilt row carries the training type over');

    // A certificate revoked before deletion goes back to REVOKED, not DRAFT, and its
    // participant row is still present so nothing is appended a second time.
    const deletedRevoked = { ...deletedDraft, certificateNo: 'เลขที่ 0001/2569', revokedAt: '2026-01-01T00:00:00.000Z' };
    CertificateService.getAllCertificates = () => [deletedRevoked];
    global.SheetService.readRows = () => [{ participantId: 'PAR-ACT001-000001', activityId: 'ACT001' }];
    const restoredRevoked = CertificateService.restoreCertificate('CERT-ACT001-000001', 'กู้คืนใบที่ยกเลิกไว้');
    assert.equal(restoredRevoked.certificateStatus, Config.CERT_STATUS.REVOKED, 'A revoked certificate returns to REVOKED');
    assert.equal(restoredRevoked.certificateNo, 'เลขที่ 0001/2569', 'Restoring must keep the original certificate number');
    assert.equal(restoredRevoked.participantRestored, false, 'An existing participant row must not be duplicated');

    CertificateService.getAllCertificates = () => [{ ...deletedDraft, certificateStatus: Config.CERT_STATUS.DRAFT }];
    assert.throws(() => CertificateService.restoreCertificate('CERT-ACT001-000001', 'ไม่ควรได้'), /เฉพาะเกียรติบัตรที่ถูกลบ \(DELETED\)/);
  } finally {
    delete global.SheetService;
    delete global.ParticipantService;
  }

  console.log('Certificate restore test passed.');
}

testImportValidationAndDuplicates();
testImportCarriesSchoolAndTrainingType();
testImportNeverReusesDeletedIds();
testCertificateLifecycleAndOriginalName();
testCertificateReissue();
testBulkRevokeAndDelete();
testBulkIssueAndRoundCap();
testRestoreDeletedCertificate();
