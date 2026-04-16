#!/usr/bin/env node
/**
 * Benchmark ALL API routes using supertest.
 *
 * Usage:
 *   1. Start the dev server:  npm run dev
 *   2. Run this script:       node scripts/benchmark-all-apis-supertest.js
 *
 * Options (env vars):
 *   BASE_URL   – default http://localhost:3000
 *   RUNS       – requests per endpoint (default 3)
 */

const supertest = require('supertest');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const RUNS = parseInt(process.env.RUNS || '3', 10);

const request = supertest(BASE_URL);

// ── All discovered API routes ────────────────────────────────────────
// Dynamic segments get a dummy value so the route resolves.
const ROUTES = [
    { path: '/api/activity-assignments', methods: ['GET'] },
    { path: '/api/activity-logs', methods: ['GET'] },
    { path: '/api/admin/appointment-config', methods: ['GET'] },
    { path: '/api/admin/audit-logs', methods: ['GET'] },
    { path: '/api/admin/audit-logs/smart-people', methods: ['GET'] },
    { path: '/api/admin/blogs/test-id', methods: ['GET'] },
    { path: '/api/admin/blogs', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/assign-activities', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/assign-sleep', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/assign-steps', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/assign-water', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/assign', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/dietary-recall', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/documents', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/lifestyle-info', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/measurements', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/medical-info', methods: ['GET'] },
    { path: '/api/admin/clients/test-id/profile', methods: ['GET'] },
    { path: '/api/admin/clients/test-id', methods: ['GET'] },
    { path: '/api/admin/clients', methods: ['GET'] },
    { path: '/api/admin/data/bulk-update', methods: ['POST'] },
    { path: '/api/admin/data/export', methods: ['GET'] },
    { path: '/api/admin/data/records', methods: ['GET'] },
    { path: '/api/admin/dietitians/test-id', methods: ['GET'] },
    { path: '/api/admin/dietitians', methods: ['GET'] },
    { path: '/api/admin/duration-presets', methods: ['GET'] },
    { path: '/api/admin/ecommerce/blogs/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/blogs', methods: ['GET'] },
    { path: '/api/admin/ecommerce/orders/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/orders', methods: ['GET'] },
    { path: '/api/admin/ecommerce/orders/sync', methods: ['GET'] },
    { path: '/api/admin/ecommerce/payments/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/payments', methods: ['GET'] },
    { path: '/api/admin/ecommerce/payments/sync', methods: ['GET'] },
    { path: '/api/admin/ecommerce/plans/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/plans', methods: ['GET'] },
    { path: '/api/admin/ecommerce/ratings/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/ratings', methods: ['GET'] },
    { path: '/api/admin/ecommerce/transformations/test-id', methods: ['GET'] },
    { path: '/api/admin/ecommerce/transformations', methods: ['GET'] },
    { path: '/api/admin/goal-categories/test-id', methods: ['GET'] },
    { path: '/api/admin/goal-categories', methods: ['GET'] },
    { path: '/api/admin/health-counselors/test-id', methods: ['GET'] },
    { path: '/api/admin/health-counselors', methods: ['GET'] },
    { path: '/api/admin/import/export', methods: ['GET'] },
    { path: '/api/admin/import/models', methods: ['GET'] },
    { path: '/api/admin/import/row', methods: ['POST'] },
    { path: '/api/admin/import/save', methods: ['POST'] },
    { path: '/api/admin/import/session', methods: ['GET'] },
    { path: '/api/admin/import/upload', methods: ['POST'] },
    { path: '/api/admin/leads/test-id', methods: ['GET'] },
    { path: '/api/admin/leads', methods: ['GET'] },
    { path: '/api/admin/migrate-client-status', methods: ['GET'] },
    { path: '/api/admin/notifications/metrics', methods: ['GET'] },
    { path: '/api/admin/notifications/send', methods: ['POST'] },
    { path: '/api/admin/payments', methods: ['GET'] },
    { path: '/api/admin/payments/sync-status', methods: ['GET'] },
    { path: '/api/admin/payments/sync', methods: ['POST'] },
    { path: '/api/admin/permissions/check', methods: ['GET'] },
    { path: '/api/admin/permissions', methods: ['GET'] },
    { path: '/api/admin/recent-activity', methods: ['GET'] },
    { path: '/api/admin/recipes/bulk-update', methods: ['POST'] },
    { path: '/api/admin/recipes/import', methods: ['POST'] },
    { path: '/api/admin/recipes/update', methods: ['POST'] },
    { path: '/api/admin/service-plans', methods: ['GET'] },
    { path: '/api/admin/subscription-plans', methods: ['GET'] },
    { path: '/api/admin/system-alerts', methods: ['GET'] },
    { path: '/api/admin/tags/test-id', methods: ['GET'] },
    { path: '/api/admin/tags', methods: ['GET'] },
    { path: '/api/admin/top-dietitians', methods: ['GET'] },
    { path: '/api/admin/transformations/test-id', methods: ['GET'] },
    { path: '/api/admin/transformations', methods: ['GET'] },
    { path: '/api/admin/users/test-id/activity', methods: ['GET'] },
    { path: '/api/admin/users/test-id/password', methods: ['POST'] },
    { path: '/api/analytics/stats', methods: ['GET'] },
    { path: '/api/appointments/test-id/reschedule', methods: ['POST'] },
    { path: '/api/appointments/test-id', methods: ['GET'] },
    { path: '/api/appointments/available-slots', methods: ['GET'] },
    { path: '/api/appointments/provider-availability', methods: ['GET'] },
    { path: '/api/appointments', methods: ['GET'] },
    { path: '/api/auth/change-password', methods: ['POST'] },
    { path: '/api/auth/client-login', methods: ['POST'] },
    { path: '/api/auth/forgot-password', methods: ['POST'] },
    { path: '/api/auth/google-calendar/callback', methods: ['GET'] },
    { path: '/api/auth/google-calendar', methods: ['GET'] },
    { path: '/api/auth/logout-notification', methods: ['POST'] },
    { path: '/api/auth/logout', methods: ['POST'] },
    { path: '/api/auth/otp/send', methods: ['POST'] },
    { path: '/api/auth/otp/verify', methods: ['POST'] },
    { path: '/api/auth/register', methods: ['POST'] },
    { path: '/api/auth/reset-password', methods: ['POST'] },
    { path: '/api/client-meal-plans/test-id/extend', methods: ['POST'] },
    { path: '/api/client-meal-plans/test-id/freeze', methods: ['GET'] },
    { path: '/api/client-meal-plans/test-id', methods: ['GET'] },
    { path: '/api/client-meal-plans', methods: ['GET'] },
    { path: '/api/client-purchases/check', methods: ['GET'] },
    { path: '/api/client-purchases', methods: ['GET'] },
    { path: '/api/client/activity', methods: ['GET'] },
    { path: '/api/client/appointments', methods: ['GET'] },
    { path: '/api/client/billing', methods: ['GET'] },
    { path: '/api/client/blogs/test-id', methods: ['GET'] },
    { path: '/api/client/blogs', methods: ['GET'] },
    { path: '/api/client/bmi', methods: ['GET'] },
    { path: '/api/client/dashboard-summary', methods: ['GET'] },
    { path: '/api/client/delete-account', methods: ['DELETE'] },
    { path: '/api/client/dietary-recall', methods: ['GET'] },
    { path: '/api/client/hydration', methods: ['GET'] },
    { path: '/api/client/lifestyle-info', methods: ['GET'] },
    { path: '/api/client/meal-plan/complete', methods: ['POST'] },
    { path: '/api/client/meal-plan', methods: ['GET'] },
    { path: '/api/client/medical-info', methods: ['GET'] },
    { path: '/api/client/messages/test-id', methods: ['DELETE'] },
    { path: '/api/client/messages/conversations', methods: ['GET'] },
    { path: '/api/client/messages', methods: ['GET'] },
    { path: '/api/client/messages/unread-count', methods: ['GET'] },
    { path: '/api/client/notifications', methods: ['GET'] },
    { path: '/api/client/notifications/unread-count', methods: ['GET'] },
    { path: '/api/client/onboarding', methods: ['GET'] },
    { path: '/api/client/payment-receipt', methods: ['GET'] },
    { path: '/api/client/profile', methods: ['GET'] },
    { path: '/api/client/progress', methods: ['GET'] },
    { path: '/api/client/purchase-request', methods: ['POST'] },
    { path: '/api/client/send-receipt', methods: ['POST'] },
    { path: '/api/client/service-plans/purchase', methods: ['POST'] },
    { path: '/api/client/service-plans', methods: ['GET'] },
    { path: '/api/client/service-plans/verify-link', methods: ['GET'] },
    { path: '/api/client/service-plans/verify', methods: ['POST'] },
    { path: '/api/client/settings', methods: ['GET'] },
    { path: '/api/client/sleep', methods: ['GET'] },
    { path: '/api/client/steps', methods: ['GET'] },
    { path: '/api/client/subscriptions/purchase', methods: ['POST'] },
    { path: '/api/client/subscriptions', methods: ['GET'] },
    { path: '/api/client/subscriptions/verify', methods: ['POST'] },
    { path: '/api/client/tasks', methods: ['GET'] },
    { path: '/api/client/transformations', methods: ['GET'] },
    { path: '/api/client/unread-counts/refresh', methods: ['GET'] },
    { path: '/api/clients/test-id/assign', methods: ['GET'] },
    { path: '/api/clients/test-id/phase-history', methods: ['GET'] },
    { path: '/api/clients/test-id/tasks/test-task/google-calendar', methods: ['POST'] },
    { path: '/api/clients/test-id/tasks/test-task', methods: ['GET'] },
    { path: '/api/clients/test-id/tasks', methods: ['GET'] },
    { path: '/api/clients/migrate-woocommerce', methods: ['POST'] },
    { path: '/api/clients/update-passwords', methods: ['POST'] },
    { path: '/api/clients/woocommerce', methods: ['GET'] },
    { path: '/api/dashboard/admin-stats', methods: ['GET'] },
    { path: '/api/dashboard/client-stats', methods: ['GET'] },
    { path: '/api/dashboard/dietitian-stats', methods: ['GET'] },
    { path: '/api/dashboard/health-counselor-stats', methods: ['GET'] },
    { path: '/api/dashboard/pending-plans', methods: ['GET'] },
    { path: '/api/debug/check-dietitian', methods: ['GET'] },
    { path: '/api/diet-templates/test-id', methods: ['GET'] },
    { path: '/api/diet-templates', methods: ['GET'] },
    { path: '/api/dietitian-panel/clients/test-id/dietary-recall', methods: ['GET'] },
    { path: '/api/dietitian-panel/clients/test-id/documents', methods: ['GET'] },
    { path: '/api/dietitian-panel/clients/test-id/lifestyle-info', methods: ['GET'] },
    { path: '/api/dietitian-panel/clients/test-id/medical-info', methods: ['GET'] },
    { path: '/api/dietitian-panel/clients/test-id/profile', methods: ['GET'] },
    { path: '/api/drafts', methods: ['GET'] },
    { path: '/api/duration-presets', methods: ['GET'] },
    { path: '/api/ecommerce/blogs', methods: ['GET'] },
    { path: '/api/ecommerce/plans', methods: ['GET'] },
    { path: '/api/ecommerce/ratings', methods: ['GET'] },
    { path: '/api/ecommerce/transformations', methods: ['GET'] },
    { path: '/api/fcm/send', methods: ['POST'] },
    { path: '/api/fcm/token', methods: ['POST'] },
    { path: '/api/files/test-id', methods: ['GET'] },
    { path: '/api/firebase-config', methods: ['GET'] },
    { path: '/api/fitness', methods: ['GET'] },
    { path: '/api/food-logs', methods: ['GET'] },
    { path: '/api/health', methods: ['GET'] },
    { path: '/api/invoices/test-id', methods: ['GET'] },
    { path: '/api/journal/activity', methods: ['GET'] },
    { path: '/api/journal/bca', methods: ['GET'] },
    { path: '/api/journal/compliance', methods: ['GET'] },
    { path: '/api/journal/meals', methods: ['GET'] },
    { path: '/api/journal/measurements', methods: ['GET'] },
    { path: '/api/journal/progress', methods: ['GET'] },
    { path: '/api/journal', methods: ['GET'] },
    { path: '/api/journal/sleep', methods: ['GET'] },
    { path: '/api/journal/steps', methods: ['GET'] },
    { path: '/api/journal/water', methods: ['GET'] },
    { path: '/api/leads', methods: ['GET'] },
    { path: '/api/meal-plan-templates/test-id', methods: ['GET'] },
    { path: '/api/meal-plan-templates', methods: ['GET'] },
    { path: '/api/meals/test-id', methods: ['GET'] },
    { path: '/api/meals', methods: ['GET'] },
    { path: '/api/messages/test-id', methods: ['GET'] },
    { path: '/api/messages/test-id/status', methods: ['PUT'] },
    { path: '/api/messages/bulk', methods: ['POST'] },
    { path: '/api/messages/conversations', methods: ['GET'] },
    { path: '/api/messages/groups/test-id/messages', methods: ['GET'] },
    { path: '/api/messages/groups/test-id', methods: ['GET'] },
    { path: '/api/messages/groups', methods: ['GET'] },
    { path: '/api/messages', methods: ['GET'] },
    { path: '/api/messages/status', methods: ['PUT'] },
    { path: '/api/other-platform-payments/test-id', methods: ['GET'] },
    { path: '/api/other-platform-payments', methods: ['GET'] },
    { path: '/api/payment-links/invoice', methods: ['POST'] },
    { path: '/api/payment-links/public/test-id', methods: ['GET'] },
    { path: '/api/payment-links/reminder', methods: ['POST'] },
    { path: '/api/payment-links', methods: ['GET'] },
    { path: '/api/payment-links/sync', methods: ['POST'] },
    { path: '/api/payment-links/verify', methods: ['POST'] },
    { path: '/api/payment-links/webhook', methods: ['POST'] },
    { path: '/api/payments', methods: ['GET'] },
    { path: '/api/progress/photos', methods: ['GET'] },
    { path: '/api/progress', methods: ['GET'] },
    { path: '/api/realtime/send', methods: ['POST'] },
    { path: '/api/realtime/status', methods: ['GET'] },
    { path: '/api/realtime/typing', methods: ['POST'] },
    { path: '/api/receipts/test-id', methods: ['GET'] },
    { path: '/api/recipes/test-id', methods: ['GET'] },
    { path: '/api/recipes/ai-bulk', methods: ['POST'] },
    { path: '/api/recipes/ai-generate', methods: ['POST'] },
    { path: '/api/recipes/import', methods: ['POST'] },
    { path: '/api/recipes', methods: ['GET'] },
    { path: '/api/reports/test-id', methods: ['GET'] },
    { path: '/api/sentry-example-api', methods: ['GET'] },
    { path: '/api/service-plans/test-id', methods: ['GET'] },
    { path: '/api/service-plans', methods: ['GET'] },
    { path: '/api/staff/unread-counts/refresh', methods: ['GET'] },
    { path: '/api/subscription-plans', methods: ['GET'] },
    { path: '/api/subscriptions/test-id', methods: ['GET'] },
    { path: '/api/subscriptions', methods: ['GET'] },
    { path: '/api/subscriptions/verify-payment', methods: ['POST'] },
    { path: '/api/support/bug-report', methods: ['POST'] },
    { path: '/api/support/contact', methods: ['POST'] },
    { path: '/api/system-alerts/test-id', methods: ['GET'] },
    { path: '/api/system-alerts/bulk', methods: ['POST'] },
    { path: '/api/system-alerts', methods: ['GET'] },
    { path: '/api/tags/test-id', methods: ['GET'] },
    { path: '/api/tags', methods: ['GET'] },
    { path: '/api/test-email', methods: ['POST'] },
    { path: '/api/tracking/sleep', methods: ['GET'] },
    { path: '/api/tracking/steps', methods: ['GET'] },
    { path: '/api/tracking/water', methods: ['GET'] },
    { path: '/api/tracking/weight', methods: ['GET'] },
    { path: '/api/upload-image', methods: ['POST'] },
    { path: '/api/upload', methods: ['POST'] },
    { path: '/api/user/forget-password', methods: ['POST'] },
    { path: '/api/user/reset-password', methods: ['POST'] },
    { path: '/api/users/test-id/documents', methods: ['GET'] },
    { path: '/api/users/test-id/history', methods: ['GET'] },
    { path: '/api/users/test-id/lifestyle', methods: ['GET'] },
    { path: '/api/users/test-id/medical', methods: ['GET'] },
    { path: '/api/users/test-id/medical/upload', methods: ['POST'] },
    { path: '/api/users/test-id/notes/test-note', methods: ['GET'] },
    { path: '/api/users/test-id/notes', methods: ['GET'] },
    { path: '/api/users/test-id/recall/test-recall', methods: ['GET'] },
    { path: '/api/users/test-id/recall', methods: ['GET'] },
    { path: '/api/users/test-id', methods: ['GET'] },
    { path: '/api/users/test-id/tasks/test-task', methods: ['GET'] },
    { path: '/api/users/test-id/tasks', methods: ['GET'] },
    { path: '/api/users/available-for-chat', methods: ['GET'] },
    { path: '/api/users/available', methods: ['GET'] },
    { path: '/api/users/clients', methods: ['GET'] },
    { path: '/api/users/dietitian/availability', methods: ['GET'] },
    { path: '/api/users/dietitian/availability/setup', methods: ['POST'] },
    { path: '/api/users/dietitian', methods: ['GET'] },
    { path: '/api/users/dietitians', methods: ['GET'] },
    { path: '/api/users/health-counselors', methods: ['GET'] },
    { path: '/api/users', methods: ['GET'] },
    { path: '/api/watch/connect', methods: ['POST'] },
    { path: '/api/watch/data', methods: ['GET'] },
    { path: '/api/watch/flashlight', methods: ['GET'] },
    { path: '/api/watch/oauth/callback', methods: ['GET'] },
    { path: '/api/watch/settings', methods: ['GET'] },
    { path: '/api/watch/sync', methods: ['POST'] },
    { path: '/api/wati-contacts', methods: ['GET'] },
    { path: '/api/webhooks/endpoints', methods: ['GET'] },
    { path: '/api/webhooks/razorpay', methods: ['POST'] },
    { path: '/api/webhooks/stripe', methods: ['POST'] },
    { path: '/api/webrtc/signal', methods: ['POST'] },
    { path: '/api/webrtc/simple-signal', methods: ['POST'] },
    { path: '/api/woocommerce/from-db', methods: ['GET'] },
    { path: '/api/woocommerce/orders', methods: ['GET'] },
    { path: '/api/woocommerce/save-to-db', methods: ['POST'] },
    { path: '/api/wordpress/media', methods: ['POST'] },
];

