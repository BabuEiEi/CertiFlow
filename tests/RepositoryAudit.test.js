/**
 * Tests for Repository helpers, duplicate detection key, and Audit log payload
 */
const assert = require('node:assert/strict');
const ParticipantService = require('../src/ParticipantService.gs');
const AuditService = require('../src/AuditService.gs');

function testDuplicateDetectionKey() {
  const key1 = ParticipantService.generateDuplicateKey('ACT001', 'ภัทรพล ', 'แก้วเสนา', '  โรงเรียนสาธิต ');
  const key2 = ParticipantService.generateDuplicateKey('ACT001', 'ภัทรพล', 'แก้วเสนา', 'โรงเรียนสาธิต');

  assert.ok(key1 === key2, 'Duplicate key generation failed');
  assert.ok(key1 === 'ACT001|ภัทรพล|แก้วเสนา|โรงเรียนสาธิต', 'Duplicate key format unexpected');
  console.log('Duplicate key test passed.');
}

function testAuditPayloadStringify() {
  const before = { name: 'Old Name', role: 'STAFF' };
  const after = { name: 'New Name', role: 'ADMIN' };

  const beforeStr = AuditService.stringifyPayload(before);
  const afterStr = AuditService.stringifyPayload(after);

  assert.ok(beforeStr === '{"name":"Old Name","role":"STAFF"}', 'Audit stringify before failed');
  assert.ok(afterStr === '{"name":"New Name","role":"ADMIN"}', 'Audit stringify after failed');
  console.log('Audit payload stringify test passed.');
}

testDuplicateDetectionKey();
testAuditPayloadStringify();
