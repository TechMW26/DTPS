# Meal Plan Permanent Fix Report

Date: 2026-05-29

## 1. Executive Summary

Users reported that meal plans appeared to be deleted, vanished, or replaced. Investigation showed that in multiple cases data was not physically deleted, but visibility and lifecycle handling caused confusion:
1. Published plans could be moved back to draft through UI/API flow.
2. Same plan id could be re-published, creating multiple publish records that looked like disappearance/replacement.
3. List fetch windows and filters could hide expected plans.
4. Publish timeline was not visible in Planning, so first publish context was missing.

## 2. Verified Data Findings

Case checked: client C-5385, plan detox plan.

Findings:
1. Plan exists and is active.
2. Plan id is consistent across events.
3. Publish history has multiple assign entries for the same mealPlanId, confirming re-publish behavior rather than hard delete.

Interpretation:
1. The plan did not vanish from database.
2. The user-facing behavior looked like vanishing due to lifecycle transitions and visibility gaps.

## 3. Root Cause Analysis

### Root Cause A: Published-to-draft regression path
UI draft-save flow can send status draft while editing existing plan records, and API update path currently allows status updates without strict lifecycle transition guard.

Impact:
1. Active plan can become draft on same id.
2. Later draft->active creates another publish history record for same plan.
3. Users interpret this as replaced/disappeared plan.

### Root Cause B: Title mutability after publish
API allows updating name on non-draft plan.

Impact:
1. Published plan title can change silently.
2. Original title appears missing even when plan id is same.

### Root Cause C: Visibility window and filter sensitivity
Planning fetch can use default query window.

Impact:
1. Expected plans may not appear in list under some pagination/filter combinations.

### Root Cause D: Missing timeline transparency
Planning card does not clearly show first publish timestamp and republish count.

Impact:
1. Operators cannot see continuity of same plan id over time.

## 4. Permanent Fix Design

### 4.1 Lifecycle state machine enforcement (API)
1. Allow: draft->active, active<->paused, active->cancelled(with reason), active->completed.
2. Block: any non-draft -> draft transition.
3. Return HTTP 409 for forbidden transitions with explicit error code.

### 4.2 Publish immutability guard
1. If existing status != draft, reject title/name changes.
2. Return HTTP 409 with message: title cannot be edited after publish.
3. Log blocked action in activity logs.

### 4.3 Deletion protection
1. Draft: soft-delete only with metadata.
2. Non-draft: always blocked.

### 4.4 Planning visibility hardening
1. Fetch with status=all and higher limit.
2. Recovery merge:
	- read diet history metadata.mealPlanId values
	- fetch missing plans by id
	- merge into planning list

### 4.5 Timeline clarity in UI
1. Show first published datetime per plan.
2. Show republish count when >1 publish events exist for same plan id.
3. Show rename marker only when historical rename metadata exists.

## 5. End-to-End Flow (After Fix)

### 5.1 Create draft
1. Dietitian creates draft.
2. Draft editable including title.
3. Draft deletable via soft delete.

### 5.2 Publish
1. draft->active allowed only if meal content valid.
2. Assign history entry created with mealPlanId and name.
3. Push notification sent.

### 5.3 Post-publish edits
1. Nutrition content, dates, pause/resume allowed by policy.
2. Title edit blocked (409).
3. status non-draft->draft blocked (409).

### 5.4 Planning display
1. List shows complete active context.
2. If list misses history-known plan id, id-based recovery fetch restores visibility.
3. Card shows first publish date and republish count.

## 6. Test Matrix

Required tests:
1. draft->active success.
2. publish without meals fails 400.
3. active title edit fails 409.
4. active->draft fails 409.
5. draft title edit succeeds.
6. draft delete soft-deletes with metadata.
7. published delete blocked 409.
8. planning list with status=all includes expected plans.
9. history recovery merge includes missing-by-list plan id.
10. first publish date and republish count appear correctly.

## 7. Deployment and Verification Checklist

1. Deploy API guards and UI visibility changes together.
2. Verify C-5385 detox plan appears in Planning.
3. Verify first publish date (2026-05-21) appears on card.
4. Attempt title edit on published plan and confirm 409.
5. Attempt forced draft save on published plan and confirm 409.
6. Run integration tests and confirm pass.

## 8. Rollback Plan

If regression occurs:
1. Keep DB data unchanged (no destructive migrations required).
2. Revert UI markers first if display-only issue.
3. Retain API immutability guards unless critical workflow break is confirmed.
4. Use export snapshots for affected clients before emergency rollback.

## 9. Expected Outcome

After implementing this permanent fix set:
1. Meal plans no longer appear to vanish.
2. Published names remain stable.
3. Lifecycle is deterministic and auditable.
4. Operators can trace continuity with first publish date and republish count.

