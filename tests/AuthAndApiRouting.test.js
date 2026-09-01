/**
 * Unit tests for AuthService and API Routing rules
 */
const Config = require('../src/Config.gs');
const AuthService = require('../src/AuthService.gs');

function testAuthPermissions() {
  console.assert(AuthService.hasPermission('ADMIN', ['ADMIN']) === true, 'ADMIN permission check failed');
  console.assert(AuthService.hasPermission('STAFF', ['ADMIN']) === false, 'STAFF permission check for ADMIN failed');
  console.assert(AuthService.hasPermission('STAFF', ['ADMIN', 'STAFF']) === true, 'STAFF permission check failed');
  console.assert(AuthService.hasPermission(null, ['ADMIN', 'STAFF']) === false, 'Null permission check failed');
  console.log('Auth permissions test passed.');
}

function testUserContextDefaults() {
  const defaultContext = AuthService.getUserContext('');
  console.assert(defaultContext.isPublicUser === true, 'Default user context should be public');
  console.assert(defaultContext.role === null, 'Default role should be null');
  console.log('User context defaults test passed.');
}

testAuthPermissions();
testUserContextDefaults();
