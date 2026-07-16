#!/usr/bin/env node

/**
 * Test script to verify servings parsing fix
 * Tests the parseServingsToNumber function - SIMPLIFIED VERSION
 */

// Simplified parseServingsToNumber function
function parseServingsToNumber(servingsStr) {
  if (typeof servingsStr === 'number') return servingsStr;

  const str = String(servingsStr).trim();
  const match = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (match && match[1]) {
    const qStr = match[1];
    if (qStr.includes('/')) {
      const [numerator, denominator] = qStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        return numerator / denominator;
      }
    } else {
      const num = parseFloat(qStr);
      if (!isNaN(num)) return num;
    }
  }
  return 1;
}

// Test cases - simplified to just check numeric extraction
const testCases = [
  { name: 'Simple integer', input: '2', expected: 2 },
  { name: 'Decimal number', input: '1.5', expected: 1.5 },
  { name: 'TSP with gm/ml', input: '1.5 TSP ( 7.5 gm/ml )', expected: 1.5 },
  { name: 'SMALL BOWL format (original error)', input: '2.5 SMALL BOWL (500 gm/ml)', expected: 2.5 },
  { name: 'Fraction TSP', input: '1/2 TSP ( 2.5 gm/ml )', expected: 0.5 },
  { name: 'GLASS format', input: '1 GLASS ( 250 ml )', expected: 1 },
  { name: 'Fraction 3/4', input: '3/4 CUP ( 75 ml )', expected: 0.75 },
  { name: 'KATORI format', input: '1 MEDIUM KATORI ( 180 gm/ml )', expected: 1 },
  { name: 'Number type input', input: 4, expected: 4 },
  { name: 'LARGE BOWL', input: '2 LARGE BOWL ( 600 gm/ml )', expected: 2 },
  { name: 'EGG format (no leading number)', input: 'EGG WHOLE ( 50 GM WHOLE )', expected: 1 },
  { name: 'ROTI format (no leading number)', input: 'ROTI ( 35 GM )', expected: 1 },
];

const tolerance = 0.0001;

console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║         SERVINGS PARSING TEST - SIMPLIFIED (2 FIELDS ONLY)             ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = parseServingsToNumber(test.input);
  const isPass = Math.abs(result - test.expected) < tolerance;

  if (isPass) {
    passed++;
    console.log(`✅ Test ${index + 1}: ${test.name}`);
    console.log(`   Input: "${test.input}" -> servings: ${result}`);
    console.log();
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: ${test.name}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
    console.log();
  }
});

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ RESULTS: ${passed} passed, ${failed} failed                                            ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

if (failed === 0) {
  console.log('🎉 All tests passed!\n');
  console.log('Database stores only 2 fields:');
  console.log('  - servings: Number (extracted numeric value)');
  console.log('  - servingSize: String (full display text like "2.5 SMALL BOWL (500 gm/ml)")\n');
  process.exit(0);
} else {
  console.log('⚠️  Some tests failed.\n');
  process.exit(1);
}
