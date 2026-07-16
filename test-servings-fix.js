#!/usr/bin/env node

/**
 * Test script to verify servings parsing fix
 * Tests the parseServingsString function with various servings formats
 */

// Mock the parseServingsString function as it appears in API routes
function parseServingsString(servingsStr) {
  if (typeof servingsStr === 'number') {
    return {
      quantity: servingsStr,
      unit: 'serving',
      weight: '',
      displayString: `${servingsStr} serving${servingsStr !== 1 ? 's' : ''}`
    };
  }

  const str = String(servingsStr).trim();
  let quantity = 1;
  let unit = 'serving';
  let weight = '';

  // Extract quantity (supports decimals and fractions)
  const quantityMatch = str.match(/^[\s]*([0-9]+(?:\/[0-9]+)?(?:\.[0-9]+)?)/);
  if (quantityMatch && quantityMatch[1]) {
    const qStr = quantityMatch[1];
    if (qStr.includes('/')) {
      const [numerator, denominator] = qStr.split('/').map(Number);
      if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
        quantity = numerator / denominator;
      }
    } else {
      quantity = parseFloat(qStr);
    }
  }

  // Extract weight from parentheses
  const weightMatch = str.match(/\(\s*([^)]+)\s*\)/);
  if (weightMatch && weightMatch[1]) {
    weight = weightMatch[1].trim();
  }

  // Extract unit
  let unitPart = str;
  if (quantityMatch) {
    unitPart = unitPart.substring(quantityMatch[0].length);
  }
  unitPart = unitPart.replace(/\([^)]*\)/, '').trim();
  if (unitPart) {
    unit = unitPart;
  }

  return {
    quantity: isNaN(quantity) ? 1 : quantity,
    unit,
    weight,
    displayString: str || `${quantity} ${unit}`
  };
}

// Test cases (includes fraction formats and structured output)
const testCases = [
  { 
    name: 'Simple integer', 
    input: '2', 
    expected: { quantity: 2, unit: 'serving', weight: '' }
  },
  { 
    name: 'Decimal number', 
    input: '1.5', 
    expected: { quantity: 1.5, unit: 'serving', weight: '' }
  },
  { 
    name: 'TSP with gm/ml', 
    input: '1.5 TSP ( 7.5 gm/ml )', 
    expected: { quantity: 1.5, unit: 'TSP', weight: '7.5 gm/ml' }
  },
  { 
    name: 'SMALL BOWL format (original error)', 
    input: '2.5 SMALL BOWL (500 gm/ml)', 
    expected: { quantity: 2.5, unit: 'SMALL BOWL', weight: '500 gm/ml' }
  },
  { 
    name: 'Fraction TSP', 
    input: '1/2 TSP ( 2.5 gm/ml )', 
    expected: { quantity: 0.5, unit: 'TSP', weight: '2.5 gm/ml' }
  },
  { 
    name: 'GLASS format', 
    input: '1 GLASS ( 250 ml )', 
    expected: { quantity: 1, unit: 'GLASS', weight: '250 ml' }
  },
  { 
    name: 'Fraction 3/4', 
    input: '3/4 CUP ( 75 ml )', 
    expected: { quantity: 0.75, unit: 'CUP', weight: '75 ml' }
  },
  { 
    name: 'KATORI format', 
    input: '1 MEDIUM KATORI ( 180 gm/ml )', 
    expected: { quantity: 1, unit: 'MEDIUM KATORI', weight: '180 gm/ml' }
  },
  { 
    name: 'Number type input', 
    input: 4, 
    expected: { quantity: 4, unit: 'serving', weight: '' }
  },
  { 
    name: 'LARGE BOWL', 
    input: '2 LARGE BOWL ( 600 gm/ml )', 
    expected: { quantity: 2, unit: 'LARGE BOWL', weight: '600 gm/ml' }
  },
  { 
    name: 'EGG WHOLE format', 
    input: 'EGG WHOLE ( 50 GM WHOLE )', 
    expected: { quantity: 1, unit: 'EGG WHOLE', weight: '50 GM WHOLE' }
  },
  { 
    name: 'ROTI format', 
    input: 'ROTI ( 35 GM )', 
    expected: { quantity: 1, unit: 'ROTI', weight: '35 GM' }
  },
];

const tolerance = 0.0001;

// Run tests
console.log('\n╔════════════════════════════════════════════════════════════════════════╗');
console.log('║         SERVINGS PARSING - STRUCTURED OUTPUT TEST                       ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

testCases.forEach((test, index) => {
  const result = parseServingsString(test.input);
  
  const quantityMatch = Math.abs(result.quantity - test.expected.quantity) < tolerance;
  const unitMatch = result.unit === test.expected.unit;
  const weightMatch = result.weight === test.expected.weight;
  
  const isPass = quantityMatch && unitMatch && weightMatch;

  if (isPass) {
    passed++;
    console.log(`✅ Test ${index + 1}: ${test.name}`);
    console.log(`   Input:    "${test.input}"`);
    console.log(`   Output:   quantity=${result.quantity}, unit="${result.unit}", weight="${result.weight}"`);
    console.log(`   Display:  "${result.displayString}"`);
    console.log();
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: ${test.name}`);
    console.log(`   Input:    "${test.input}"`);
    console.log(`   Expected: quantity=${test.expected.quantity}, unit="${test.expected.unit}", weight="${test.expected.weight}"`);
    console.log(`   Got:      quantity=${result.quantity}, unit="${result.unit}", weight="${result.weight}"`);
    console.log(`   Failures: ${!quantityMatch ? 'quantity ' : ''}${!unitMatch ? 'unit ' : ''}${!weightMatch ? 'weight' : ''}`);
    console.log();
  }
});

// Summary
console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log(`║ RESULTS: ${passed} passed, ${failed} failed                                            ║`);
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

if (failed === 0) {
  console.log('🎉 All tests passed! The servings structured parsing is working correctly.\n');
  console.log('Database will store:');
  console.log('  - servings: Number (quantity for calculations)');
  console.log('  - servingQuantity: Number (same as servings)');
  console.log('  - servingUnit: String (e.g., "SMALL BOWL")');
  console.log('  - servingWeight: String (e.g., "500 gm/ml")');
  console.log('  - servingSize: String (full display text)\n');
}
