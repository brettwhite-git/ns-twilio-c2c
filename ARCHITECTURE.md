# Architecture

Source of truth for how the NetSuite Click-to-Call SuiteApp is built today and where it is going. Supersedes `BUILD_PLAN.md` (archived).

For workflow guidance and project conventions, see `AGENTS.md` and `CLAUDE.md`. For mistake history and gotchas, see `CHANGELOG.md` and `tasks/lessons.md`. For active work, see `tasks/todo.md`.

---

## Overview

The project is a NetSuite SuiteApp (App ID `com.netsuite.clicktocall`) that adds browser-to-PSTN calling and AI-driven call enrichment to NetSuite CRM. A sales rep clicks a phone icon on a Customer, Contact, or Lead record, a softphone popup opens, the call is placed via the Twilio Voice JS SDK using a JWT generated server-side in NetSuite, and the call is recorded and transcribed by Twilio's Conversational Intelligence service. After the call ends, a Phone Call activity record is created in NetSuite, then enriched asynchronously with the transcript and an AI-generated summary, satisfaction score, tone keywords, and action items via the native `N/llm` module.

### Zero external hosting

Everything runs in two places:
1. **NetSuite SuiteApp** — six SuiteScripts (Client, two UserEvent, Suitelet, RESTlet, Scheduled) plus shared libraries.
2. **Twilio managed platform** — TwiML Bin, TwiML App, Conversational Intelligence service.

There is no middleware, no Node.js server, no OCI compute, no Twilio Functions, and no public-facing webhook endpoints. Every NetSuite-side surface is authenticated via NetSuite session or M2M.

### Roadmap snapshot

| Track | Scope | Status |
|---|---|---|
| 1 — Foundation Repair | Contact-link bug fix, processing-state field, terminal-state detection, min-duration gate, sendBeacon idempotency, softphone redesign | **Mostly complete** — 3 items remain: shared Config/Auth + Enrichment modules, RESTlet authorization hardening, Auth Token → API Secret |
| 2 — Outbound SMS | Rep-initiated SMS, Workflow Action SMS, daily Twilio opt-out sync, "Do Not Text" field | Planned |
| 3 — Setup Wizard + Rep Portlet | Guided setup Suitelet, dashboard Portlet (action surface, not inbox) | Wireframe shipped, implementation pending |

Full roadmap rationale and Codex-roadmap pushbacks are in `/Users/brettwhite/.claude/plans/lets-reivew-the-current-velvety-lovelace.md`.

### Visual design references

- [`docs/architecture/future-state-communications-flow.html`](./docs/architecture/future-state-communications-flow.html) — system-level NetSuite ↔ Twilio flow diagram (stakeholder doc)
- [`docs/architecture/softphone-wireframe.html`](./docs/architecture/softphone-wireframe.html) — Aircall-inspired softphone popup redesign, three states (Ready / Connected / DTMF), with palette tokens and contact-panel data-source rules. Source of truth for the Track 1 / 2 softphone UI refresh.
- [`docs/architecture/setup-wizard-wireframe.html`](./docs/architecture/setup-wizard-wireframe.html) — six-step setup wizard wireframe (Prerequisites, Credentials, Voice, Messaging-Track-2, Permissions, Review). Source of truth for the Track 3 setup wizard Suitelet.

---

## Current Outbound Voice Flow

