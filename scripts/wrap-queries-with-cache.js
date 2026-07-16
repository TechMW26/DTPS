#!/usr/bin/env node
/**
 * Script to wrap database queries with cache in all API routes
 * Run with: node scripts/wrap-queries-with-cache.js
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '../src/app/api');

// TTL settings
const TTL_CONFIG = {
  messages: 30000,      // 30 seconds
  notifications: 30000,
  appointments: 60000,  // 1 minute
  tasks: 60000,
  users: 120000,        // 2 minutes
  clients: 120000,
  profile: 120000,
  default: 300000,      // 5 minutes
};

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

function getCacheKey(routePath) {
  const relativePath = routePath.replace(API_DIR, '').replace('/route.ts', '');
  return relativePath.replace(/\//g, ':').replace(/\[|\]/g, '').substring(1);
}

function getCacheTag(routePath) {
  const parts = routePath.replace(API_DIR, '').split(path.sep).filter(p => p && p !== 'route.ts');
  const firstPart = parts.find(p => !p.startsWith('[')) || 'api';
  return firstPart.replace(/-/g, '_');
}

function getTTL(routePath) {
  const relativePath = routePath.toLowerCase();
  for (const [key, ttl] of Object.entries(TTL_CONFIG)) {
    if (relativePath.includes(key)) {
      return ttl;
    }
  }
  return TTL_CONFIG.default;
}

function wrapQueriesWithCache(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already uses withCache
  if (content.includes('withCache(') && content.includes('await withCache')) {
    console.log(`⏭️  Already using withCache: ${filePath.replace(API_DIR, '')}`);
    return false;
  }
  
  // Skip if no withCache import
  if (!content.includes("import { withCache")) {
    console.log(`⏭️  No withCache import: ${filePath.replace(API_DIR, '')}`);
    return false;
  }
  
  // Skip if no GET function
  if (!content.includes('export async function GET')) {
    console.log(`⏭️  No GET function: ${filePath.replace(API_DIR, '')}`);
    return false;
  }

  const cacheKey = getCacheKey(filePath);
  const cacheTag = getCacheTag(filePath);
  const ttl = getTTL(filePath);
  
  let modified = false;

  // Pattern 1: Find .find() or .findOne() or .aggregate() followed by .lean() or not
  // Pattern: Model.find(query).sort(...).limit(...).lean()
  const findPattern = /const\s+(\w+)\s*=\s*await\s+(\w+)\.(find|findOne|findById|aggregate)\(([^;]*)\)(?:\.lean\(\))?;/g;
  
  content = content.replace(findPattern, (match, varName, model, method, args) => {
    // Skip if already wrapped
    if (match.includes('withCache')) return match;
    
    // Create cache key with query hash
    const dynamicKey = `${cacheKey}:\${JSON.stringify(${args.trim() || '{}'})}`;
    
    const wrapped = `const ${varName} = await withCache(
      \`${dynamicKey}\`,
      async () => await ${model}.${method}(${args})${method !== 'aggregate' ? '.lean()' : ''},
      { ttl: ${ttl}, tags: ['${cacheTag}'] }
    );`;
    
    modified = true;
    return wrapped;
  });

  // Pattern 2: Find simple queries without chaining
  // const data = await Model.find(query);
  const simplePattern = /const\s+(\w+)\s*=\s*await\s+(\w+)\.(find|findOne|findById)\(([^)]*)\)(?!\s*\.);/g;
  
  content = content.replace(simplePattern, (match, varName, model, method, args) => {
    if (match.includes('withCache')) return match;
    
    const dynamicKey = `${cacheKey}:${varName}:\${JSON.stringify(${args.trim() || '{}'})}`;
    
    const wrapped = `const ${varName} = await withCache(
      \`${dynamicKey}\`,
      async () => await ${model}.${method}(${args}).lean(),
      { ttl: ${ttl}, tags: ['${cacheTag}'] }
    );`;
    
    modified = true;
    return wrapped;
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Wrapped queries: ${filePath.replace(API_DIR, '')} (tag: ${cacheTag}, ttl: ${ttl}ms)`);
    return true;
  }
  
  console.log(`⏭️  No simple patterns matched: ${filePath.replace(API_DIR, '')}`);
  return false;
}

// Main execution
console.log('🚀 Wrapping database queries with cache...\n');

const routeFiles = getRouteFiles(API_DIR);
console.log(`Found ${routeFiles.length} route files\n`);

let updated = 0;
let skipped = 0;

for (const file of routeFiles) {
  try {
    if (wrapQueriesWithCache(file)) {
      updated++;
    } else {
      skipped++;
    }
  } catch (error) {
    console.error(`❌ Error processing ${file}: ${error.message}`);
    skipped++;
  }
}

console.log(`\n✨ Done! Updated: ${updated}, Skipped: ${skipped}`);
