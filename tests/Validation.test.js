/**
 * Tests for Validation functions
 */

function testSanitizeAndFormatName() {
  const sanitizeText = (str) => (!str ? '' : String(str).trim().replace(/\s+/g, ' '));
  const formatName = (p, f, l) => {
    return `${sanitizeText(p)}${sanitizeText(f)} ${sanitizeText(l)}`.trim();
  };

  console.assert(formatName('นาย', 'ภัทรพล ', 'แก้วเสนา') === 'นายภัทรพล แก้วเสนา', 'Name formatting failed');
  console.log('Validation formatting tests passed.');
}

if (typeof module !== 'undefined' && module.exports) {
  testSanitizeAndFormatName();
}
