#!/usr/bin/env node
/**
 * Script to add memory cache to all API routes
 * Run with: node scripts/add-cache-to-apis.js
 */

const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '../src/app/api');

// Cache TTL settings (in milliseconds)
const CACHE_CONFIG = {
  // Static/rarely changing data - 5 minutes
  static: 300000,
  // User data - 2 minutes
  user: 120000,
  // Frequently changing - 1 minute
  dynamic: 60000,
  // Real-time data - 30 seconds
  realtime: 30000,
};

// Route to cache tag mapping
const ROUTE_TAGS = {
  'tags': 'tags',
  'recipes': 'recipes',
  'users': 'users',
  'clients': 'clients',
  'appointments': 'appointments',
  'messages': 'messages',
  'meal-plan-templates': 'meal-templates',
  'diet-templates': 'diet-templates',
  'subscription-plans': 'subscription-plans',
  'service-plans': 'service-plans',
  'blogs': 'blogs',
  'transformations': 'transformations',
  'journal': 'journal',
  'progress': 'progress',
  'payments': 'payments',
  'subscriptions': 'subscriptions',
  'activity-logs': 'activity-logs',
  'food-logs': 'food-logs',
  'tracking': 'tracking',
  'fitness': 'fitness',
  'meals': 'meals',
  'wati-contacts': 'wati-contacts',
  'system-alerts': 'system-alerts',
};

// Routes to skip (webhooks, auth, realtime, SSE, upload)
const SKIP_PATTERNS = [
  'webhooks',
  'auth',
  'realtime',
  'sse',
  'upload',
  'stream',
  'signal',
  'health',
  'debug',
  'fcm',
  'zoom',
  'socketio',
  'test',
  'migrate',
  'sync',
  'verify',
  'send',
  'callback',
];

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

function shouldSkipRoute(routePath) {
  const relativePath = routePath.replace(API_DIR, '').toLowerCase();
  return SKIP_PATTERNS.some(pattern => relativePath.includes(pattern));
}

function getCacheTag(routePath) {
  const relativePath = routePath.replace(API_DIR, '');
  const parts = relativePath.split(path.sep).filter(p => p && p !== 'route.ts');
  
  for (const part of parts) {
    const cleanPart = part.replace(/\[.*\]/g, '').replace(/-/g, '');
    for (const [key, tag] of Object.entries(ROUTE_TAGS)) {
      if (key.replace(/-/g, '') === cleanPart || part === key) {
        return tag;
      }
    }
  }
  
  // Default tag from first meaningful part
  const firstPart = parts.find(p => !p.startsWith('['));
  return firstPart ? firstPart.replace(/-/g, '_') : 'api';
}

function getTTL(routePath) {
  const relativePath = routePath.replace(API_DIR, '').toLowerCase();
  
  if (relativePath.includes('messages') || relativePath.includes('notifications')) {
    return CACHE_CONFIG.realtime;
  }
  if (relativePath.includes('appointments') || relativePath.includes('tasks')) {
    return CACHE_CONFIG.dynamic;
  }
  if (relativePath.includes('users') || relativePath.includes('clients') || relativePath.includes('profile')) {
    return CACHE_CONFIG.user;
  }
  return CACHE_CONFIG.static;
}

function addCacheToFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already has cache import
  if (content.includes('withCache') || content.includes('serverCache')) {
    console.log(`⏭️  Skipping (already has cache): ${filePath.replace(API_DIR, '')}`);
    return false;
  }
  
  // Skip if no GET function
  if (!content.includes('export async function GET')) {
    console.log(`⏭️  Skipping (no GET): ${filePath.replace(API_DIR, '')}`);
    return false;
  }
  
  const cacheTag = getCacheTag(filePath);
  const ttl = getTTL(filePath);
  
  // Add import
  const importStatement = "import { withCache, clearCacheByTag } from '@/lib/api/utils';";
  
  // Find last import line
  const lines = content.split('\n');
  let lastImportIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ')) {
      lastImportIndex = i;
    }
  }
  
  if (lastImportIndex === -1) {
    console.log(`⚠️  No imports found: ${filePath.replace(API_DIR, '')}`);
    return false;
  }
  
  // Insert import after last import
  lines.splice(lastImportIndex + 1, 0, importStatement);
  content = lines.join('\n');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Added cache import: ${filePath.replace(API_DIR, '')} (tag: ${cacheTag}, ttl: ${ttl}ms)`);
  return true;
}

// Main execution
console.log('🚀 Adding cache to all API routes...\n');

const routeFiles = getRouteFiles(API_DIR);
console.log(`Found ${routeFiles.length} route files\n`);

let updated = 0;
let skipped = 0;

for (const file of routeFiles) {
  if (shouldSkipRoute(file)) {
    console.log(`⏭️  Skipping (excluded pattern): ${file.replace(API_DIR, '')}`);
    skipped++;
    continue;
  }
  
  if (addCacheToFile(file)) {
    updated++;
  } else {
    skipped++;
  }
}

console.log(`\n✨ Done! Updated: ${updated}, Skipped: ${skipped}`);
console.log('\n⚠️  Note: Cache imports added. You may need to manually wrap database queries with withCache().');
