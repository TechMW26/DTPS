#!/usr/bin/env node
/**
 * Script to fix broken cache keys where .select/.sort/.limit/.lean were incorrectly chained
 * to JSON.stringify() in the cache key string
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '../src/app/api');

function getRouteFiles(dir, files = []) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      getRouteFiles(fullPath, files);
    } else if (item === 'route.ts') {
      files.push(fullPath);
    }
  }
  return files;
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  
  // Pattern: Fix multi-line broken cache keys
  // Match: `something:${JSON.stringify(query)\n  .select(...)\n  .sort(...)}` 
  // and fix to: `something:${JSON.stringify(query)}`
  
  // This regex matches from JSON.stringify( to the closing }` of the template literal
  // capturing everything that looks like chained method calls after the )
  const multiLinePattern = /(\$\{JSON\.stringify\([^)]*\))([\s\S]*?)((?:\s*\.(?:select|sort|limit|populate|lean)\([^)]*\)|\s*\.(?:populate)\(\{[\s\S]*?\}\))+)(\s*\}`)/g;
  
  content = content.replace(multiLinePattern, (match, jsonPart, middle, chainedMethods, ending) => {
    // If middle contains actual code (not just whitespace and method chains), don't replace
    if (middle.trim() && !middle.trim().startsWith('.')) {
      return match;
    }
    return jsonPart + '}`';
  });
  
  // Simpler pattern: just look for JSON.stringify followed by newline and .method
  // Pattern: ${JSON.stringify(something)\n      .select(
  const simpleMultiLine = /(\$\{JSON\.stringify\([^)]+\))\s*\n\s*\.(select|sort|limit|populate|lean)\([^}]+\}`/g;
  
  content = content.replace(simpleMultiLine, (match, jsonPart) => {
    return jsonPart + '}`';
  });
  
  // Pattern 2: Fix double .lean().lean() in the actual query
  content = content.replace(/\.lean\(\)\.lean\(\)/g, '.lean()');
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed: ${filePath.replace(API_DIR, '')}`);
    return true;
  }
  
  return false;
}

function main() {
  console.log('🔧 Fixing broken cache keys in API routes...\n');
  
  const files = getRouteFiles(API_DIR);
  let fixedCount = 0;
  
  for (const file of files) {
    try {
      if (fixFile(file)) {
        fixedCount++;
      }
    } catch (err) {
      console.error(`❌ Error processing ${file}: ${err.message}`);
    }
  }
  
  console.log(`\n✨ Done! Fixed ${fixedCount} files.`);
}

main();
