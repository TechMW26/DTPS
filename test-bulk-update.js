const fs = require('fs');
const path = require('path');

// Read the CSV file
const csvPath = '/Users/lokeshdhote/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/EC663904-D13A-4857-9C7A-96D78BDCA7B0/recipe-1042 updated (1).csv';
const csvContent = fs.readFileSync(csvPath, 'utf-8');
const lines = csvContent.trim().split('\n');

// Parse header
const header = lines[0].split(',');
const idIndex = header.indexOf('_id');
const ingredientsIndex = header.indexOf('ingredients');

console.log(`Total recipes: ${lines.length - 1}`);
console.log(`ID index: ${idIndex}, Ingredients index: ${ingredientsIndex}`);

// Prepare data for bulk update (just send first 10 for testing)
const updates = [];
for (let i = 1; i < Math.min(11, lines.length); i++) {
  const line = lines[i];
  // Simple CSV parsing - just get _id and ingredients
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
  const ingredients = parts[ingredientsIndex]?.trim();
  
  if (id && ingredients) {
    updates.push({
      _id: id,
      ingredients: ingredients
    });
  }
}

console.log(`\nPrepared ${updates.length} recipes for testing`);
console.log(`First recipe ingredients sample:\n${updates[0].ingredients.substring(0, 200)}...\n`);

// Send to API
const apiUrl = 'http://localhost:3000/api/admin/recipes/bulk-update';
const jsonData = JSON.stringify({ updates });

console.log(`Sending ${updates.length} recipes to ${apiUrl}...\n`);

const http = require('http');
const https = require('https');

const url = new URL(apiUrl);
const client = url.protocol === 'https:' ? https : http;

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(jsonData)
  }
};

const req = client.request(url, options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(responseData);
      console.log(`Response Status: ${res.statusCode}\n`);
      console.log(`Updated: ${response.updated}`);
      console.log(`Failed: ${response.failed}`);
      console.log(`No Changes: ${response.noChanges}`);
      
      if (response.failed > 0 && response.updateResults && response.updateResults.length > 0) {
        console.log(`\nFirst few errors:`);
        response.updateResults
          .filter(r => r.error)
          .slice(0, 3)
          .forEach(r => {
            console.log(`\n_id: ${r._id}`);
            console.log(`Error: ${r.error}`);
          });
      }
      
      if (response.updated > 0 && response.updateResults && response.updateResults.length > 0) {
        console.log(`\nSample successful update:`);
        const success = response.updateResults.find(r => !r.error);
        if (success) {
          console.log(`_id: ${success._id}`);
          console.log(`Changes: ${JSON.stringify(success.changes)}`);
        }
      }
    } catch (e) {
      console.log(`Response: ${responseData}`);
    }
  });
});

req.on('error', (error) => {
  console.error(`Error: ${error.message}`);
});

req.write(jsonData);
req.end();