// ── Skip destructive / side-effect heavy endpoints ───────────────────
const SKIP_METHODS = new Set([
    'POST /api/auth/register',
    'POST /api/auth/logout',
    'POST /api/auth/change-password',
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password',
    'POST /api/auth/otp/send',
    'POST /api/auth/otp/verify',
    'POST /api/auth/client-login',
    'POST /api/auth/logout-notification',
    'DELETE /api/client/delete-account',
    'POST /api/admin/data/bulk-update',
    'POST /api/admin/notifications/send',
    'POST /api/admin/payments/sync',
    'POST /api/admin/recipes/bulk-update',
    'POST /api/admin/recipes/import',
    'POST /api/admin/recipes/update',
    'POST /api/admin/import/upload',
    'POST /api/admin/import/save',
    'POST /api/admin/import/row',
    'POST /api/clients/migrate-woocommerce',
    'POST /api/clients/update-passwords',
    'POST /api/fcm/send',
    'POST /api/fcm/token',
    'POST /api/messages/bulk',
    'POST /api/payment-links/webhook',
    'POST /api/realtime/send',
    'POST /api/realtime/typing',
    'POST /api/recipes/ai-bulk',
    'POST /api/recipes/ai-generate',
    'POST /api/recipes/import',
    'POST /api/support/bug-report',
    'POST /api/support/contact',
    'POST /api/system-alerts/bulk',
    'POST /api/test-email',
    'POST /api/upload',
    'POST /api/upload-image',
    'POST /api/user/forget-password',
    'POST /api/user/reset-password',
    'POST /api/users/test-id/medical/upload',
    'POST /api/watch/connect',
    'POST /api/watch/sync',
    'POST /api/webhooks/razorpay',
    'POST /api/webhooks/stripe',
    'POST /api/webrtc/signal',
    'POST /api/webrtc/simple-signal',
    'POST /api/woocommerce/save-to-db',
    'POST /api/wordpress/media',
    'POST /api/client/purchase-request',
    'POST /api/client/send-receipt',
    'POST /api/client/service-plans/purchase',
    'POST /api/client/service-plans/verify',
    'POST /api/client/subscriptions/purchase',
    'POST /api/client/subscriptions/verify',
    'POST /api/client/meal-plan/complete',
    'POST /api/client-meal-plans/test-id/extend',
    'POST /api/subscriptions/verify-payment',
    'POST /api/payment-links/invoice',
    'POST /api/payment-links/reminder',
    'POST /api/payment-links/sync',
    'POST /api/payment-links/verify',
    'PUT /api/messages/test-id/status',
    'PUT /api/messages/status',
    'POST /api/appointments/test-id/reschedule',
    'POST /api/admin/users/test-id/password',
    'POST /api/clients/test-id/tasks/test-task/google-calendar',
    'POST /api/users/dietitian/availability/setup',
]);

