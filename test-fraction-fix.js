// Test suite for fraction and decimal servings parsing

function normalizeFieldValue(field, value) {
  if (field !== 'servings') return value;
  
  if (typeof value === 'number') return value;
  
  // Extract numeric part from strings like "1.5 TSP ( 7.5 gm/ml )" or "1/2 TSP ( 2.5 gm/ml )"
  if (typeof value === 'string') {
    // Try to extract first number (decimal, integer, or fraction)
    // Match patterns like: 1.5, 2, 1/2, 3/4, etc.
    const match = value.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
    if (match && match[1]) {
      let num;
      if (match[1].includes('/')) {
        // Handle fraction like "1/2" or "3/4"
        const [numerator, denominator] = match[1].split('/').map(Number);
        num = numerator / denominator;
      } else {
        num = parseFloat(match[1]);
      }
      return isNaN(num) ? null : num;
    }
    return null;
  }
  
  return null;
}

// Test cases
const testCases = [
  // Previous formats that should still work
  { input: "2", expected: 2, description: "Simple integer" },
  { input: "1.5", expected: 1.5, description: "Decimal number" },
  { input: "1.5 TSP ( 7.5 gm/ml )", expected: 1.5, description: "TSP format (original error)" },
  { input: "2 cups", expected: 2, description: "Cup format" },
  { input: "  3.5  servings", expected: 3.5, description: "Decimal with spaces" },
  { input: "0.5 Tablespoon (7.5ml)", expected: 0.5, description: "Complex unit" },
  { input: 4, expected: 4, description: "Number type" },
  
  // NEW: Fraction formats
  { input: "1/2 TSP ( 2.5 gm/ml )", expected: 0.5, description: "Fraction TSP (NEW ERROR CASE)" },
  { input: "1/2", expected: 0.5, description: "Simple fraction 1/2" },
  { input: "3/4", expected: 0.75, description: "Fraction 3/4" },
  { input: "1/4", expected: 0.25, description: "Fraction 1/4" },
  { input: "2/3", expected: 2/3, description: "Fraction 2/3" },
  { input: "3/8", expected: 0.375, description: "Fraction 3/8" },
  { input: "1/2 cups", expected: 0.5, description: "Fraction with unit" },
  { input: "  1/3  servings", expected: 1/3, description: "Fraction with spaces" },
  { input: "5/2", expected: 2.5, description: "Fraction greater than 1" },
];

let passed = 0;
let failed = 0;

console.log("🧪 Testing Fraction & Decimal Parsing\n");

testCases.forEach((test, index) => {
  const result = normalizeFieldValue('servings', test.input);
  const isCorrect = Math.abs(result - test.expected) < 0.0001; // Allow for floating point precision
  
  if (isCorrect) {
    console.log(`✅ Test ${index + 1}: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
    passed++;
  } else {
    console.log(`❌ Test ${index + 1}: ${test.description}`);
    console.log(`   Input: "${test.input}"`);
    console.log(`   Expected: ${test.expected}, Got: ${result}`);
    failed++;
  }
  console.log();
});

console.log(`\nRESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 All tests passed!");
} else {
  console.log(`⚠️  ${failed} test(s) failed!`);
  process.exit(1);
}
