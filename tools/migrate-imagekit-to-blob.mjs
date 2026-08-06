#!/usr/bin/env node

import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { EJSON } from "bson";
import { head, list, put } from "@vercel/blob";
import { MongoClient } from "mongodb";

const EXECUTE = process.argv.includes("--execute");
const CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] || 4)),
);
const IMAGEKIT_PATTERN = /https:\/\/ik\.imagekit\.io\/[^\s"'<>]+/gi;
const BLOB_PREFIX = "legacy-imagekit/";
const MIGRATION_COLLECTION = "blobmediamigrations";

// Projected media-bearing fields keep the inventory bounded even on large collections.
const COLLECTION_FIELDS = {
  files: { fields: ["filename", "originalName", "mimeType", "size", "imageKitUrl", "imageKitFileId", "metadata"], search: ["imageKitUrl", "metadata.publicUrl"] },
  messages: { fields: ["attachments"], search: ["attachments.url", "attachments.thumbnail"] },
  groupmessages: { fields: ["attachments"], search: ["attachments.url", "attachments.thumbnail"] },
  users: { fields: ["avatar", "documents"], search: ["avatar", "documents.filePath"] },
  progressentries: { fields: ["value", "metadata"], search: ["value", "metadata.imageKitUrl", "metadata.publicUrl"] },
  clientmealplans: { fields: ["progress", "mealCompletions"], search: ["progress.photos", "mealCompletions.imagePath"] },
  clientnotes: { fields: ["attachments"], search: ["attachments.url", "attachments.thumbnail"] },
  medicalinfos: { fields: ["reports"], search: ["reports.url"] },
  recipes: { fields: ["image", "images", "videoUrl"], search: ["image", "images", "videoUrl"] },
  transformations: { fields: ["beforeImage", "beforeImageFileId", "afterImage", "afterImageFileId"], search: ["beforeImage", "afterImage"] },
  blogs: { fields: ["thumbnailImage", "content"], search: ["thumbnailImage", "content"] },
  clientdocuments: { fields: ["filePath"], search: ["filePath"] },
  otherplatformpayments: { fields: ["receiptImage", "receiptImageUrl", "receiptImageFileId"], search: ["receiptImage", "receiptImageUrl"] },
  ecommerceblog: { fields: ["imageUrl", "imageKitFileId", "raw"], search: ["imageUrl", "raw.imageUrl"] },
  ecommerceplan: { fields: ["imageUrl", "imageKitFileId", "raw"], search: ["imageUrl", "raw.imageUrl"] },
  ecommercerating: { fields: ["imageUrl", "imageKitFileId", "raw"], search: ["imageUrl", "raw.imageUrl"] },
  ecommercetransformation: { fields: ["beforeImageUrl", "afterImageUrl", "imageKitFileIdBefore", "imageKitFileIdAfter", "raw"], search: ["beforeImageUrl", "afterImageUrl", "raw.beforeImageUrl", "raw.afterImageUrl"] },
  journaltrackings: { fields: ["mealEntries", "videoLink"], search: ["mealEntries.photo", "videoLink"] },
  messagegroups: { fields: ["avatar"], search: ["avatar"] },
  waticontacts: { fields: ["photo"], search: ["photo"] },
  // Template meal payloads are intentionally flexible, so these two small collections are scanned fully.
  diettemplates: { fields: ["meals"], fullScan: true },
  mealplantemplates: { fields: ["meals"], fullScan: true },
};

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function projection(fields) {
  return Object.fromEntries(fields.map((field) => [field, 1]));
}

function walkStrings(value, visit, currentPath = "") {
  if (typeof value === "string") {
    visit(value, currentPath);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value) || value?._bsontype) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    walkStrings(child, visit, currentPath ? `${currentPath}.${key}` : key);
  }
}

function imageKitUrls(value) {
  return typeof value === "string" ? value.match(IMAGEKIT_PATTERN) || [] : [];
}

function replaceImageKitUrls(value, replacements) {
  return value.replace(IMAGEKIT_PATTERN, (source) => replacements.get(source)?.url || source);
}

function safeFilename(source, contentType = "") {
  let filename = "media";
  try {
    filename = decodeURIComponent(path.basename(new URL(source).pathname)) || filename;
  } catch {
    // The source was already validated by fetch; retain the fallback name.
  }
  filename = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-140) || "media";
  if (!path.extname(filename)) {
    const extension = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "application/pdf": ".pdf",
      "audio/webm": ".webm",
      "audio/mpeg": ".mp3",
      "video/mp4": ".mp4",
    }[contentType.split(";", 1)[0].toLowerCase()];
    if (extension) filename += extension;
  }
  return filename;
}

function blobPathname(source, contentType = "") {
  const digest = crypto.createHash("sha256").update(source).digest("hex").slice(0, 20);
  return `${BLOB_PREFIX}${digest}-${safeFilename(source, contentType)}`;
}

