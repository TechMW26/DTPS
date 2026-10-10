# DTPS Firestore → MongoDB migration

These tools preserve every Firestore document path and collection group, including nested documents whose parent is missing. The existing Vercel Blob store remains the media store. All Blob URL, file metadata, external document-field references and archive references migrate with their parent documents; no second Blob store is created.

The gzip JSONL archive preserves original Firestore typed values and source resource identity. MongoDB stores queryable BSON data plus the runtime's compact `_types` metadata for timestamps with nanoseconds, references and geographic coordinates. Firestore does not distinguish a JavaScript Date from a Timestamp after storage; exact original Mongo BSON archived by the previous migration remains in `_migration_originals` and `chunks`.

Target writes require explicit `--execute` on import, final delta application, index installation, or guarded metadata compaction. Export and verification are read-only. Source Firestore documents are never changed or removed. Target writes require a dedicated `--credentials-file`, the approved Atlas host, and the exact `dtps` database. Source credentials come from existing local environment files or process environment; outputs and checkpoint files use private filesystem permissions.

## Commands

```sh
# A fresh, consistent complete snapshot; per-group shards resume after failures.
node tools/mongodb-migration/export.mjs --output /absolute/private/backup-folder

# Read-only archive integrity check and target preview (default).
node tools/mongodb-migration/import.mjs --archive /absolute/private/backup-folder --database dtps --credentials-file .env.mongodb-migration.local

# Initial restore. Safe to repeat: deterministic full-path identities upsert each record.
node tools/mongodb-migration/import.mjs --archive /absolute/private/backup-folder --database dtps --credentials-file .env.mongodb-migration.local --execute

# Before final export/import, gate source application writes and drain active jobs.
# Prune only stale previously imported rows from this source, never arbitrary Mongo data.
node tools/mongodb-migration/import.mjs --archive /absolute/private/final-backup-folder --database dtps --credentials-file .env.mongodb-migration.local --execute --prune --writers-gated

# Every record's decoded BSON/sidecar hash and metadata are read back and checked.
node tools/mongodb-migration/verify.mjs --archive /absolute/private/final-backup-folder --database dtps --credentials-file .env.mongodb-migration.local
```

The 8 October backup is compatible with the importer. It is an initial restore, not a substitute for a final current snapshot. A write gate is necessary for a lossless switch: snapshot consistency alone cannot include writes made later. Background crons, website writers sharing the database, mobile writers and delayed events must also be accounted for before the final cutover.

Resuming an exporter requires its fixed snapshot time still to be retained by Firestore. If Firestore rejects an expired snapshot, use a fresh output directory and fresh snapshot; do not mix snapshots in one manifest. A finished manifest is accepted only after per-shard counts agree with the database-wide inventory.

Importing with an existing state file skips only completed, checksum-matching shards from the same snapshot. Failed incomplete shards are reimported idempotently. Verification must succeed before switching application traffic. Derived indexes, dispatch deduplication records, logs and migration archives are imported intact; retention or consolidation requires a separate reviewed step.

MONGODB_URI is required for import and verification. `--database` defaults to MONGODB_DATABASE then dtps. Firestore credentials use FIRESTORE_NATIVE_PROJECT_ID, FIRESTORE_NATIVE_DATABASE_ID, FIRESTORE_NATIVE_CLIENT_EMAIL, FIRESTORE_NATIVE_PRIVATE_KEY. Export `--project` and `--database` allow a separately inventoried source; use credentials authorized for that source.

## Optional archive-bank exclusion

`--exclude-migration-archives` on import **and** verification excludes only documents rooted in `_migration_originals` and `_migration_checks`, including their archive chunks. Runtime source contains no references to these banks. Every excluded record remains in the complete local gzip archive; import checkpoints record per-path counts and content hashes plus the source archive SHA-256 and location. Files, medical report/receipt chunks, Vercel Blob metadata and `_nativeExternalFields` are retained. This flag does not remove anything from Firestore or local backups. Use it consistently through preview, import and verification.

`indexes.mjs` previews 35 compact hot-query indexes by default (budget 40); `--execute` installs them without dropping existing indexes. Email/phone lookup indexes are non-unique. `--only-index receiver_recent` installs and verifies just the approved receiver-only chat index: live Explain showed the unread index scanning 431 messages and performing a blocking sort to return 50 recent messages when the read flag was unbounded. The added index covers receiver, exact created-time/nanosecond order and path tie-breaker. Operational realtime expiry is deferred during import/verification; after cutover, `--enable-operational-ttl --execute` adds the existing five-minute event expiry policy. Never enable this before record-by-record snapshot verification, because expired event deletion would invalidate that comparison.

`inventory.mjs --report /absolute/private/database-inventory.json` lists all Firestore databases in the source project with edition/location and configured application database. Every other database must be explicitly classified or backed up before claiming project-wide migration coverage.

## Final audit metadata compaction

After final verification and cutover, `compact.mjs --archive ... --database dtps --credentials-file .env.mongodb-migration.local` previews removal of only `_sourceHash`, `_storageHash`, `_migrationRun`. `--execute` performs it. The tool requires matching complete import and verification reports and rechecks archive checksums. It retains all business/operational data, `_types`, all runtime paths, source identity and both exact source timestamp strings. Full original archives and verification reports stay private locally. This reduces repeated per-document migration metadata; it is not retention deletion or a schema rewrite. After compaction, a new full import must recreate audit markers before its verification can run.

