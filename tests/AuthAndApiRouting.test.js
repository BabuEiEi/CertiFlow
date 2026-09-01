/**
 * Unit tests for AuthService and API Routing rules
 */
const assert = require('node:assert/strict');
const Config = require('../src/Config.gs');
const AuthService = require('../src/AuthService.gs');

function testAuthPermissions() {
  assert.ok(AuthService.hasPermission('ADMIN', ['ADMIN']) === true, 'ADMIN permission check failed');
  assert.ok(AuthService.hasPermission('STAFF', ['ADMIN']) === false, 'STAFF permission check for ADMIN failed');
  assert.ok(AuthService.hasPermission('STAFF', ['ADMIN', 'STAFF']) === true, 'STAFF permission check failed');
  assert.ok(AuthService.hasPermission(null, ['ADMIN', 'STAFF']) === false, 'Null permission check failed');
  console.log('Auth permissions test passed.');
}

function testUserContextDefaults() {
  const defaultContext = AuthService.getUserContext('');
  assert.ok(defaultContext.isPublicUser === true, 'Default user context should be public');
  assert.ok(defaultContext.role === null, 'Default role should be null');
  console.log('User context defaults test passed.');
}

testAuthPermissions();
testUserContextDefaults();