function canonicalSource(source) {
  try {
    const url = new URL(source);
    return `${url.origin}${url.pathname}`;
  } catch {
    return source;
  }
}

function sourceFolder(source) {
  try {
    const segments = new URL(source).pathname.split("/").filter(Boolean);
    return segments[1] || segments[0] || "root";
  } catch {
    return "invalid";
  }
}

async function mapLimit(values, limit, operation) {
  const results = new Array(values.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function collectInventory(db) {
  const collections = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name),
  );
  const urls = new Map();
  const documents = new Map();
  const byCollection = {};

  const priority = new Map(["clientmealplans", "messages", "files"].map((name, index) => [name, index]));
  const entries = Object.entries(COLLECTION_FIELDS)
    .filter(([collectionName]) => collections.has(collectionName))
    .sort(([left], [right]) => (priority.get(left) ?? 99) - (priority.get(right) ?? 99));

  await mapLimit(entries, 3, async ([collectionName, config]) => {
    let occurrences = 0;
    const query = config.fullScan
      ? {}
      : { $or: config.search.map((field) => ({ [field]: { $regex: "ik\\.imagekit\\.io", $options: "i" } })) };
    const cursor = db.collection(collectionName).find(query, {
      projection: projection(config.fields),
      batchSize: 250,
    });
    for await (const document of cursor) {
      const documentUrls = new Set();
      walkStrings(document, (text) => {
        for (const source of imageKitUrls(text)) {
          occurrences += 1;
          documentUrls.add(source);
          urls.set(source, (urls.get(source) || 0) + 1);
        }
      });
      if (documentUrls.size) {
        documents.set(`${collectionName}:${document._id}`, {
          collectionName,
          id: document._id,
          document,
          urls: documentUrls,
        });
      }
    }
    if (occurrences) byCollection[collectionName] = occurrences;
    console.error(`[Inventory] ${collectionName}: ${occurrences} ImageKit references`);
  });
  return { urls, documents, byCollection };
}

async function listBlobInventory(token) {
  const all = [];
  let cursor;
  do {
    const page = await list({ prefix: BLOB_PREFIX, limit: 1000, cursor, token });
    all.push(...page.blobs);
    if (!page.hasMore) break;
    cursor = page.cursor;
  } while (cursor);
  return new Map(all.map((blob) => [blob.pathname, blob]));
}

