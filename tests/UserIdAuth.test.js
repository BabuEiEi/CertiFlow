/**
 * Integration-style local test for userId/password authentication and sessions.
 */
const assert = require('node:assert/strict');
const Config = require('../src/Config.gs');
const Validation = require('../src/Validation.gs');

global.Config = Config;
global.Validation = Validation;

const users = [];
global.SheetService = {
  readRows(sheetName) {
    assert.equal(sheetName, Config.SHEETS.USERS);
    return users;
  },
  getSheet() {
    return {
      getLastColumn() {
        return Config.HEADERS.Users.length;
      },
      getRange(rowIndex) {
        if (rowIndex === 1) {
          return {
            getValues() {
              return [Config.HEADERS.Users];
            }
          };
        }
        return {
          setValues(matrix) {
            const updated = { _rowIndex: rowIndex };
            Config.HEADERS.Users.forEach((header, index) => {
              updated[header] = matrix[0][index];
            });
            users[rowIndex - 2] = updated;
          }
        };
      }
    };
  },
  appendRowsBatch(sheetName, matrix) {
    assert.equal(sheetName, Config.SHEETS.USERS);
    matrix.forEach(values => {
      const user = { _rowIndex: users.length + 2 };
      Config.HEADERS.Users.forEach((header, index) => {
        user[header] = values[index];
      });
      users.push(user);
    });
  }
};

const AuthService = require('../src/AuthService.gs');

const passwordFields = AuthService.createPasswordFields('admin@info.com', 'CorrectHorse1!');
users.push({
  _rowIndex: 2,
  userId: 'admin@info.com',
  email: '',
  name: 'Administrator',
  role: Config.ROLES.ADMIN,
  status: Config.USER_STATUS.ACTIVE,
  ...passwordFields,
  createdAt: new Date().toISOString(),
  updatedAt: '',
  lastLogin: ''
});

assert.throws(
  () => AuthService.login('admin@info.com', 'WrongPassword1!'),
  /userId หรือรหัสผ่านไม่ถูกต้อง/
);

const login = AuthService.login('ADMIN@INFO.COM', 'CorrectHorse1!');
assert.ok(login.authToken);
assert.equal(login.user.userId, 'admin@info.com');
assert.equal(login.user.role, Config.ROLES.ADMIN);
assert.equal(login.user.passwordHash, undefined);

const session = AuthService.getSessionContext(login.authToken);
assert.equal(session.userId, 'admin@info.com');
assert.equal(AuthService.hasPermission(session.role, ['ADMIN']), true);

AuthService.setRequestContextFromToken(login.authToken);
assert.equal(AuthService.requireRole(['ADMIN']).userId, 'admin@info.com');
AuthService.clearRequestContext();

AuthService.logout(login.authToken);
assert.equal(AuthService.getSessionContext(login.authToken), null);

console.log('UserId authentication and session tests passed.');