```
┌────────────────────┐                 ┌─────────────────────┐
│ Customer / Contact │  rec ID + phone │ Suitelet softphone  │
│ / Lead record page │ ──────────────► │ popup (HTML page)   │
└────────────────────┘                 └──────────┬──────────┘
       UE button injection                        │ fetch token (same-origin)
       Client script field icon                   ▼
                                       ┌─────────────────────┐
                                       │ RESTlet             │
                                       │ generateToken       │
                                       │ → Twilio Voice JWT  │
                                       └──────────┬──────────┘
                                                  │ JWT returned to browser
                                                  ▼
                                       ┌─────────────────────┐
                                       │ Twilio.Device.      │
                                       │ connect(To: phone)  │
                                       └──────────┬──────────┘
                                                  │ TwiML App → TwiML Bin
                                                  ▼
                                       ┌─────────────────────┐
                                       │ Twilio places call, │
                                       │ records dual-channel│
                                       │ audio, transcribes  │
                                       │ via Intelligence    │
                                       └──────────┬──────────┘
                          call ends                │
                          ┌───────────────────────┘
                          ▼
       ┌────────────────────┐       ┌─────────────────────────┐
       │ Browser POST       │ ────► │ RESTlet logCall         │
       │ logCall + callSid  │       │ → create Phone Call rec │
       └────────────────────┘       │   with entity / contact │
                                    └──────────┬──────────────┘
                                               │
                          ┌────────────────────┴──────────────┐
                          ▼                                   ▼
       ┌────────────────────────┐        ┌────────────────────────────┐
       │ Browser polls          │        │ Scheduled Script (15 min)  │
       │ RESTlet checkTranscript│        │ retries unprocessed Phone  │
       │ near-term enrichment   │        │ Call records by call SID   │
       └────────────┬───────────┘        └──────────────┬─────────────┘
                    └────────────────┬─────────────────-┘
                                     ▼
                          ┌────────────────────────┐
                          │ Twilio Intelligence    │
                          │ → transcript sentences │
                          │ → N/llm analysis       │
                          │ → write Phone Call AI  │
                          │   fields, set processed│
                          │ → delete recording     │
                          └────────────────────────┘
```

### Softphone UI (Aircall-inspired, shipped)

The Suitelet softphone popup has been fully redesigned. Source of truth visual: [`docs/architecture/softphone-wireframe.html`](./docs/architecture/softphone-wireframe.html).

**Shipped UI capabilities:**
- Dark navy gradient phone surface (`#1A2B47` → `#0F1B30`) with bright white contact name + monospace phone number
- Anonymous SVG avatar (inline silhouette, no external assets, no CSP issues)
- Color-coded status pill: `Ready` / `Connecting` (amber pulsing) / `Ringing` / `Connected` (green) / `Ended` / `Error`
- 3×4 DTMF dialpad **visible on the idle/ready screen**, hidden during active calls
- Rounded-square action buttons; Call button (green) sits in column 2 directly under the `0` key; Back button (neutral) sits in column 3
- Mute button shows amber background + dark text when muted (unmistakable visual state)
- Bottom contact-info panel pulls from Contact record via `search.lookupFields` (email, title, owner, parent customer); "See in NetSuite" link sticks to the bottom
- Contact picker dropdown lives inside the panel; selecting a contact updates header name + info rows + record link client-side

**Dialing capabilities:**
- Functional dialpad pre-call: digits append to the dialable number
- Physical keyboard listener: `0-9` / `*` / `#` / `+` / Backspace / Delete all drive the dialer (skipped when focus is in an input/select)
- Fresh-start logic: first digit after popup load or contact-select clears the prefilled number; subsequent digits append
- Live phone formatting on display (`(xxx) xxx-xxxx` US, `+cc (xxx) xxx-xxxx` international)
- Internal state stores normalized digits with optional leading `+`; Twilio receives `+E.164` via `dialableFormat()` normalization
- Mid-call DTMF tones via `call.sendDigits()`

**Parent-page Call button:** styled as NetSuite's primary blue (`#345D7E` + white text); label is dynamic per entity type (`Call Customer` / `Call Contact` / `Call Lead`).

