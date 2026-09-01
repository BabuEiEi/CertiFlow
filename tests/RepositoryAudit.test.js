/**
 * Tests for Repository helpers, duplicate detection key, and Audit log payload
 */
const ParticipantService = require('../src/ParticipantService.gs');
const AuditService = require('../src/AuditService.gs');

function testDuplicateDetectionKey() {
  const key1 = ParticipantService.generateDuplicateKey('ACT001', 'ภัทรพล ', 'แก้วเสนา', '  โรงเรียนสาธิต ');
  const key2 = ParticipantService.generateDuplicateKey('ACT001', 'ภัทรพล', 'แก้วเสนา', 'โรงเรียนสาธิต');

  console.assert(key1 === key2, 'Duplicate key generation failed');
  console.assert(key1 === 'ACT001|ภัทรพล|แก้วเสนา|โรงเรียนสาธิต', 'Duplicate key format unexpected');
  console.log('Duplicate key test passed.');
}

function testAuditPayloadStringify() {
  const before = { name: 'Old Name', role: 'STAFF' };
  const after = { name: 'New Name', role: 'ADMIN' };

  const beforeStr = AuditService.stringifyPayload(before);
  const afterStr = AuditService.stringifyPayload(after);

  console.assert(beforeStr === '{"name":"Old Name","role":"STAFF"}', 'Audit stringify before failed');
  console.assert(afterStr === '{"name":"New Name","role":"ADMIN"}', 'Audit stringify after failed');
  console.log('Audit payload stringify test passed.');
}

testDuplicateDetectionKey();
testAuditPayloadStringify();
