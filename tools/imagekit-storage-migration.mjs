#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { gzipSync } from "node:zlib";
import { EJSON } from "bson";
import mongoose from "mongoose";
import ImageKit from "imagekit";

const EXECUTE = process.argv.includes("--execute");
const PURGE_ORPHANS = process.argv.includes("--purge-orphans");
const DROP_UNRECOVERABLE = process.argv.includes("--drop-unrecoverable");
const GRACE_DAYS = Number(
  process.argv.find((arg) => arg.startsWith("--grace-days="))?.split("=")[1] || 30,
);
const ROOT = process.cwd();
const UPLOAD_ROOT = path.join(ROOT, "public", "uploads");
const LOCAL_MEDIA_PATTERN = /(?:https?:\/\/[^/]+)?\/?(?:public\/)?uploads\/[^\s?#"'<>]+/gi;
const IMAGEKIT_URL_PATTERN = /https:\/\/ik\.imagekit\.io\/[^\s"'<>]+/gi;
const MANAGED_IMAGEKIT_FOLDERS = [
  "/profile/",
  "/documents/",
  "/recipes/",
  "/messages/",
  "/notes/",
  "/transformation/",
  "/complete-meal/",
  "/medical-reports/",
  "/bug/",
  "/ecommerce/",
  "/otherplatform/",
  "/blogs/",
  "/TransformationBeforeAndAfter/",
  "/uploads/",
  "/legacy-migration/",
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const imagekit = new ImageKit({
  publicKey: required("IMAGEKIT_PUBLIC_KEY"),
  privateKey: required("IMAGEKIT_PRIVATE_KEY"),
  urlEndpoint: required("IMAGEKIT_URL_ENDPOINT"),
});

const normalizeLocalReference = (value) => {
  if (typeof value !== "string") return null;
  const match = value.match(LOCAL_MEDIA_PATTERN)?.[0];
  if (!match) return null;
  try {
    const parsed = new URL(match);
    return parsed.pathname.replace(/^\/public\//, "/");
  } catch {
    const normalized = match.replace(/^\/?public\//, "/");
    return normalized.startsWith("/") ? normalized : `/${normalized}`;
  }
};

const localFileForReference = (value) => {
  const normalized = normalizeLocalReference(value);
  if (!normalized?.startsWith("/uploads/")) return null;
  const candidate = path.resolve(ROOT, "public", normalized.slice(1));
  return candidate.startsWith(`${UPLOAD_ROOT}${path.sep}`) ? candidate : null;
};

function canonicalImageKitName(value) {
  const extension = path.extname(value || "").toLowerCase();
  const stem = path.basename(value || "", extension).replace(/_[a-zA-Z0-9]{7,12}$/, "");
  return `${stem.toLowerCase()}${extension}`;
}

function walkStrings(value, visit, currentPath = "") {
  if (typeof value === "string") {
    visit(value, currentPath);
    return;
  }
  if (!value || typeof value !== "object" || value instanceof Date) return;
  if (Buffer.isBuffer(value) || value?._bsontype) return;
  for (const [key, child] of Object.entries(value)) {
    walkStrings(child, visit, currentPath ? `${currentPath}.${key}` : key);
  }
}

function replacementUpdates(document, replacements) {
  const updates = {};
  walkStrings(document, (value, fieldPath) => {
    if (!fieldPath || fieldPath === "_id") return;
    const normalized = normalizeLocalReference(value);
    const replacement = replacements.get(value) || (normalized && replacements.get(normalized));
    if (replacement) updates[fieldPath] = replacement;
  });
  return updates;
}

async function listLocalFiles(directory) {
  const files = [];
  try {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...(await listLocalFiles(absolute)));
      else if (entry.isFile()) files.push(absolute);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return files;
}

async function listAllImageKitFiles() {
  const cachePath = path.join(os.tmpdir(), "dtps-imagekit-migration-inventory.json");
  try {
    const cacheStat = await fs.stat(cachePath);
    if (Date.now() - cacheStat.mtimeMs < 15 * 60_000) {
      return JSON.parse(await fs.readFile(cachePath, "utf8"));
    }
  } catch {
    // A missing or invalid cache simply triggers a fresh read-only inventory.
  }
  const files = [];
  for (let skip = 0; ; skip += 1000) {
    const page = await imagekit.listFiles({ skip, limit: 1000 });
    const items = Array.isArray(page) ? page : page ? [page] : [];
    files.push(...items.filter((item) => item?.type !== "folder"));
    if (items.length < 1000) break;
  }
  await fs.writeFile(cachePath, JSON.stringify(files));
  return files;
}

function decodeStoredData(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value?.buffer && Buffer.isBuffer(value.buffer)) return value.buffer;
  if (typeof value !== "string") return null;
  const payload = value.includes(",") && /^data:/i.test(value) ? value.slice(value.indexOf(",") + 1) : value;
  try {
    return Buffer.from(payload, "base64");
  } catch {
    return null;
  }
}

async function collectDatabaseInventory(db) {
  const localReferences = new Map();
  const imageKitUrls = new Set();
  const imageKitFileIds = new Set();
  const collectionStats = {};
  const affectedDocumentIds = new Map();
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();

  for (const { name } of collections) {
    if (name.startsWith("system.")) continue;
    let documents = 0;
    let localReferenceCount = 0;
    const cursor = db.collection(name).find({});
    for await (const document of cursor) {
      documents += 1;
      let hasLocalReference = false;
      walkStrings(document, (value) => {
        const local = normalizeLocalReference(value);
        if (local) {
          hasLocalReference = true;
          localReferenceCount += 1;
          const item = localReferences.get(local) || { count: 0, collections: new Set() };
          item.count += 1;
          item.collections.add(name);
          localReferences.set(local, item);
        }
        for (const url of value.match(IMAGEKIT_URL_PATTERN) || []) imageKitUrls.add(url);
      });
      if (hasLocalReference) {
        const ids = affectedDocumentIds.get(name) || [];
        ids.push(document._id);
        affectedDocumentIds.set(name, ids);
      }
      walkStrings(document, (value, fieldPath) => {
        if (/imageKitFileId/i.test(fieldPath) && value) imageKitFileIds.add(value);
      });
    }
    if (localReferenceCount) collectionStats[name] = { documents, localReferenceCount };
  }
  return {
    localReferences,
    imageKitUrls,
    imageKitFileIds,
    collectionStats,
    affectedDocumentIds,
  };
}

async function uploadLegacyFile(buffer, filename, sourcePath) {
  const relativeFolder = sourcePath
    ? path.dirname(normalizeLocalReference(sourcePath) || "/uploads")
    : "/database-blobs";
  const folder = `/legacy-migration${relativeFolder.replace(/^\/uploads/, "")}`;
  return imagekit.upload({
    file: buffer,
    fileName: filename || `legacy-${Date.now()}`,
    folder,
    useUniqueFileName: true,
    tags: ["dtps-legacy-migration"],
  });
}

async function migrateLegacyMedia(
  db,
  databaseInventory,
  recoverableReferences,
  dropUnrecoverable,
) {
  const files = db.collection("files");
  const migrations = db.collection("mediastoragemigrations");
  await migrations.createIndex({ source: 1 }, { unique: true });
  const replacements = new Map();
  const migratedLocalFiles = new Set();

  for await (const record of files.find({
    $or: [
      { data: { $exists: true, $nin: [null, ""] } },
      { localPath: { $regex: "(?:^|/)uploads/", $options: "i" } },
    ],
  })) {
    const source = normalizeLocalReference(record.localPath);
    let uploaded = record.imageKitFileId && record.imageKitUrl
      ? { fileId: record.imageKitFileId, url: record.imageKitUrl }
      : null;
    const recovered = source && recoverableReferences.get(source);
    if (!uploaded && recovered?.url) {
      uploaded = { fileId: recovered.fileId, url: recovered.url };
    }
    if (!uploaded) {
      let buffer = decodeStoredData(record.data);
      const localFile = source && localFileForReference(source);
      if (!buffer && localFile) {
        try {
          buffer = await fs.readFile(localFile);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      if (!buffer?.length) {
        if (dropUnrecoverable) continue;
        throw new Error(`No recoverable bytes for File ${record._id}`);
      }
      uploaded = await uploadLegacyFile(buffer, record.originalName || record.filename, source);
    }

    if (source) {
      replacements.set(source, uploaded.url);
      if (record.localPath) replacements.set(record.localPath, uploaded.url);
      const localFile = localFileForReference(source);
      if (localFile) migratedLocalFiles.add(localFile);
      await migrations.updateOne(
        { source },
        { $set: { source, targetUrl: uploaded.url, imageKitFileId: uploaded.fileId, migratedAt: new Date() } },
        { upsert: true },
      );
    }
    await files.updateOne(
      { _id: record._id },
      {
        $set: {
          imageKitFileId: uploaded.fileId,
          imageKitUrl: uploaded.url,
          "metadata.storage": "imagekit",
          ...(source ? { "metadata.legacyPath": source } : {}),
        },
        $unset: { data: "", localPath: "" },
      },
    );
  }

  for await (const migration of migrations.find({})) {
    if (migration.source && migration.targetUrl) replacements.set(migration.source, migration.targetUrl);
  }

  for (const local of databaseInventory.localReferences.keys()) {
    if (replacements.has(local)) continue;
    const existing = await migrations.findOne({ source: local });
    if (existing?.targetUrl) {
      replacements.set(local, existing.targetUrl);
      continue;
    }
    const recovered = recoverableReferences.get(local);
    if (recovered?.url) {
      replacements.set(local, recovered.url);
      await migrations.updateOne(
        { source: local },
        { $set: { source: local, targetUrl: recovered.url, imageKitFileId: recovered.fileId, migratedAt: new Date() } },
        { upsert: true },
      );
      continue;
    }
    const localFile = localFileForReference(local);
    if (!localFile) continue;
    let buffer;
    try {
      buffer = await fs.readFile(localFile);
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Missing local media referenced by DB: ${local}`);
      throw error;
    }
    const uploaded = await uploadLegacyFile(buffer, path.basename(localFile), local);
    replacements.set(local, uploaded.url);
    migratedLocalFiles.add(localFile);
    await migrations.updateOne(
      { source: local },
      { $set: { source: local, targetUrl: uploaded.url, imageKitFileId: uploaded.fileId, migratedAt: new Date() } },
      { upsert: true },
    );
  }

  for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
    if (name.startsWith("system.") || name === "mediastoragemigrations") continue;
    const operations = [];
    for await (const document of db.collection(name).find({})) {
      const updates = replacementUpdates(document, replacements);
      if (Object.keys(updates).length) {
        operations.push({ updateOne: { filter: { _id: document._id }, update: { $set: updates } } });
      }
      if (operations.length === 500) {
        await db.collection(name).bulkWrite(operations, { ordered: false });
        operations.length = 0;
      }
    }
    if (operations.length) await db.collection(name).bulkWrite(operations, { ordered: false });
  }

  return { replacements, migratedLocalFiles };
}

async function backupAffectedDocuments(db, inventory) {
  const backup = { createdAt: new Date(), collections: {} };
  for (const [name, ids] of inventory.affectedDocumentIds) {
    backup.collections[name] = await db.collection(name).find({ _id: { $in: ids } }).toArray();
  }
  const backupDirectory = path.join(ROOT, ".migration-backups");
  await fs.mkdir(backupDirectory, { recursive: true });
  const backupPath = path.join(
    backupDirectory,
    `imagekit-storage-${new Date().toISOString().replace(/[:.]/g, "-")}.ejson.gz`,
  );
  await fs.writeFile(backupPath, gzipSync(Buffer.from(EJSON.stringify(backup))));
  return backupPath;
}

function containsUnrecoverableMedia(value, unrecoverable) {
  let found = false;
  walkStrings(value, (text) => {
    const normalized = normalizeLocalReference(text);
    if (normalized && unrecoverable.has(normalized)) found = true;
  });
  return found;
}

function scrubUnrecoverableStrings(value, unrecoverable) {
  if (typeof value === "string") {
    const matches = value.match(LOCAL_MEDIA_PATTERN) || [];
    let scrubbed = value;
    for (const match of matches) {
      const normalized = normalizeLocalReference(match);
      if (normalized && unrecoverable.has(normalized)) {
        scrubbed = scrubbed === match ? "" : scrubbed.replace(match, "[legacy media removed]");
      }
    }
    return scrubbed;
  }
  if (Array.isArray(value)) return value.map((item) => scrubUnrecoverableStrings(item, unrecoverable));
  if (!value || typeof value !== "object" || value instanceof Date || Buffer.isBuffer(value) || value?._bsontype) {
    return value;
  }
  for (const [key, child] of Object.entries(value)) {
    value[key] = scrubUnrecoverableStrings(child, unrecoverable);
  }
  return value;
}

async function dropUnrecoverableMediaReferences(db, inventory, unrecoverable) {
  const deleted = {};
  const updated = {};
  for (const [name, ids] of inventory.affectedDocumentIds) {
    for await (const document of db.collection(name).find({ _id: { $in: ids } })) {
      if (!containsUnrecoverableMedia(document, unrecoverable)) continue;

      if (name === "files") {
        await db.collection(name).deleteOne({ _id: document._id });
        deleted[name] = (deleted[name] || 0) + 1;
        continue;
      }
      if (
        name === "progressentries" &&
        document.type === "photo" &&
        containsUnrecoverableMedia(document.value, unrecoverable)
      ) {
        await db.collection(name).deleteOne({ _id: document._id });
        deleted[name] = (deleted[name] || 0) + 1;
        continue;
      }

      if (name === "messages" || name === "groupmessages" || name === "clientnotes") {
        document.attachments = (document.attachments || []).filter(
          (attachment) => !containsUnrecoverableMedia(attachment, unrecoverable),
        );
      }
      if (name === "users") {
        document.documents = (document.documents || []).filter(
          (item) => !containsUnrecoverableMedia(item, unrecoverable),
        );
      }
      if (name === "medicalinfos") {
        document.reports = (document.reports || []).filter(
          (item) => !containsUnrecoverableMedia(item, unrecoverable),
        );
      }
      if (name === "clientmealplans") {
        document.mealCompletions = (document.mealCompletions || []).map((completion) => {
          if (containsUnrecoverableMedia(completion.imagePath, unrecoverable)) {
            delete completion.imagePath;
            delete completion.imageKitFileId;
          }
          return completion;
        });
        document.progress = (document.progress || []).map((entry) => ({
          ...entry,
          photos: (entry.photos || []).filter(
            (photo) => !containsUnrecoverableMedia(photo, unrecoverable),
          ),
        }));
      }
      if (name === "otherplatformpayments") {
        for (const field of ["receiptImage", "receiptImageUrl", "receiptImageFileId"]) {
          if (containsUnrecoverableMedia(document[field], unrecoverable)) delete document[field];
        }
      }

      scrubUnrecoverableStrings(document, unrecoverable);
      await db.collection(name).replaceOne({ _id: document._id }, document);
      updated[name] = (updated[name] || 0) + 1;
    }
  }
  return { deleted, updated };
}

async function main() {
  await mongoose.connect(required("MONGODB_URI"));
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection unavailable");

  const [databaseInventory, localFiles, remoteFiles] = await Promise.all([
    collectDatabaseInventory(db),
    listLocalFiles(UPLOAD_ROOT),
    listAllImageKitFiles(),
  ]);
  const fileRecords = db.collection("files");
  const [embeddedDataRecords, localPathRecords, legacyFileRecords] = await Promise.all([
    fileRecords.countDocuments({ data: { $exists: true, $nin: [null, ""] } }),
    fileRecords.countDocuments({ localPath: { $regex: "(?:^|/)uploads/", $options: "i" } }),
    fileRecords.countDocuments({
      $or: [
        { data: { $exists: true, $nin: [null, ""] } },
        { localPath: { $regex: "(?:^|/)uploads/", $options: "i" } },
      ],
    }),
  ]);
  const localStats = await Promise.all(localFiles.map((file) => fs.stat(file)));
  const localFileSet = new Set(localFiles.map((file) => path.resolve(file)));
  const referencedLocalFiles = new Set(
    [...databaseInventory.localReferences.keys()]
      .map(localFileForReference)
      .filter((file) => file && localFileSet.has(file)),
  );
  const legacyRecords = await fileRecords
    .find({
      $or: [
        { data: { $exists: true, $nin: [null, ""] } },
        { localPath: { $regex: "(?:^|/)uploads/", $options: "i" } },
      ],
    })
    .toArray();
  const remoteById = new Map(remoteFiles.map((file) => [file.fileId, file]));
  const remoteByUrl = new Map(remoteFiles.map((file) => [file.url, file]));
  const remoteByName = new Map();
  const remoteByCanonicalName = new Map();
  for (const file of remoteFiles) {
    const items = remoteByName.get(file.name) || [];
    items.push(file);
    remoteByName.set(file.name, items);
    const canonical = canonicalImageKitName(file.name);
    const canonicalItems = remoteByCanonicalName.get(canonical) || [];
    canonicalItems.push(file);
    remoteByCanonicalName.set(canonical, canonicalItems);
  }
  const recoverableReferences = new Map();
  const legacyRecovery = {
    alreadyImageKitBacked: 0,
    embeddedBytes: 0,
    localFile: 0,
    exactImageKitNameMatch: 0,
    uniqueImageKitSuffixMatch: 0,
    ambiguousImageKitSuffixMatch: 0,
    unrecoverableRecords: 0,
  };
  for (const record of legacyRecords) {
    const source = normalizeLocalReference(record.localPath);
    let recovery = null;
    if (record.imageKitUrl) {
      let urlName = "";
      try {
        urlName = decodeURIComponent(path.basename(new URL(record.imageKitUrl).pathname));
      } catch {
        // The URL itself is still usable; file ID recovery can fall back to the record.
      }
      const remote = remoteByUrl.get(record.imageKitUrl) || (remoteByName.get(urlName) || [])[0];
      recovery = {
        url: record.imageKitUrl,
        fileId: record.imageKitFileId || remote?.fileId,
      };
      legacyRecovery.alreadyImageKitBacked += 1;
    } else if (record.imageKitFileId && remoteById.has(record.imageKitFileId)) {
      const remote = remoteById.get(record.imageKitFileId);
      recovery = { url: remote.url, fileId: remote.fileId };
      legacyRecovery.alreadyImageKitBacked += 1;
    } else if (decodeStoredData(record.data)?.length) {
      recovery = { source: "embedded" };
      legacyRecovery.embeddedBytes += 1;
    } else if (source && localFileSet.has(localFileForReference(source))) {
      recovery = { source: "local" };
      legacyRecovery.localFile += 1;
    } else {
      const names = [record.filename, record.originalName, source && path.basename(source)].filter(Boolean);
      const exactRemote = names.flatMap((name) => remoteByName.get(name) || [])[0];
      if (exactRemote) {
        recovery = { url: exactRemote.url, fileId: exactRemote.fileId };
        legacyRecovery.exactImageKitNameMatch += 1;
      } else {
        const candidates = [
          ...new Map(
            names
              .flatMap((name) => remoteByCanonicalName.get(canonicalImageKitName(name)) || [])
              .map((file) => [file.fileId, file]),
          ).values(),
        ];
        const sizeMatches = candidates.filter((file) => Number(file.size) === Number(record.size));
        const matches = sizeMatches.length ? sizeMatches : candidates;
        if (matches.length === 1) {
          recovery = { url: matches[0].url, fileId: matches[0].fileId };
          legacyRecovery.uniqueImageKitSuffixMatch += 1;
        } else if (matches.length > 1) {
          legacyRecovery.ambiguousImageKitSuffixMatch += 1;
        }
      }
    }
    if (source && recovery) recoverableReferences.set(source, recovery);
    if (!recovery) legacyRecovery.unrecoverableRecords += 1;
  }
  for (const reference of databaseInventory.localReferences.keys()) {
    if (recoverableReferences.has(reference)) continue;
    const localFile = localFileForReference(reference);
    if (localFile && localFileSet.has(localFile)) {
      recoverableReferences.set(reference, { source: "local" });
      continue;
    }
    const exactRemote = (remoteByName.get(path.basename(reference)) || [])[0];
    if (exactRemote) {
      recoverableReferences.set(reference, { url: exactRemote.url, fileId: exactRemote.fileId });
      continue;
    }
    const suffixMatches = remoteByCanonicalName.get(canonicalImageKitName(path.basename(reference))) || [];
    if (suffixMatches.length === 1) {
      recoverableReferences.set(reference, {
        url: suffixMatches[0].url,
        fileId: suffixMatches[0].fileId,
      });
    }
  }
  const unrecoverableLocalReferences = [...databaseInventory.localReferences.keys()].filter(
    (reference) => !recoverableReferences.has(reference),
  );
  const unrecoverableSet = new Set(unrecoverableLocalReferences);
  const plannedUnrecoverableCleanup = { deleted: {}, updated: {} };
  for (const [name, ids] of databaseInventory.affectedDocumentIds) {
    for await (const document of db.collection(name).find({ _id: { $in: ids } })) {
      if (!containsUnrecoverableMedia(document, unrecoverableSet)) continue;
      const willDelete =
        name === "files" ||
        (name === "progressentries" &&
          document.type === "photo" &&
          containsUnrecoverableMedia(document.value, unrecoverableSet));
      const bucket = willDelete
        ? plannedUnrecoverableCleanup.deleted
        : plannedUnrecoverableCleanup.updated;
      bucket[name] = (bucket[name] || 0) + 1;
    }
  }

  const cutoff = Date.now() - GRACE_DAYS * 86_400_000;
  const referencedPaths = new Set(
    [...databaseInventory.imageKitUrls].map((url) => {
      try { return decodeURIComponent(new URL(url).pathname); } catch { return ""; }
    }),
  );
  const orphanCandidates = remoteFiles.filter((file) => {
    if (!MANAGED_IMAGEKIT_FOLDERS.some((folder) => String(file.filePath || "").startsWith(folder))) {
      return false;
    }
    if (databaseInventory.imageKitFileIds.has(file.fileId)) return false;
    if (referencedPaths.has(decodeURIComponent(new URL(file.url).pathname))) return false;
    return new Date(file.createdAt || 0).getTime() < cutoff;
  });

  const report = {
    mode: EXECUTE ? "execute" : "dry-run",
    graceDays: GRACE_DAYS,
    database: {
      legacyFileRecords,
      embeddedDataRecords,
      localPathRecords,
      localReferenceOccurrences: [...databaseInventory.localReferences.values()].reduce((sum, item) => sum + item.count, 0),
      uniqueLocalReferences: databaseInventory.localReferences.size,
      recoverableLocalReferences: recoverableReferences.size,
      unrecoverableLocalReferences: unrecoverableLocalReferences.length,
      legacyRecovery,
      plannedUnrecoverableCleanup,
      collectionsWithLocalReferences: databaseInventory.collectionStats,
    },
    localStorage: {
      files: localFiles.length,
      bytes: localStats.reduce((sum, item) => sum + item.size, 0),
      referencedFiles: referencedLocalFiles.size,
      unreferencedFiles: localFiles.length - referencedLocalFiles.size,
    },
    imageKit: {
      files: remoteFiles.length,
      bytes: remoteFiles.reduce((sum, file) => sum + Number(file.size || 0), 0),
      referencedFileIds: databaseInventory.imageKitFileIds.size,
      orphanCandidates: orphanCandidates.length,
      orphanCandidateBytes: orphanCandidates.reduce((sum, file) => sum + Number(file.size || 0), 0),
      orphanCandidatesByFolder: Object.fromEntries(
        [...orphanCandidates.reduce((counts, file) => {
          const folder = `/${String(file.filePath || "").split("/").filter(Boolean)[0] || "root"}`;
          counts.set(folder, (counts.get(folder) || 0) + 1);
          return counts;
        }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!EXECUTE) return;
  if (unrecoverableLocalReferences.length && !DROP_UNRECOVERABLE) {
    throw new Error(`Blocked: ${unrecoverableLocalReferences.length} DB references have no recoverable source`);
  }

  const backupPath = await backupAffectedDocuments(db, databaseInventory);

  const { migratedLocalFiles } = await migrateLegacyMedia(
    db,
    databaseInventory,
    recoverableReferences,
    DROP_UNRECOVERABLE,
  );
  const dropped = DROP_UNRECOVERABLE
    ? await dropUnrecoverableMediaReferences(
        db,
        databaseInventory,
        new Set(unrecoverableLocalReferences),
      )
    : { deleted: {}, updated: {} };
  const afterMigration = await collectDatabaseInventory(db);
  if (afterMigration.localReferences.size) {
    throw new Error(`Blocked local purge: ${afterMigration.localReferences.size} local DB references remain`);
  }

  for (const file of localFiles) await fs.unlink(file);
  const directories = await fs.readdir(UPLOAD_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of directories) {
    if (entry.isDirectory()) await fs.rm(path.join(UPLOAD_ROOT, entry.name), { recursive: true, force: true });
  }

  if (PURGE_ORPHANS) {
    for (let index = 0; index < orphanCandidates.length; index += 5) {
      await Promise.all(orphanCandidates.slice(index, index + 5).map((file) => imagekit.deleteFile(file.fileId)));
    }
  }
  console.log(JSON.stringify({
    completed: true,
    backupPath,
    migratedLocalFiles: migratedLocalFiles.size,
    droppedUnrecoverable: dropped,
    deletedLocalFiles: localFiles.length,
    deletedImageKitOrphans: PURGE_ORPHANS ? orphanCandidates.length : 0,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