Key files for this flow:
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_cl_phone_button.js` — edit-mode field icon
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_ue_phone_button.js` — view-mode field icon and toolbar button
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_sl_softphone.js` — Suitelet that serves the softphone HTML page
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_rl_token.js` — RESTlet for `generateToken`, `logCall`, and `checkTranscript`
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_ss_poll_transcripts.js` — Scheduled Script retry/backfill
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/ctc_ue_transcript_viewer.js` — Call Intelligence panel on Phone Call records
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/ctc_twilio_jwt.js` — JWT construction via `N/crypto`
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/ctc_transcript_utils.js` — shared Twilio API + transcript + LLM helpers
- `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/lib/twilio.min.js` — Twilio Voice JS SDK 2.7.3 (bundled because CDN is blocked by NetSuite CSP)

---

## Planned Outbound SMS Flow (Track 2)

TBD — locked once Track 1 completes. High-level shape:

- New UE button alongside the phone icon, opens an SMS compose popup or inline composer.
- New RESTlet action (or dedicated RESTlet) accepts `{ entityId, entityType, contactId, phone, body }`.
- RESTlet calls Twilio Messaging Service via `N/https.post`, captures `MessageSid`, creates an SMS audit record (custom record or native Message — TBD).
- Workflow Action exposes the same send capability to Saved Searches and Workflows for transactional / marketing sends.
- Daily Scheduled Script polls Twilio Messaging Service opt-out endpoint, sets a `Do Not Text` checkbox on matched Customer / Contact / Lead records.
- UE script grays out SMS button when `Do Not Text` is set.

No inbound webhook surface. No two-way inbox.

---

## Security Model

Partially complete. Defensible defense-in-depth is now in place; full RESTlet authorization hardening is still pending in Track 1.

**Shipped defenses:**
- **Idempotent `logCall`** — RESTlet checks for an existing Phone Call with the same `callSid` before creating a new record. Prevents duplicates from the `sendBeacon` race during fast popup-close.
- **Min-duration gate (server-side)** — RESTlet rejects `logCall` requests with `duration < 2s` as `{ error: 'duration_below_threshold' }`. Browser enforces a higher 3s threshold for UX.
- **Status field guards** — terminal statuses skip downstream Twilio API calls in the Scheduled Script (no infinite polling on a failed transcript).
- **Same-origin RESTlet calls** — Suitelet uses `returnExternalUrl: false` so the browser's fetch lives in the user's NetSuite session.

**Resolved baselines:**
- Config record edit is admin-only (`<permittedrole>ADMINISTRATOR</permittedrole>`, `<restriction>EDIT</restriction>`); read is `NONENEEDED` to support custom roles.
- API Key Secret already migrated to NetSuite API Secret reference (`custrecord_ctc_api_secret_id`).
- All script deployments are `<allroles>T</allroles>` for internal roles only — no external (Customer Center / Vendor Center) audience.

**Still pending (Track 1):**
- RESTlet `<allroles>T</allroles>` with three actions and no per-action runtime user / role / ownership validation.
- Auth Token stored as plaintext `CLOBTEXT` on a `NONENEEDED` config record (admin-only edit, but readable by any script). Migration to NetSuite API Secret reference planned.
- No `callSid` ↔ Phone Call record binding check on `checkTranscript` — forged `recordId` could overwrite another user's call enrichment.

---

## Twilio Configuration

TBD — to be filled during Track 1 Auth Token migration and Track 3 setup wizard work.

Current config record (`customrecord_ctc_config`) holds:
- `custrecord_ctc_account_sid` — Twilio Account SID (AC...)
- `custrecord_ctc_auth_token` — **plaintext, migrating to API Secret in Track 1**
- `custrecord_ctc_api_key_sid` — API Key SID (SK...)
- `custrecord_ctc_api_secret_id` — Script ID of NetSuite API Secret holding the API Key Secret
- `custrecord_ctc_twiml_app_sid` — TwiML App SID (AP...)
- `custrecord_ctc_phone_number` — Caller ID number (E.164)
- `custrecord_ctc_intel_service_sid` — Conversational Intelligence Service SID (GA...)

