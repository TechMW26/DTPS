#!/usr/bin/env bash
set -euo pipefail

PRINT_ONLY=false
if [[ "${1:-}" == "--print" ]]; then
  PRINT_ONLY=true
fi

timestamp="$(date "+%Y-%m-%d %H:%M:%S %Z")"
slug_timestamp="$(date "+%Y-%m-%dT%H-%M-%S")"
report_dir="reports"
report_file="$report_dir/voice-message-qa-$slug_timestamp.md"

generate_checklist() {
  cat <<EOF
# Voice Message E2E QA Checklist

- Date: $timestamp
- Tester: 
- Build/Commit: 
- Environment: local / staging / production
- Device Matrix: Web desktop, Web mobile, Android WebView, iOS WebView

## 1) Basic Record And Preview (Web)
- [ ] Open a 1:1 chat and tap the voice button.
Expected: Recorder opens and starts recording immediately.
- [ ] Tap stop/end.
Expected: Recording stops and preview player appears.
- [ ] Play the preview.
Expected: Recorded audio plays correctly.
- [ ] Tap Discard.
Expected: Draft audio is fully removed and input returns to normal.

## 2) Re-record Flow (Web)
- [ ] Start a new voice recording and stop it.
- [ ] Tap Re-record.
Expected: Old draft is discarded and a new recording starts.
- [ ] Stop and preview again.
Expected: Only the latest recording is available.

## 3) Successful Send Flow (Web)
- [ ] Record and tap Send.
Expected: "Sending voice..." placeholder appears then transitions to sent voice message.
- [ ] Verify receiver sees and can play the voice message.
Expected: Receiver playback works and no duplicate message appears.

## 4) Upload Failure + Resend (Before API Send)
- [ ] Record voice, then switch network offline before tapping Send.
- [ ] Tap Send.
Expected: Bubble changes to failed state with explicit resend action.
- [ ] Restore network and tap Resend on the failed voice bubble.
Expected: Voice uploads, sends successfully, and failed placeholder is replaced.

## 5) API Failure + Resend (After Upload)
- [ ] Keep network online but force message API failure (e.g., temporary API block/proxy rule).
- [ ] Send voice or text message.
Expected: Bubble shows failed status with Resend action.
- [ ] Remove the API block and tap Resend.
Expected: Message sends successfully and status updates.

## 6) Mobile WebView Validation (Android + iOS)
- [ ] Verify microphone permission prompt appears and can be granted.
Expected: Recording starts after permission.
- [ ] Verify preview playback in WebView.
Expected: Audio preview is playable.
- [ ] Verify send, failure, and resend behavior on mobile network transitions.
Expected: Same behavior as web, including failed bubble + resend.

## 7) Regression Checks
- [ ] Text, image, video, and file messages still send normally.
- [ ] Typing indicator still works.
- [ ] Chat does not duplicate messages after sending.

## Result Summary
- Overall: PASS / FAIL
- Blockers: 
- Notes: 
EOF
}

if [[ "$PRINT_ONLY" == "true" ]]; then
  generate_checklist
  exit 0
fi

mkdir -p "$report_dir"
generate_checklist > "$report_file"

echo "Voice message QA checklist created: $report_file"
echo "Tip: run with --print to output checklist directly in terminal."
