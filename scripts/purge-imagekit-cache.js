/**
 * Purge ImageKit CDN cache for all folders.
 * Run after resolving billing issues to clear stale cached error responses.
 *
 * Usage: node scripts/purge-imagekit-cache.js
 */

const ImageKit = require("imagekit");
const path = require("path");

// Load .env (if dotenv is available) or use process.env directly
try {
    require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });
} catch {
    // dotenv not available — use env vars directly
}

const PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY;
const PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY;
const URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT;

if (!PUBLIC_KEY || !PRIVATE_KEY || !URL_ENDPOINT) {
    console.error(
        "❌ Missing ImageKit credentials. Set IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT.",
    );
    process.exit(1);
}

const imagekit = new ImageKit({
    publicKey: PUBLIC_KEY,
    privateKey: PRIVATE_KEY,
    urlEndpoint: URL_ENDPOINT,
});

// All folders used by the application
const FOLDERS = [
    "/profile",
    "/documents",
    "/recipes",
    "/messages",
    "/notes",
    "/transformation",
    "/medical-reports",
    "/bug",
    "/ecommerce",
    "/complete-meal",
    "/uploads",
];

async function purgeFolder(folder) {
    try {
        // ImageKit purgeCache accepts a URL pattern. We purge the entire folder
        // by purging a representative URL that matches the folder prefix.
        const folderPath = folder.startsWith("/") ? folder : `/${folder}`;
        const purgeUrl = `${URL_ENDPOINT}${folderPath}`;

        console.log(`🔄 Purging cache for: ${purgeUrl}...`);
        const result = await imagekit.purgeCache(purgeUrl);
        console.log(`✅ Purge requested: ${purgeUrl} → requestId: ${result.requestId || "OK"}`);
        return true;
    } catch (error) {
        // 404 / not found is OK — just means no cached content for that folder
        if (error?.$ResponseMetadata?.statusCode === 404 || error?.message?.includes("not found")) {
            console.log(`⚠️  No cached content for: ${folder} (skipped)`);
            return true;
        }
        console.error(`❌ Failed to purge ${folder}:`, error?.message || error);
        return false;
    }
}

async function main() {
    console.log("🧹 ImageKit CDN Cache Purge");
    console.log("===========================\n");
    console.log(`Endpoint: ${URL_ENDPOINT}`);
    console.log(`Folders to purge: ${FOLDERS.length}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const folder of FOLDERS) {
        const ok = await purgeFolder(folder);
        if (ok) successCount++;
        else failCount++;
    }

    console.log(`\n===========================`);
    console.log(`✅ Purged: ${successCount} folders`);
    if (failCount > 0) console.log(`❌ Failed: ${failCount} folders`);
    console.log(
        "\n⏱️  CDN cache purge may take a few minutes to propagate globally.",
    );
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