Export uses the isolated source SDK installed privately at `.migration-backups/mongodb/export-runtime` (override with `--source-runtime`). This keeps the transitional Firestore pipeline SDK out of application dependencies. Its default snapshot is a whole UTC minute so source PITR supports resumable exports after the normal one-hour window.

## Final delta cutover

The initial full export captures one consistent source time while the app stays available. Verify that complete initial import before preparing the final delta. Build the private SQLite index before pausing writers:

```sh
python3 tools/mongodb-migration/baseline-index.py build /private/initial /private/final/baseline.sqlite
```

If the complete initial snapshot was assembled by a coherent refresh, its existing compressed SQLite capture can become the next baseline without rebuilding millions of bodies. `rebase` creates a separate private copy, compares every payload and exact system timestamp to the checksummed full archive, checks all group and parent-path counts, and saves a proof bound to the archive and manifest hashes. Original archives and the original index remain intact; only paths already absent from that coherent snapshot are omitted from the new local copy. A mismatched or pre-existing output is rejected.

```sh
python3 tools/mongodb-migration/baseline-index.py rebase /private/coherent-initial /private/coherent-initial/baseline.sqlite /private/final/baseline.sqlite
```

Drain every source writer, including crons, shared website writers, delayed jobs, TTL and external/mobile writers. Keep target writers and operational TTL disabled during verification. Record the actual completed gate time. A final snapshot must be at or after that time; the capture tool waits for the next whole UTC minute instead of flooring the time and missing recent writes.

```sh
node tools/mongodb-migration/capture-delta.mjs --baseline /private/initial --output /private/final --index /private/final/baseline.sqlite --indexed-name-groups notificationdeliveryaudits --final-cutover --writers-gated --write-gate-time 2026-10-10T00:00:00.000Z
node tools/mongodb-migration/apply-delta.mjs --archive /private/final --database dtps --credentials-file .env.mongodb-migration.local --baseline-verification /private/initial/mongo-verification-dtps.json
node tools/mongodb-migration/apply-delta.mjs --archive /private/final --database dtps --credentials-file .env.mongodb-migration.local --baseline-verification /private/initial/mongo-verification-dtps.json --writers-gated --execute
node tools/mongodb-migration/verify.mjs --archive /private/final --database dtps --credentials-file .env.mongodb-migration.local --baseline-verification /private/initial/mongo-verification-dtps.json
```

Use the same optional archive exclusion flag throughout. The final capture scans every identity and original system create/update timestamp with an empty field projection, fetches only changed/new bodies, and compares the complete path sets to detect hard deletes. It produces a complete reconstructed typed archive, changed/deleted shards, metadata inventory and checksums. Changed bodies are upserted; deletes are restricted to exact absent-source identities previously imported from this source. Full final verification rereads and hashes every target body, including unchanged records, validates exact system timestamp metadata, and checks all per-group counts before traffic switches.

If every source writer cannot be frozen, a fixed snapshot is a point-in-time backup rather than proof of a lossless final switch. Do not apply a final delta or remove the old source until the writer boundary is established. Source exports and original media storage remain available throughout.

Identity enumeration uses unsorted streams for small banks and bounded partitions on existing leading index fields for large banks. The first message partition Explain scanned exactly 11,851 rows for 11,851 expected identities, with no MajorSort. Typed partition totals, unique identities and checksummed restart files prove complete coverage. A measured Enterprise Explain sample showed that sorting and paginating 5,000 names rescanned all 826,197 message index rows (28,240 read units per page). Unindexed name pagination is prohibited. An explicit `--indexed-name-groups notificationdeliveryaudits` fallback is allowed only after its minimal name index is READY and the first page Explain proves bounded scanning with no MajorSort. The isolated audit bank has no usable existing secondary indexes; its single-pass stream exceeded the provider deadline, so an authorized business owner created only its temporary `__name__` ascending index. Source business records remain unchanged. The isolated pinned SDK transport passes an explicit fixed readTime for streaming; public Pipeline.stream() currently omits that option. Counts and unique full paths are validated before accepting any shard.

`source-index.mjs` prepares a bounded estimate and exact specification for transitional source index metadata only. Mutation requires an explicitly saved plan and `--execute`; it never changes business documents. The audit fallback index was created through the authorized owner console and is tracked privately for eventual source retirement. Existing message and notification partitions need no new source indexes.

An exporter takes an exclusive private archive checkpoint lock. A concurrent live worker cannot rewrite the same manifest. `--skip-groups` is a recovery-only option: deferred banks leave the manifest incomplete, return exit code 2, and cannot pass import/archive integrity validation. Re-run the same output directory once the missing bank can be enumerated safely; completed shard checksums are validated and skipped.

## Coherent refresh of the partial initial snapshot

A newly built source index cannot serve a PITR snapshot from before that index existed. `--bootstrap-incomplete` is an explicit recovery option for the authorized DTPS backup containing exactly 98 checksummed complete shards and only the audit bank missing. It never marks that older partial backup complete or uses it directly for Mongo import.

```sh
node tools/mongodb-migration/capture-delta.mjs --baseline /private/partial-initial --output /private/coherent-initial --bootstrap-incomplete --indexed-name-groups notificationdeliveryaudits
```

The seed stores typed bodies compressed in private SQLite. At one later fixed snapshot time, the tool inventories every current group and unique identity, compares exact system create/update timestamps, reuses only matching versions, fetches all missing/changed/new bodies, and locally omits confirmed absent paths. It produces a complete new archive whose per-group counts must agree with the new source inventory. A partial bootstrap cannot be designated a final cutover. Normal full import and target verification remain required; source writers stay available until the separately established final gate.