async function probeSource(source) {
  try {
    const response = await fetch(source, { method: "HEAD", signal: AbortSignal.timeout(15_000) });
    if (response.ok) {
      return {
        source,
        ok: true,
        contentType: response.headers.get("content-type") || "application/octet-stream",
        size: Number(response.headers.get("content-length") || 0),
      };
    }
    return { source, ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { source, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function backupAffectedDocuments(inventory) {
  const backupDirectory = path.join(process.cwd(), ".migration-backups");
  await fs.mkdir(backupDirectory, { recursive: true });
  const backup = {
    createdAt: new Date(),
    migration: "imagekit-to-vercel-blob",
    documents: [...inventory.documents.values()].map(({ collectionName, document }) => ({
      collectionName,
      document,
    })),
  };
  const backupPath = path.join(
    backupDirectory,
    `imagekit-to-blob-${new Date().toISOString().replace(/[:.]/g, "-")}.ejson.gz`,
  );
  await fs.writeFile(backupPath, gzipSync(Buffer.from(EJSON.stringify(backup))));
  return backupPath;
}

async function uploadSource(source, token, existingBlobs) {
  const response = await fetch(source, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`${source}: empty response`);
  const pathname = blobPathname(source, contentType);
  const existing = existingBlobs.get(pathname);
  const blob = existing || await put(pathname, bytes, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType,
    multipart: bytes.length > 4_000_000,
    token,
  });
  const verified = await head(blob.url, { token });
  if (verified.size !== bytes.length) {
    throw new Error(`${source}: Blob size mismatch (${verified.size} !== ${bytes.length})`);
  }
  return {
    source,
    url: blob.url,
    pathname: blob.pathname,
    size: bytes.length,
    contentType,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

const RELATED_ID_FIELDS = {
  imageKitUrl: "imageKitFileId",
  imageUrl: "imageKitFileId",
  beforeImageUrl: "imageKitFileIdBefore",
  afterImageUrl: "imageKitFileIdAfter",
  beforeImage: "beforeImageFileId",
  afterImage: "afterImageFileId",
  receiptImageUrl: "receiptImageFileId",
  imagePath: "imageKitFileId",
};

function buildDocumentUpdate(document, replacements) {
  const set = {};
  walkStrings(document, (text, fieldPath) => {
    const migratedSources = imageKitUrls(text).filter((source) => replacements.has(source));
    if (!migratedSources.length) return;
    set[fieldPath] = replaceImageKitUrls(text, replacements);

    const segments = fieldPath.split(".");
    const field = segments.at(-1);
    const relatedField = RELATED_ID_FIELDS[field];
    if (relatedField && migratedSources.length === 1) {
      set[[...segments.slice(0, -1), relatedField].join(".")] = replacements.get(migratedSources[0]).pathname;
    }
  });
  if (document.imageKitUrl && replacements.has(document.imageKitUrl)) {
    const migrated = replacements.get(document.imageKitUrl);
    set["metadata.storage"] = "vercel-blob";
    set["metadata.blobPathname"] = migrated.pathname;
  }
  return set;
}

async function migrateReferences(db, inventory, replacements) {
  const operationsByCollection = new Map();
  for (const { collectionName, id, document } of inventory.documents.values()) {
    const set = buildDocumentUpdate(document, replacements);
    if (!Object.keys(set).length) continue;
    const operations = operationsByCollection.get(collectionName) || [];
    operations.push({ updateOne: { filter: { _id: id }, update: { $set: set } } });
    operationsByCollection.set(collectionName, operations);
  }

  const results = {};
  for (const [collectionName, operations] of operationsByCollection) {
    let matched = 0;
    let modified = 0;
    for (let index = 0; index < operations.length; index += 250) {
      const result = await db.collection(collectionName).bulkWrite(
        operations.slice(index, index + 250),
        { ordered: false },
      );
      matched += result.matchedCount;
      modified += result.modifiedCount;
    }
    results[collectionName] = { matched, modified };
  }
  return results;
}

async function main() {
  const mongoUri = required("MONGODB_URI");
  const blobToken = required("BLOB_READ_WRITE_TOKEN");
  const client = new MongoClient(mongoUri, { maxPoolSize: 4 });
  await client.connect();
  try {
    const db = client.db();
    const [inventory, blobInventory] = await Promise.all([
      collectInventory(db),
      listBlobInventory(blobToken),
    ]);
    const sources = [...inventory.urls.keys()].sort();
    const probeCount = Math.min(100, sources.length);
    const probeSources = Array.from({ length: probeCount }, (_, index) =>
      sources[Math.floor(index * sources.length / probeCount)],
    );
    const probes = await mapLimit(probeSources, CONCURRENCY, probeSource);
    const inaccessible = probes.filter((probe) => !probe.ok);
    const report = {
      mode: EXECUTE ? "execute" : "dry-run",
      imageKit: {
        uniqueUrls: sources.length,
        uniqueCanonicalUrls: new Set(sources.map(canonicalSource)).size,
        occurrences: [...inventory.urls.values()].reduce((sum, count) => sum + count, 0),
        affectedDocuments: inventory.documents.size,
        byCollection: inventory.byCollection,
        probed: probes.length,
        accessible: probes.length - inaccessible.length,
        probedBytes: probes.reduce((sum, probe) => sum + Number(probe.size || 0), 0),
        uniqueUrlsByFolder: Object.fromEntries(
          [...sources.reduce((counts, source) => {
            const folder = sourceFolder(source);
            counts.set(folder, (counts.get(folder) || 0) + 1);
            return counts;
          }, new Map())].sort(([, left], [, right]) => right - left),
        ),
        inaccessible: inaccessible.map(({ source, error }) => ({ source, error })),
      },
      blob: {
        existingMigratedObjects: blobInventory.size,
        existingMigratedBytes: [...blobInventory.values()].reduce((sum, blob) => sum + blob.size, 0),
      },
    };
    console.log(JSON.stringify(report, null, 2));
    if (!EXECUTE || sources.length === 0) return;
    if (inaccessible.length) {
      throw new Error(`Migration blocked: ${inaccessible.length} ImageKit sources are inaccessible`);
    }

    const backupPath = await backupAffectedDocuments(inventory);
    const migrationState = db.collection(MIGRATION_COLLECTION);
    await migrationState.createIndex({ source: 1 }, { unique: true });
    const previous = await migrationState.find({ source: { $in: sources } }).toArray();
    const replacements = new Map(
      previous.filter((item) => item.url && item.pathname).map((item) => [item.source, item]),
    );
    const pending = sources.filter((source) => !replacements.has(source));
    const uploaded = await mapLimit(pending, CONCURRENCY, async (source) => {
      const migrated = await uploadSource(source, blobToken, blobInventory);
      await migrationState.updateOne(
        { source },
        { $set: { ...migrated, migratedAt: new Date() } },
        { upsert: true },
      );
      return migrated;
    });
    for (const migrated of uploaded) replacements.set(migrated.source, migrated);

    // Refresh projected documents after uploads so updates use current application data.
    const freshInventory = await collectInventory(db);
    const databaseUpdates = await migrateReferences(db, freshInventory, replacements);
    const remaining = await collectInventory(db);
    if (remaining.urls.size) {
      throw new Error(`Migration incomplete: ${remaining.urls.size} ImageKit URLs remain`);
    }
    console.log(JSON.stringify({
      completed: true,
      backupPath,
      uploadedObjects: uploaded.length,
      reusedObjects: sources.length - uploaded.length,
      databaseUpdates,
      verifiedRemainingImageKitUrls: 0,
      imageKitOriginalsDeleted: 0,
    }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
