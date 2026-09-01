/**
 * Unit tests for ActivityService, TemplateService, and NumberService formatting
 */
const assert = require('node:assert/strict');
const Config = require('../src/Config.gs');
const Validation = require('../src/Validation.gs');
const TemplateService = require('../src/TemplateService.gs');
const NumberService = require('../src/NumberService.gs');

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

testTemplateValidationMock();
testNumberFormattingRules();