Manual Twilio Console setup (until Track 3 wizard ships):
1. Buy phone number (Voice-capable)
2. Create API Key (Standard) — save SID + Secret
3. Create TwiML Bin with `<Dial record="record-from-answer-dual" callerId="{{From}}"><Number>{{To}}</Number></Dial>`
4. Create TwiML App pointing Voice URL at the TwiML Bin
5. Enable Conversational Intelligence service
6. Populate the NetSuite config record with all SIDs and secrets

---

## Processing States (shipped)

`custevent_ctc_call_status` (CLOBTEXT) on Phone Call drives observability and retry control. The legacy boolean `custevent_ctc_processed` is preserved as a backward-compatibility shim — set `true` only when a terminal state is reached (success or failure).

| Status | Set when | Who writes it |
|---|---|---|
| `Logged` | Phone Call record created at end of call | RESTlet `logCall` |
| `Processing` | First poll has run, transcript not yet ready | RESTlet `checkTranscript`, Scheduled Script |
| `Transcribed` | Transcript + AI fields written, recording deleted | RESTlet `checkTranscript`, Scheduled Script |
| `No transcript` | Recording status `absent` OR Transcript status `failed`/`canceled`/`error` | Both paths; terminal — no further polling |
| `Failed` | Caught exception during enrichment after retries | Scheduled Script error branch |

Browser poller surfaces `terminal` responses to the user as "Transcription unavailable" rather than spinning to the 3-minute timeout. Scheduled Script skips records once they hit a terminal status, eliminating the "poll forever" bug.

Helper exports for branching (`lib/ctc_transcript_utils.js`):
- `CALL_STATUS` constants
- `isRecordingTerminal(recording)` — true for `absent`
- `isTranscriptTerminal(transcript)` — true for `failed` / `canceled` / `error`
- `isTranscriptComplete(transcript)` — true only for `completed`

---

## Known Risks & Gotchas

The authoritative reference for shipped gotchas is `AGENTS.md` (Critical Gotchas, SDF Gotchas) and `tasks/lessons.md`. High-level categories:

- **NetSuite quirks**: TEXTAREA `\n` → `<br>` round-trip, CSS class `display:none` not overridable with empty string, INLINEHTML positioning requires DOM script fallback, `custevent_*` fields reject `FREEFORMTEXT`.
- **Twilio quirks**: JWT `cty` header must be `"twilio-fpa;v=1"`, codec preferences are string literals not enum, Voice SDK 2.x has breaking changes from 1.x.
- **SDF quirks**: SuiteApp `scriptfile` paths use `/SuiteApps/<appId>/...`, custom roles can't be referenced in SuiteApp XML, `<restriction>` only accepts `EDIT` or `CREATE`.

---

## Explicit Non-Goals (v1)

The following are intentionally out of scope for v1. Not deferred-pending-feasibility — out of scope.

- **Inbound voice routing** — Twilio rings a customer-facing number, NetSuite routes to record owner's browser. Requires inbound webhook surface and persistent rep presence detection. Not in scope.
- **Two-way SMS / inbox** — receiving customer replies and threading them into an inbox UI. Requires inbound webhook or polling, plus inbox UX. Out of scope; opt-out polling solves the only compliance-mandatory inbound need.
- **NetSuite-hosted inbound webhooks** — `availableWithoutLogin` Suitelet with `X-Twilio-Signature` HMAC validation. Possible, but adds a public attack surface and latency variance the v1 product story doesn't require.
- **Twilio Functions bridge** — separate Twilio serverless project. Imposes a CLI + deploy step on every SuiteApp customer, breaking the "install SuiteApp + plug in Twilio = done" promise.
- **Chrome extension** — additional rep surface in the browser. Security spike, deferred until the in-NetSuite Portlet experience proves insufficient.
- **Real-time transcription** — Conversational Intelligence is post-call only. Real-time is a different Twilio product (Voice Intelligence with Media Streams) and a different cost profile.
- **Workflow campaign automation for SMS** — bulk send orchestration with consent + delivery-status reliability. Comes after Track 3 maturity, not as part of it.
