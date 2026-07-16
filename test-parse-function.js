const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Test the parsing function directly
function parsePythonStyleArray(value) {
  if (typeof value !== 'string') return value;
  
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return value;
  
  if (trimmed.includes("{'") || trimmed.includes("': '") || trimmed.includes("', '")) {
    try {
      let jsonStr = trimmed
        .replace(/'/g, '"')
        .replace(/"(\d+\.?\d*)"/g, '$1')
        .replace(/: None/g, ': null')
        .replace(/: True/g, ': true')
        .replace(/: False/g, ': false');
      
      const parsed = JSON.parse(jsonStr);
      return parsed;
    } catch (e) {
      try {
        const sanitized = trimmed
          .replace(/'/g, '"')
          .replace(/None/g, 'null')
          .replace(/True/g, 'true')
          .replace(/False/g, 'false');
        return JSON.parse(sanitized);
      } catch (e2) {
        console.error('Failed to parse Python-style array:', e2);
        return value;
      }
    }
  }
  
  try { return JSON.parse(trimmed); }
  catch { return value; }
}

// Read the CSV file
const csvPath = '/Users/lokeshdhote/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/EC663904-D13A-4857-9C7A-96D78BDCA7B0/recipe-1042 updated (1).csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Parse header
const header = lines[0].split(',');
const idIndex = header.indexOf('_id');
const ingredientsIndex = header.indexOf('ingredients');

console.log(`Total recipes: ${lines.length - 1}`);
console.log(`\n=== Testing Python-style array parsing ===\n`);

// Extract sample ingredient data from first 5 recipes
const samples = [];
for (let i = 1; i < Math.min(6, lines.length); i++) {
  const line = lines[i];
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  
  const id = parts[idIndex]?.replace(/"/g, '').trim();
  const ingredientsStr = parts[ingredientsIndex]?.trim();
  
  if (id && ingredientsStr) {
    // Remove surrounding quotes if present
    const cleanedStr = ingredientsStr.startsWith('"') && ingredientsStr.endsWith('"')
      ? ingredientsStr.slice(1, -1)
      : ingredientsStr;
    
    console.log(`Recipe ${i}:`);
    console.log(`_id: ${id}`);
    console.log(`Input (first 150 chars): ${cleanedStr.substring(0, 150)}...`);
    
    const parsed = parsePythonStyleArray(cleanedStr);
    
    if (Array.isArray(parsed)) {
      console.log(`✓ Parsed successfully! Array length: ${parsed.length}`);
      console.log(`First ingredient: ${JSON.stringify(parsed[0])}`);
    } else {
      console.log(`✗ Parsing failed - returned as string`);
      console.log(`Type of parsed: ${typeof parsed}`);
    }
    console.log('');
    
    samples.push({ id, ingredients: cleanedStr, parsed });
  }
}

// Test MongoDB connection and actual update
console.log(`\n=== Testing with MongoDB ===\n`);

const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/dtps';

async function testMongoUpdate() {
  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();
    console.log('✓ Connected to MongoDB');
    
    const db = client.db();
    const recipesCollection = db.collection('recipes');
    
    // Test with first 3 recipes
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < Math.min(3, samples.length); i++) {
      const { id, parsed } = samples[i];
      
      if (typeof parsed === 'object' && Array.isArray(parsed)) {
        try {
          const result = await recipesCollection.updateOne(
            { _id: require('mongodb').ObjectId.isValid(id) ? new (require('mongodb').ObjectId)(id) : id },
            { $set: { ingredients: parsed } }
          );
          
          if (result.modifiedCount > 0) {
            console.log(`✓ Recipe ${i + 1} updated successfully`);
            successCount++;
          } else if (result.matchedCount > 0) {
            console.log(`- Recipe ${i + 1} matched but no changes needed`);
          } else {
            console.log(`✗ Recipe ${i + 1} not found`);
            failCount++;
          }
        } catch (e) {
          console.log(`✗ Recipe ${i + 1} error: ${e.message}`);
          failCount++;
        }
      } else {
        console.log(`✗ Recipe ${i + 1} - ingredients not parsed as array`);
        failCount++;
      }
    }
    
    console.log(`\nResults: ${successCount} updated, ${failCount} failed`);
    
    await client.close();
  } catch (e) {
    console.error(`MongoDB connection error: ${e.message}`);
    console.log(`Note: If MongoDB is not available, the parsing test above still shows the function works correctly.`);
  }
}

testMongoUpdate();
