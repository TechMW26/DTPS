# DTPS Firestore → MongoDB migration

These tools preserve every Firestore document path and collection group, including nested documents whose parent is missing. The existing Vercel Blob store remains the media store. All Blob URL, file metadata, external document-field references and archive references migrate with their parent documents; no second Blob store is created.

The gzip JSONL archive preserves original Firestore typed values and source resource identity. MongoDB stores queryable BSON data plus the runtime's compact `_types` metadata for timestamps with nanoseconds, references and geographic coordinates. Firestore does not distinguish a JavaScript Date from a Timestamp after storage; exact original Mongo BSON archived by the previous migration remains in `_migration_originals` and `chunks`.

Target writes require explicit `--execute` on import, offline baseline synchronization, final delta/journal application, index installation, or guarded metadata compaction. Export and verification are read-only. Source Firestore documents are never changed or removed. Target writes require a dedicated `--credentials-file`, the approved Atlas host, and the exact `dtps` database. Source credentials come from existing local environment files or process environment; outputs and checkpoint files use private filesystem permissions.

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

`--exclude-migration-archives` on import **and** verification excludes only documents rooted in `_migration_originals`, `_migration_checks`, `_nativeMigrationJournal`, and `_nativeMigrationJournalCounters`, including nested archive chunks. Exact migration-journal roots are tracking archives, while similarly named nested business collections and prefix lookalikes remain included. Runtime source contains no references to these banks. Every excluded record remains in the complete local gzip archive; import checkpoints record per-path counts and content hashes plus the source archive SHA-256 and location. Files, medical report/receipt chunks, Vercel Blob metadata and `_nativeExternalFields` are retained. This flag does not remove anything from Firestore or local backups. Use it consistently through preview, import and verification.

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

For a background point-in-time refresh while the app remains live, use an existing proved baseline with `--overlay-index /private/background/overlay.sqlite`. The separate compact SQLite overlay opens baseline bodies read-only, tracks every current identity and exact system version, and stores only changed bodies. The baseline index and its proof remain unchanged. Omit `--final-cutover`, `--writers-gated`, and `--write-gate-time`; this archive must not be applied as a final switch. Overlay captures pause when free disk falls below 3 GiB or the output plus overlay exceeds 2 GiB. Resume the same output and fixed readTime after resolving storage; never mix snapshots.

```sh
node tools/mongodb-migration/capture-delta.mjs --baseline /private/initial --index /private/proved-baseline.sqlite --overlay-index /private/background/overlay.sqlite --output /private/background --indexed-name-groups notificationdeliveryaudits
```

## Atomic source change journal

`capture-journal.mjs` consumes the source producers' 16-shard atomic counter/event protocol. It defaults to a local-only preview; `--capture` enables read-only source requests and private local exports. It never connects to MongoDB, applies business records, or changes the source. Its distinct `journal-manifest.json` cannot be passed off as a complete full-database archive.

The activation proof must contain `complete:true`, `project`, `database`, `epoch`, `activatedAt`, fixed `readTime`, exactly 16 nonnegative safe-integer `vector` values, `missingCounterShards`, and `coverageConfirmed:true`. The operator records deployment and drain evidence for every producer before confirming coverage. Missing counters are accepted only as explicitly listed zero values in this activation proof. An idle zero shard may remain missing at Wf only if both proofs explicitly list that same zero shard; an existing or positive counter may never disappear. Use whole UTC-minute fixed proof times when later replay must remain valid beyond the normal one-hour snapshot window. A complete coherent baseline must have a readTime at or after activation/W0; the preactivation background snapshot is ineligible. The end-vector proof repeats the identity, fixed `readTime`, and 16 values. For a final fence it also requires `writersGated:true` and the actual completed `writeGateTime`; a point-in-time observation uses `writersGated:false` and cannot prove the final switch.

```sh
node tools/mongodb-migration/capture-journal.mjs --activation-proof /private/activation.json --end-vector /private/end-vector.json --baseline /private/postactivation-baseline --output /private/journal-delta
# Source reads and private file exports only; no Mongo writes.
node tools/mongodb-migration/capture-journal.mjs --activation-proof /private/activation.json --end-vector /private/end-vector.json --baseline /private/postactivation-baseline --output /private/journal-delta --capture
```

