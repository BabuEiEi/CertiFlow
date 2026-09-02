/**
 * Unit tests for ActivityService, TemplateService, and NumberService formatting
 */
const assert = require('node:assert/strict');
const Config = require('../src/Config.gs');
const Validation = require('../src/Validation.gs');
global.Config = Config;
global.Validation = Validation;
const TemplateService = require('../src/TemplateService.gs');
const NumberService = require('../src/NumberService.gs');
const ActivityService = require('../src/ActivityService.gs');

function testTemplateValidationMock() {
  const emptyRes = TemplateService.validateTemplate('');
  assert.ok(emptyRes.valid === false, 'Template validation should fail on empty ID');

  const validRes = TemplateService.validateTemplate('1x2y3z_mock_template');
  assert.ok(validRes.valid === true, 'Template validation mock should pass');
  console.log('TemplateService validation test passed.');
}

function testNumberFormattingRules() {
  const activityArabic = {
    prefixText: 'เลขที่',
    prefix: 'สพม.พลอต',
    digitLength: 4,
    numberFormat: 'ARABIC',
    separator: '/',
    year: '2569'
  };

  const certNoArabic = NumberService.formatCertificateNo(activityArabic, 2221);
  assert.ok(certNoArabic === 'เลขที่ สพม.พลอต 2221/2569', `Arabic certNo mismatch: ${certNoArabic}`);

  const activityThai = {
    prefixText: 'เลขที่',
    prefix: 'สพม.พลอต',
    digitLength: 4,
    numberFormat: 'THAI',
    separator: '/',
    year: '2569'
  };

  const certNoThai = NumberService.formatCertificateNo(activityThai, 2221);
  assert.ok(certNoThai === 'เลขที่ สพม.พลอต ๒๒๒๑/๒๕๖๙', `Thai certNo mismatch: ${certNoThai}`);

  const certId = NumberService.formatCertificateId('ACT001', 1);
  assert.ok(certId === 'CERT-ACT001-000001', `certId mismatch: ${certId}`);

  console.log('NumberService certificate number rules test passed.');
}

function testActivityNumberRangeOverlapGuard() {
  const baseSeries = { prefixText: 'เลขที่', prefix: 'สพม.พลอต', separator: '/', year: '2569' };
  const existing = [
    { ...baseSeries, activityId: 'ACT001', activityName: 'กิจกรรมที่ 1', startNumber: 1111, endNumber: 1220, sequence: 1150, templateId: 'tpl', organizer: 'ก', issueAgency: 'ข' }
  ];
  ActivityService.getActivities = () => existing;

  const newActivity = {
    ...baseSeries,
    activityName: 'กิจกรรมที่ 2',
    organizer: 'ก',
    issueAgency: 'ข',
    templateId: 'tpl',
    startNumber: 1331,
    endNumber: 1351
  };

  // Non-overlapping range in the same series saves fine, gap between ranges and all.
  const saved = ActivityService.saveActivity(newActivity);
  assert.equal(saved.startNumber, 1331, 'Non-overlapping range should save');
  assert.equal(saved.activityId, 'ACT002', 'New activity id should follow the existing max');

  // Overlapping range in the same series is refused.
  assert.throws(
    () => ActivityService.saveActivity({ ...newActivity, startNumber: 1200, endNumber: 1300 }),
    /ทับซ้อนกับกิจกรรม 'กิจกรรมที่ 1'/,
    'Overlapping range in the same number series must be rejected'
  );

  // Touching the boundary counts as overlap too.
  assert.throws(
    () => ActivityService.saveActivity({ ...newActivity, startNumber: 1220, endNumber: 1300 }),
    /ทับซ้อน/,
    'Shared boundary number must be rejected'
  );

  // A different series (different year) may reuse the very same numbers.
  const otherYear = ActivityService.saveActivity({ ...newActivity, year: '2570', startNumber: 1111, endNumber: 1220 });
  assert.equal(otherYear.startNumber, 1111, 'Same range in a different year series is allowed');

  // Editing an activity does not conflict with itself.
  ActivityService.getActivities = () => [{ ...existing[0] }];
  const edited = ActivityService.saveActivity({ ...baseSeries, activityId: 'ACT001', activityName: 'กิจกรรมที่ 1', organizer: 'ก', issueAgency: 'ข', templateId: 'tpl', startNumber: 1111, endNumber: 1500, sequence: 1150 });
  assert.equal(edited.endNumber, 1500, 'Extending an activity range must not self-conflict');

  console.log('ActivityService number range overlap test passed.');
}

testTemplateValidationMock();
testNumberFormattingRules();
testActivityNumberRangeOverlapGuard();
