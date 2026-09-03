/**
 * Tests for Schema definitions and Validation functions
 */
const assert = require('node:assert/strict');
const Config = require('../src/Config.gs');
const Validation = require('../src/Validation.gs');

function testSchemaDefinitions() {
  assert.ok(Config.HEADERS.Settings.length === 5, 'Settings headers length mismatch');
  assert.ok(Config.HEADERS.Activities.length === 23, 'Activities headers length mismatch');
  assert.ok(Config.HEADERS.Users.length === 10, 'Users headers length mismatch');
  assert.ok(Config.HEADERS.Participants.length === 14, 'Participants headers length mismatch');
  assert.ok(Config.HEADERS.Certificates.length === 24, 'Certificates headers length mismatch');
  assert.ok(Config.HEADERS.GenerationQueue.length === 14, 'GenerationQueue headers length mismatch');
  assert.ok(Config.HEADERS.AuditLogs.length === 10, 'AuditLogs headers length mismatch');
  assert.equal(Config.HEADERS.CertificateReports.length, 8);
  console.log('Schema definitions test passed.');
}

function testValidationHelpers() {
  assert.ok(Validation.sanitizeText('  นาย  ภัทรพล   ') === 'นาย ภัทรพล', 'sanitizeText failed');
  assert.ok(Validation.formatName('นาย', 'ภัทรพล', 'แก้วเสนา') === 'นายภัทรพล แก้วเสนา', 'formatName failed');
  assert.ok(Validation.normalizeNameForSearch('นาย ภัทรพล   แก้วเสนา') === 'ภัทรพล แก้วเสนา', 'normalizeNameForSearch failed');
  assert.ok(Validation.isValidEmail('user@example.com') === true, 'isValidEmail true failed');
  assert.ok(Validation.isValidEmail('invalid-email') === false, 'isValidEmail false failed');
  assert.equal(Validation.sanitizeSheetText('=IMPORTXML("x")'), "'=IMPORTXML(\"x\")");

  const reqCheck = Validation.validateRequiredFields({ name: 'Test', email: '' }, ['name', 'email']);
  assert.ok(reqCheck.valid === false && reqCheck.missing.includes('email'), 'validateRequiredFields failed');

  console.log('Validation helpers test passed.');
}

testSchemaDefinitions();
testValidationHelpers();