Events are fetched by deterministic IDs in batches of at most 300; no collection scans or new source indexes are needed. Every sequence in each `(W0,Wf]` range must exist exactly once with matching source, epoch and shard. The default maximum range is 1,000,000 events; `--max-events` explicitly changes the bound. Immutable journal document `createTime` is the exact atomic commit fence: serverTimestamp `committedAt` is only millisecond precision. The last event's exact creation time must match the shard counter's system update time. The durable SQLite receipt/path set rejects changed checkpoint contents and deduplicates nested paths. At the fixed end readTime, batches of 40 paths produce original typed documents or authoritative missing-document tombstones. Checksums, per-range receipts, complete path coverage and storage guards are required before completion. This tool produces evidence; target application and final verification require a separately reviewed quiet handoff.

The exact `_nativeMigrationJournal` and `_nativeMigrationJournalCounters` root banks are migration tracking archives. Optional `--exclude-migration-archives` retains them in local source exports rather than copying them into runtime banks. Prefix lookalikes and similarly named nested business collections remain preserved.


## Quiet-target baseline synchronization and final journal application

`audit-baseline.mjs --archive /private/initial --database dtps --credentials-file .env.mongodb-migration.local --exclude-migration-archives --output /private/fresh-deviation-audit` is read-only. It compares every original source-backed record, writes exact current mismatched/non-imported BSON and hashes privately, and reports identity counts. It does not repair records, and its report explicitly cannot substitute for complete target verification. Review and preserve any preview changes before an independently authorized guarded repair; then rerun strict verification.

The source application can remain live while `sync-baseline.mjs` applies a complete coherent **postactivation** snapshot to an offline target. This is a separate phase from the final switch and never claims a source write gate. First stop every target preview/producer, preserve and classify any existing registration/presence changes, and run complete target verification of the prior source snapshot while target writers are quiet. The old initial verification does not establish that new quiet boundary. A preview-modified body or unrelated path collision causes the sync to stop instead of overwriting it.

The private target quiet proof contains `complete:true`, `database:"dtps"`, `source:"project/database"`, the journal `epoch`, `baselineRun`, `baselineVerificationSha256`, `targetWritersGated:true`, `deviationAuditComplete:true`, `deviations:0`, `untrackedWrites:0`, `quietSince`, and `checkedAt`. Its quiet interval must start before the complete baseline verification starts, and its observation must follow both verification and the source snapshot capture. Approved non-imported `_nativeFcmTokens` and `_nativePresence` records require exact `{collection,id,hash}` entries in `allowedNonImported`. Previous migration control receipts likewise require exact entries in `allowedControlReceipts`; arbitrary business extras are not accepted. These proofs are operator evidence, and the tools also check current Mongo metadata/counts, exact operational hashes and changed-state bodies before writing.

```sh
# SOURCE stays live; take the new whole-minute snapshot at or after the covered W0 time.
node tools/mongodb-migration/capture-delta.mjs --baseline /private/initial --index /private/proved-baseline.sqlite --overlay-index /private/postactivation/overlay.sqlite --output /private/postactivation --indexed-name-groups notificationdeliveryaudits --read-time COVERED_W0_OR_LATER_UTC

# Local-only preview: no Mongo connection.
node tools/mongodb-migration/sync-baseline.mjs --archive /private/postactivation --activation-proof /private/activation.json --baseline-verification /private/prior-quiet-verification.json --target-quiet-proof /private/baseline-target-quiet.json --database dtps --exclude-migration-archives

# Parent-controlled offline TARGET writes; no source freeze.
node tools/mongodb-migration/sync-baseline.mjs --archive /private/postactivation --activation-proof /private/activation.json --baseline-verification /private/prior-quiet-verification.json --target-quiet-proof /private/baseline-target-quiet.json --database dtps --exclude-migration-archives --credentials-file .env.mongodb-migration.local --target-writers-gated --parent-approved-handoff --execute

# Fully verify the complete new source snapshot before the short final switch window.
node tools/mongodb-migration/verify.mjs --archive /private/postactivation --baseline-verification /private/prior-quiet-verification.json --database dtps --exclude-migration-archives --credentials-file .env.mongodb-migration.local
```

Baseline sync applies at most 40 changed paths per transaction. Strict source ownership/body checks reject drift and collisions; each source-state batch and its receipt commit atomically with majority acknowledgement. Resume checks existing receipt identity/hash and readback, so inserts and hard deletes cannot be counted twice. Control receipts are separate target-only operational evidence, not a replacement for full source verification. The baseline-sync report lists their exact hashes for a later reviewed quiet proof. Source archives, original timestamps, media references and approved operational extras are retained.

