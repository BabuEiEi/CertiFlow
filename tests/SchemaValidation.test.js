/**
 * Tests for Schema definitions and Validation functions
 */
const Config = require('../src/Config.gs');
const Validation = require('../src/Validation.gs');

function testSchemaDefinitions() {
  console.assert(Config.HEADERS.Settings.length === 5, 'Settings headers length mismatch');
  console.assert(Config.HEADERS.Activities.length === 22, 'Activities headers length mismatch');
  console.assert(Config.HEADERS.Users.length === 10, 'Users headers length mismatch');
  console.assert(Config.HEADERS.Participants.length === 13, 'Participants headers length mismatch');
  console.assert(Config.HEADERS.Certificates.length === 23, 'Certificates headers length mismatch');
  console.assert(Config.HEADERS.GenerationQueue.length === 14, 'GenerationQueue headers length mismatch');
  console.assert(Config.HEADERS.AuditLogs.length === 10, 'AuditLogs headers length mismatch');
  console.log('Schema definitions test passed.');
}

function testValidationHelpers() {
  console.assert(Validation.sanitizeText('  นาย  ภัทรพล   ') === 'นาย ภัทรพล', 'sanitizeText failed');
  console.assert(Validation.formatName('นาย', 'ภัทรพล', 'แก้วเสนา') === 'นายภัทรพล แก้วเสนา', 'formatName failed');
  console.assert(Validation.normalizeNameForSearch('นาย ภัทรพล   แก้วเสนา') === 'ภัทรพล แก้วเสนา', 'normalizeNameForSearch failed');
  console.assert(Validation.isValidEmail('user@example.com') === true, 'isValidEmail true failed');
  console.assert(Validation.isValidEmail('invalid-email') === false, 'isValidEmail false failed');

  const reqCheck = Validation.validateRequiredFields({ name: 'Test', email: '' }, ['name', 'email']);
  console.assert(reqCheck.valid === false && reqCheck.missing.includes('email'), 'validateRequiredFields failed');

  console.log('Validation helpers test passed.');
}

testSchemaDefinitions();
testValidationHelpers();
