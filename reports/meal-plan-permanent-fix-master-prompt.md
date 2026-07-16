# Master Prompt: Permanent Meal Plan Stability Fix

Use this prompt with your coding agent to implement a permanent fix in the meal plan section.

## Prompt

You are a senior full-stack engineer working on a production meal-plan system.

Goal:
Implement a permanent fix so meal plans do not vanish, do not get silently renamed, and cannot be title-edited after publish.

Hard requirements:
1. Never hard-delete published meal plans.
2. Keep soft delete only for drafts, with metadata (isDeleted, deletedAt, deletedBy, deletionReason).
3. Once a meal plan is published (status != draft), title/name must be immutable.
4. UI must not send status draft for already-published plans.
5. API must reject updates that attempt published -> draft transitions.
6. API must reject title changes for published plans and return a clear error message.
7. Planning list must fetch full relevant data (status=all, sufficient limit), and include recovery behavior:
	- if history has metadata.mealPlanId but list does not include it, fetch plan by id and merge.
8. Planning card must show:
	- First published date/time from history
	- Republish count if publish happened more than once on same plan id
	- Rename marker if historical rename exists (previousName -> current name)
9. Add deterministic audit logs for:
	- status change
	- blocked title edit
	- blocked published->draft transition
	- allowed rename for draft only
10. Add tests for all edge cases below.

Current known issue patterns to fix:
1. Save flow can push an active plan back to draft.
2. Re-publish on same plan id can create confusion that original plan vanished.
3. Default plan list pagination can hide older/important records.
4. Missing visible publish timeline makes users think first publish data is lost.

Implementation targets:
1. Meal plan update API route
	- enforce immutability rules after publish
	- enforce state transition guardrails
	- preserve history/audit logging
2. Planning section UI
	- safe list fetch query
	- history-based recovery merge
	- publish timeline display
3. Draft save/update logic
	- do not set status=draft for non-draft plans
4. Test coverage
	- integration tests for lifecycle state machine and visibility

State machine rules:
1. Allowed:
	- draft -> active
	- active -> paused
	- paused -> active
	- active -> cancelled (with reason)
	- active -> completed
2. Forbidden:
	- active/paused/completed/cancelled -> draft
	- title change when status != draft

Validation behavior:
1. For forbidden updates, return HTTP 409 with explicit code and message.
2. For missing cancellation reason, return HTTP 400.
3. For publish without valid meal content, return HTTP 400.

Edge-case tests required:
1. Draft publish success with first publish history entry.
2. Attempt title edit after publish fails with 409.
3. Attempt published->draft fails with 409.
4. Draft title edit remains allowed.
5. Draft delete soft-deletes with metadata.
6. Published delete blocked.
7. Visibility list returns expected plans with status=all and large limit.
8. History recovery merge displays plan when list endpoint misses it.
9. First publish date is shown correctly for same plan id republish scenario.
10. Role guards remain intact (admin, dietitian, counselor, client).

Output format required from agent:
1. Root cause summary
2. Files changed and why
3. API behavior before vs after
4. UI behavior before vs after
5. Full test matrix and results
6. Rollback plan
7. Post-deploy verification checklist

Success criteria:
1. Published plan cannot be renamed.
2. Published plan cannot revert to draft.
3. Published plan cannot be deleted.
4. Meal plan card always shows first publish date and timeline context.
5. No TypeScript or lint errors in touched files.