Only after every source producer is gated and drained, TTL/provider fences are verified, and Wf is sealed may the final journal be captured and applied. Keep target writers quiet throughout this phase. Both commands below default to local-only previews; `--verify-target` performs read-only Mongo verification. They require the newly completed postactivation full verification and a current quiet/deviation proof, never the older initial report.

```sh
node tools/mongodb-migration/apply-journal.mjs --archive /private/journal-final --activation-proof /private/activation.json --end-vector /private/sealed-end.json --baseline-verification /private/postactivation/mongo-verification-dtps.json --target-quiet-proof /private/final-target-quiet.json --database dtps --exclude-migration-archives

node tools/mongodb-migration/apply-journal.mjs --archive /private/journal-final --activation-proof /private/activation.json --end-vector /private/sealed-end.json --baseline-verification /private/postactivation/mongo-verification-dtps.json --target-quiet-proof /private/final-target-quiet.json --database dtps --exclude-migration-archives --credentials-file .env.mongodb-migration.local --writers-gated --parent-approved-handoff --execute

node tools/mongodb-migration/verify-journal.mjs --archive /private/journal-final --activation-proof /private/activation.json --end-vector /private/sealed-end.json --baseline-verification /private/postactivation/mongo-verification-dtps.json --target-quiet-proof /private/final-target-quiet.json --database dtps --exclude-migration-archives --credentials-file .env.mongodb-migration.local --verify-target
```

Final verification rechecks contiguous sequence and counter evidence, every deduplicated typed changed path and hard-delete tombstone, exact nanos/BSON checksums, all atomic target receipts, adjusted per-bank identity counts and retained operational/control hashes. The already completed whole-database proof extends unchanged records only under the new quiet target boundary. One bounded Mongo metadata aggregation per bank checks counts/runs and preview timestamps; changed bodies are retrieved by exact IDs. No new source scans or broad target indexes are added for this step. Source job drain time still applies; changing the database alias alone does not guarantee a lossless instantaneous switch.

Identity enumeration uses unsorted streams for small banks and bounded partitions on existing leading index fields for large banks. The first message partition Explain scanned exactly 11,851 rows for 11,851 expected identities, with no MajorSort. Typed partition totals, unique identities and checksummed restart files prove complete coverage. A measured Enterprise Explain sample showed that sorting and paginating 5,000 names rescanned all 826,197 message index rows (28,240 read units per page). Unindexed name pagination is prohibited. An explicit `--indexed-name-groups notificationdeliveryaudits` fallback is allowed only after its minimal name index is READY and the first page Explain proves bounded scanning with no MajorSort. The isolated audit bank has no usable existing secondary indexes; its single-pass stream exceeded the provider deadline, so an authorized business owner created only its temporary `__name__` ascending index. Source business records remain unchanged. The isolated pinned SDK transport passes an explicit fixed readTime for streaming; public Pipeline.stream() currently omits that option. Counts and unique full paths are validated before accepting any shard.

`source-index.mjs` prepares a bounded estimate and exact specification for transitional source index metadata only. Mutation requires an explicitly saved plan and `--execute`; it never changes business documents. The audit fallback index was created through the authorized owner console and is tracked privately for eventual source retirement. Existing message and notification partitions need no new source indexes.

An exporter takes an exclusive private archive checkpoint lock. A concurrent live worker cannot rewrite the same manifest. `--skip-groups` is a recovery-only option: deferred banks leave the manifest incomplete, return exit code 2, and cannot pass import/archive integrity validation. Re-run the same output directory once the missing bank can be enumerated safely; completed shard checksums are validated and skipped.

## Coherent refresh of the partial initial snapshot

A newly built source index cannot serve a PITR snapshot from before that index existed. `--bootstrap-incomplete` is an explicit recovery option for the authorized DTPS backup containing exactly 98 checksummed complete shards and only the audit bank missing. It never marks that older partial backup complete or uses it directly for Mongo import.

```sh
node tools/mongodb-migration/capture-delta.mjs --baseline /private/partial-initial --output /private/coherent-initial --bootstrap-incomplete --indexed-name-groups notificationdeliveryaudits
```

The seed stores typed bodies compressed in private SQLite. At one later fixed snapshot time, the tool inventories every current group and unique identity, compares exact system create/update timestamps, reuses only matching versions, fetches all missing/changed/new bodies, and locally omits confirmed absent paths. It produces a complete new archive whose per-group counts must agree with the new source inventory. A partial bootstrap cannot be designated a final cutover. Normal full import and target verification remain required; source writers stay available until the separately established final gate.
