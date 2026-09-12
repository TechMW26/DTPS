# DTPS realtime architecture proposal

Reviewed locally on 13 September 2026. Planning only: no database, credentials, rules, environment variables or production deployment changed.

## Recommendation

Adopt Firebase Realtime Database (RTDB) as a narrowly scoped realtime delivery layer. Keep MongoDB authoritative for clients, medical information, meal plans, appointments, messages, subscriptions, payment verification and reports. Keep Redis for short-lived server response caching. A wholesale migration would require rewriting DTPS’s Mongoose models, aggregation queries, relationships, payment invariants and access controls; it is not justified merely to add realtime UI updates.

RTDB can reduce polling latency and Vercel invocations. It will not automatically speed up slow MongoDB queries or expensive page rendering. Benchmark the remaining API bottlenecks independently before attributing an improvement to the new transport.

## What the repositories actually contain

DTPS currently shares one signaling poller per authenticated browser tab in `src/lib/realtime/shared-polling.ts`: 5-second idle polling, 1.25-second polling in messages or after activity, 15 seconds with an active socket, and a 30-second presence heartbeat. It aborts stalled requests and backs off after failures. At a continuous five-second interval, one visible tab alone can generate roughly 720 signaling reads per hour, before heartbeat or other APIs. This is a theoretical rate from the code, not a fresh production measurement.

DTPS already has Firebase phone authentication and push messaging. `src/lib/db/firebase-rtdb.ts` also contains a dedicated server Admin RTDB initializer and health probe, but the source scan found no callers outside that module and no client `firebase/database` subscriptions. The existing helper is a starting point, not evidence of a deployed realtime integration. Its separate Admin app deliberately avoids changing the FCM project and invalidating existing mobile push tokens.

CANAcT uses the Firebase browser SDK in `src/lib/firebase.ts`, with a Singapore database fallback. Its `src/lib/services/chat.ts` subscribes to thread metadata and messages with `onValue`; `liveLocation.ts` uses scoped listeners and `onDisconnect` cleanup. These are useful patterns. However, the current chat message listener orders by `createdAt` without a result limit, so an expanding thread can create expensive snapshots. Its `src/lib/server/rtdb.ts` is an unauthenticated REST helper with a comment describing test-mode rules. That comment does not establish the current deployed rules, which were not inspected. DTPS must use authenticated Admin access and deny-by-default client rules rather than copy that helper.

CANAcT’s vote service also explicitly bypasses its read cache for switchable profile reactions. Keep that lesson: a realtime subscription does not by itself prevent stale cache results or old snapshots from replacing newer confirmed state. DTPS events need versions and deterministic IDs.

## Proposed ownership and data paths

| Data | Authoritative store | RTDB responsibility |
| --- | --- | --- |
| Clinical data, plans, payments, receipts | MongoDB | Per-user resource version only; fetch details from authorized APIs |
| Messages and appointment updates | MongoDB | Minimal thread/resource change signals and unread projections |
| Presence and typing | RTDB | Per-connection state with disconnect cleanup and expiry |
| Catalog and directory response caches | Redis | None |
| WebRTC signaling | Existing durable queue initially | Separate later pilot for short-lived participant-scoped signals |

Suggested paths: `v1/userUpdates/{uid}/{resource}`, `v1/unread/{uid}`, `v1/presence/{uid}/{connectionId}`, and `v1/typing/{threadId}/{uid}`. Resource updates carry a version, event ID and timestamp rather than medical information, message bodies or payment credentials. Listen only to the signed-in user’s records and the currently open conversation. If chat content is later projected, cap the active window (for example the newest 50 messages), index the ordering field and page older history through the existing API. Firebase recommends deep, bounded listeners, indexed queries and cleanup when listeners are no longer needed. [Firebase performance guidance](https://firebase.google.com/docs/database/usage/optimize).

## Identity, delivery and recovery

1. Add a server endpoint that validates the current NextAuth session and issues a Firebase custom token for a stable DTPS user ID. Do not trust a client-supplied UID or role. Use a separate named browser Firebase app if RTDB uses a different project from phone auth/FCM; do not replace the phone-auth instance. Firebase supports this custom authentication bridge. [Custom tokens](https://firebase.google.com/docs/auth/admin/create-custom-tokens).
2. Deploy tested rules denying all reads/writes by default. Allow users to read their own update/counter paths. Only trusted server code writes those projections. Presence/typing writes must match the authenticated UID, validate shape and size, and require current conversation membership. Membership revocation must remove access without waiting for a UI refresh. Logout must detach listeners and sign out the RTDB app.
3. Write domain changes and an outbox event atomically in MongoDB where transactions are supported. A durable scheduled worker retries projection writes with deterministic event IDs. Use monotonic versions and transactions or serialized per-resource writes so a delayed retry cannot overwrite a newer projection. Record processing state only after publication; reconcile missed updates from MongoDB. Do not rely on unawaited work after a Vercel response.
4. Keep one client subscription owner. Apply only newer events, invalidate just the affected view and coalesce bursts. On reconnect, reconcile versions with an authorized API. Use slow fallback polling only while RTDB is unavailable; avoid running both transports continuously.
5. Presence uses one node per tab/device. Register `onDisconnect` before publishing online state; use server timestamps and aggregate connections so closing one tab does not mark every device offline. Typing expires quickly and needs a bounded cleanup job. These primitives are supplied by RTDB. [Connection and disconnect handling](https://firebase.google.com/docs/database/web/offline-capabilities).

## Rollout and acceptance gates

- **Baseline:** collect API p50/p95, Vercel invocations per active user-hour, MongoDB operations, realtime update delay, error rate and Redis cache hit ratio over representative activity.
- **Local emulator:** test client/staff isolation, forged UIDs, revoked membership, token expiry, multi-tab presence, offline reconnect, duplicate and out-of-order events, worker crash between publication and acknowledgement, and RTDB failure. Payment and plan date regressions remain mandatory.
- **Shadow pilot:** publish minimal synthetic/internal-account projections, compare versions, and keep current reads authoritative. Do not copy the full customer database.
- **Feature flag:** enable notifications and unread counts for a small cohort, followed by presence/typing. Migrate signaling only after call setup and reconnect tests succeed on web and native webviews.
- **Proposed targets:** p95 visible update delay below 1 second under normal test conditions, at least 80% fewer background polling invocations for the enabled cohort, no unauthorized reads, and no missing/out-of-order final state during fault tests. These are acceptance targets, not measured results.
- **Rollback:** disable RTDB subscriptions and restore shared polling. MongoDB retains domain truth throughout, so rollback does not require a reverse data migration.

## Location, capacity and cost

Firebase currently lists Iowa, Belgium and Singapore for RTDB; Mumbai is not listed. Singapore is the likely candidate for India-based DTPS users, but measure the Vercel-Mumbai-to-Singapore path. An instance’s region cannot be changed after provisioning. [RTDB locations](https://firebase.google.com/docs/database/locations).

Do not size production against Spark’s 100 simultaneous-connection limit. The documented single-database limit is 200,000 simultaneous connections, and sustained writes above 1,000 per second may be rate-limited. Connections count tabs/devices, not just registered users. [RTDB limits](https://firebase.google.com/docs/database/usage/limits).

Estimate bandwidth from connected devices, initial snapshot size, update frequency and recipients per update; include reconnect snapshots and protocol overhead. Compare the Firebase bill against avoided Vercel/MongoDB work rather than assuming realtime is free. Set budget alerts, listener/egress dashboards and cleanup retention before a production pilot. No cost or performance guarantee is possible without a representative load test.