// ── Helpers ──────────────────────────────────────────────────────────
async function benchmark(method, path, runs) {
    const times = [];
    const statuses = [];
    for (let i = 0; i < runs; i++) {
        const start = process.hrtime.bigint();
        try {
            const res = await request[method.toLowerCase()](path)
                .timeout({ response: 15000, deadline: 20000 })
                .set('Accept', 'application/json');
            statuses.push(res.status);
        } catch (err) {
            statuses.push(err.status || 'ERR');
        }
        const end = process.hrtime.bigint();
        times.push(Number(end - start) / 1e6); // ms
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { avg, min, max, status: statuses[0] };
}

function pad(str, len) {
    str = String(str);
    return str.length >= len ? str : str + ' '.repeat(len - str.length);
}
function padL(str, len) {
    str = String(str);
    return str.length >= len ? str : ' '.repeat(len - str.length) + str;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
    console.log(`\n🔥 API Benchmark — ${BASE_URL} — ${RUNS} run(s) per endpoint\n`);

    // Quick health check
    try {
        await request.get('/api/health').timeout({ response: 5000 });
    } catch {
        console.error('❌ Server not reachable at ' + BASE_URL);
        console.error('   Start the dev server first: npm run dev');
        process.exit(1);
    }

    const results = [];
    let total = 0;

    for (const route of ROUTES) {
        for (const method of route.methods) {
            const key = `${method} ${route.path}`;
            if (SKIP_METHODS.has(key)) continue;
            total++;
        }
    }

    let done = 0;
    for (const route of ROUTES) {
        for (const method of route.methods) {
            const key = `${method} ${route.path}`;
            if (SKIP_METHODS.has(key)) continue;
            done++;
            process.stdout.write(`\r  [${done}/${total}] ${key}` + ' '.repeat(40));
            const { avg, min, max, status } = await benchmark(method, route.path, RUNS);
            results.push({ method, path: route.path, avg, min, max, status });
        }
    }

    process.stdout.write('\r' + ' '.repeat(100) + '\r');

    // Sort by avg descending (slowest first)
    results.sort((a, b) => b.avg - a.avg);

    // Print table
    const hMethod = 'Method';
    const hPath = 'API Path';
    const hStatus = 'Status';
    const hAvg = 'Avg (ms)';
    const hMin = 'Min (ms)';
    const hMax = 'Max (ms)';

    const colW = { method: 7, path: 60, status: 7, avg: 10, min: 10, max: 10 };

    const sep = '-'.repeat(colW.method + colW.path + colW.status + colW.avg + colW.min + colW.max + 17);

    console.log(sep);
    console.log(
        `| ${pad(hMethod, colW.method)} | ${pad(hPath, colW.path)} | ${padL(hStatus, colW.status)} | ${padL(hAvg, colW.avg)} | ${padL(hMin, colW.min)} | ${padL(hMax, colW.max)} |`
    );
    console.log(sep);

    for (const r of results) {
        console.log(
            `| ${pad(r.method, colW.method)} | ${pad(r.path, colW.path)} | ${padL(String(r.status), colW.status)} | ${padL(r.avg.toFixed(1), colW.avg)} | ${padL(r.min.toFixed(1), colW.min)} | ${padL(r.max.toFixed(1), colW.max)} |`
        );
    }
    console.log(sep);

    // Summary stats
    const allAvg = results.map(r => r.avg);
    const globalAvg = allAvg.reduce((a, b) => a + b, 0) / allAvg.length;
    const globalMin = Math.min(...results.map(r => r.min));
    const globalMax = Math.max(...results.map(r => r.max));
    const slowest = results[0];
    const fastest = results[results.length - 1];

    console.log(`\n📊 Summary:`);
    console.log(`   Total endpoints tested: ${results.length}`);
    console.log(`   Global avg: ${globalAvg.toFixed(1)} ms`);
    console.log(`   Global min: ${globalMin.toFixed(1)} ms`);
    console.log(`   Global max: ${globalMax.toFixed(1)} ms`);
    console.log(`   Slowest: ${slowest.method} ${slowest.path} (avg ${slowest.avg.toFixed(1)} ms)`);
    console.log(`   Fastest: ${fastest.method} ${fastest.path} (avg ${fastest.avg.toFixed(1)} ms)`);

    // Status code breakdown
    const statusCounts = {};
    for (const r of results) {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
    }
    console.log(`\n📋 Status code breakdown:`);
    for (const [code, count] of Object.entries(statusCounts).sort()) {
        console.log(`   ${code}: ${count} endpoints`);
    }

    console.log('');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
