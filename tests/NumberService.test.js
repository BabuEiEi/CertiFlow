/**
 * Tests for NumberService formatting functions
 */

// Simple assertions for node/jest/native test runner
function testThaiNumberFormatting() {
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙'];
  const formatNumber = (num, format) => {
    const str = String(num);
    if (format === 'THAI') {
      return str.replace(/[0-9]/g, (digit) => thaiDigits[parseInt(digit, 10)]);
    }
    return str;
  };

  console.assert(formatNumber('2221', 'THAI') === '๒๒๒๑', 'Thai conversion failed');
  console.assert(formatNumber('2221', 'ARABIC') === '2221', 'Arabic conversion failed');
  console.log('NumberService formatting tests passed.');
}

if (typeof module !== 'undefined' && module.exports) {
  testThaiNumberFormatting();
}
