# Changelog — Errors, Lessons & What Worked

Track corrections, debugging insights, and validated patterns across sessions.

---

## 2026-02-17 — Pre-Implementation Review Corrections

### Errors Found (before any code was written)

1. **CRM custom field type was wrong**
   - Had: `<custombodyfield>` with `custbody_ctc_` prefix and `<appliesto>PHONECALL</appliesto>`
   - Fix: `<crmcustomfield>` with `custevent_ctc_` prefix and `<appliestophonecall>T</appliestophonecall>`
   - Why: Phone Call is a CRM activity record, not a transaction. CRM activities use `crmcustomfield`/`custevent_`, not `custombodyfield`/`custbody_`.

2. **Scheduled Script recurrence format was invalid**
   - Had: `<recurrence>EVERY15MIN</recurrence>`
   - Fix: Full `<everyweekday>` block with `<startdate>`, `<starttime>`, `<repeat>PT15M</repeat>`, `<enddate>`
   - Why: SDF doesn't accept shorthand recurrence strings. Needs structured XML.

3. **N/llm model family enum was wrong**
   - Had: `llm.ModelFamily.COHERE_COMMAND_R_PLUS`
   - Fix: `llm.ModelFamily.COHERE_COMMAND`
   - Why: The enum is `COHERE_COMMAND` (maps to Cohere Command A). `COHERE_COMMAND_R_PLUS` doesn't exist in the N/llm API.

4. **Phone Call record type used string instead of enum**
   - Had: `record.create({ type: 'phonecall' })`
   - Fix: `record.create({ type: record.Type.PHONE_CALL })`
   - Why: Best practice to use `record.Type` enum. The string `'phonecall'` may work but the enum is the supported API.

### What Worked

- Catching all 4 issues in doc review before writing any code saved significant debugging time
- Using grep verification after edits confirmed zero residual instances of old patterns

---

## 2026-02-18 — Phase 2 JWT Module: Research-Driven Corrections

### Errors Found (during deep research before coding)

1. **N/crypto.createSecretKey() cannot accept plain strings**
   - BUILD_PLAN assumed: `crypto.createSecretKey({ secret: plainTextSecret })`
   - Reality: `secret` param must be a script ID from NetSuite API Secrets (`custsecret_*`)
   - Fix: Store Twilio API Key Secret in Setup > Company > API Secrets, reference by script ID
   - Impact: Added `custrecord_ctc_api_secret_id` field to config record, removed `custrecord_ctc_api_key_secret`

2. **N/https.createSecureString() returns opaque SecureString, not plain text**
   - Oracle's official JWT example uses N/https approach, but SecureString can't be read as a string
   - We need a plain string JWT to pass to the browser's Twilio Voice SDK
   - Fix: Use N/crypto instead — `hmac.digest()` returns a plain string

3. **encode.Encoding.BASE_64_URL_SAFE exists natively**
   - BUILD_PLAN assumed manual `+`→`-`, `/`→`_` conversion from standard base64
   - Reality: `encode.Encoding.BASE_64_URL_SAFE` handles this automatically
   - Fix: Use `BASE_64_URL_SAFE` directly, only need to strip `=` padding and `\n`

4. **`nbf` claim is optional for Twilio Access Tokens**
   - BUILD_PLAN included `nbf` (not before) in JWT payload
   - Research confirmed it's optional; including it risks clock-skew rejection
   - Fix: Omitted `nbf` from payload

### What Worked

- Deep research before coding caught 4 approach issues that would have caused runtime failures
- Validating Twilio JWT format against their GitHub source code (twilio-node AccessToken.ts) confirmed exact payload structure
- N/crypto + API Secrets approach gives both security (no plain text secrets in code) and usability (plain string output for browser)

---

## 2026-02-19 — SDF Deployment: M2M Auth & Manifest Fix

### Errors Found

1. **`credentials_ci.p12` encrypted with stale passkey**
   - `account:setup:ci` failed: "The current passkey cannot decrypt the credentials file"
   - Fix: Delete `/Users/brettwhite/.suitecloud-sdk/credentials_ci.p12` and re-run setup
   - Why: Passkey changed (or was regenerated) since the .p12 was created; SDK doesn't auto-recover

2. **`SUITECLOUD_CI` env var not exported to shell**
   - `.env` file had `SUITECLOUD_CI=1` but it wasn't sourced/exported
   - Fix: `export SUITECLOUD_CI=1` before running any `suitecloud` CLI commands
   - Why: `.env` files aren't auto-loaded — must be explicitly sourced or exported

3. **Missing `<projectversion>` in manifest.xml**
   - Deploy failed: "The project version must be three numbers separated by two dots"
   - Fix: Added `<projectversion>1.0.0</projectversion>` to manifest.xml
   - Why: SuiteApp manifests require a three-part version number; ACP projects don't

### What Worked

- M2M auth (`ctc-m2m`) successfully re-created with correct certificate + PEM key

4. **`deploy.xml` missing `<objects>` section**
   - First deploy only uploaded files — no custom objects were created
   - Fix: Added `<objects><path>~/Objects/*</path></objects>` to deploy.xml
   - Why: SuiteApp deploy.xml needs both `<files>` and `<objects>` sections

5. **`FREEFORMTEXT` not a valid SDF field type**
   - All FREEFORMTEXT fields failed validation
   - Fix: Changed to `CLOBTEXT` (works for both CRM custom fields and custom record fields)

6. **`<includename>` must be boolean, not string**
   - Had `<includename>CTC Configuration</includename>`
   - Fix: `<includename>T</includename>` (T/F boolean)

7. **Scheduled Script deployment `RELEASED` status invalid**
   - SDF doesn't accept `RELEASED` for scriptdeployment status
   - Fix: Changed to `SCHEDULED`

8. **`<title>` required on Scheduled Script deployments but "not supported" on Client Script deployments**
   - SDF inconsistency: warns `title` is unsupported on clientscript deployments, but errors if missing on scheduledscript deployments

### What Worked

- Full deploy completed in 5 seconds — 14 objects + 5 files
- All CRM fields, config record, and script deployments created successfully

---

## 2026-02-19 — Post-Deploy Fixes: CORS + View Mode Phone Icon

### Errors Found

1. **CORS blocks RESTlet token fetch from Suitelet popup**
   - Suitelet at `td3061543.app.netsuite.com`, RESTlet resolved to `td3061543.restlets.api.netsuite.com` — different origins
   - Fix: `returnExternalUrl: true` → `false` in `ctc_sl_softphone.js`
   - Internal URL resolves against same origin, browser session cookie handles auth

2. **Phone icon only appeared in edit mode, not view mode**
   - NetSuite renders field labels with different DOM IDs in view vs edit mode
   - First attempt: Added `_val` selector and `querySelector` fallback — did NOT work
   - Second attempt: Added UserEvent `beforeLoad` script with `form.addButton()` — "Call" button now appears in toolbar in BOTH view and edit mode ✅
   - Field-level phone icon (📞 next to Phone label) still only works in edit mode — NOT FIXED
   - Root cause: Client Script DOM injection selectors don't match view-mode DOM structure

3. **Twilio CDN SDK blocked by NetSuite CSP**
   - `<script src="https://sdk.twilio.com/...">` returned 403 (CDN deprecated)
   - Fix: Downloaded SDK from jsdelivr, bundled in File Cabinet as `lib/twilio.min.js`
   - Loaded via `N/file.load()` to get internal URL

4. **"Cannot read properties of undefined (reading 'Opus')" — NOT a token fetch error**
   - Token fetch now succeeds (CORS fix + local SDK loading worked)
   - Error occurs in `initDevice()`: `Twilio.Device.Codec.Opus` doesn't exist in SDK 2.7.3
   - `Twilio.Device.Codec` is undefined — codec prefs should be strings (`'opus'`, `'pcmu'`), not enum refs
   - NOT FIXED — needs code change in Suitelet HTML

### What Worked
- CORS fix (internal URL) ✅
- UserEvent "Call" button in toolbar (view + edit) ✅
- Bundled Twilio SDK loads from File Cabinet ✅

### What Did NOT Work
- Client Script DOM selectors for view mode — still can't find field labels
- `Twilio.Device.Codec.Opus` enum reference — doesn't exist in bundled SDK 2.7.3

---

## 2026-02-19 — Contact Dropdown Not Visible (CSS Override Bug)

### Error Found

1. **Contact dropdown hidden despite correct data**
   - Server-side contact search returned correct results (verified via console.log)
   - `contactRow.style.display = ''` did NOT override CSS class `.contact-select-row { display: none; }`
   - Setting inline style to empty string only removes the inline style — it doesn't override a class-level `display: none`
   - Fix: `contactRow.style.display = 'block'` — explicitly overrides the CSS class rule
   - File: `ctc_sl_softphone.js` line 392

### What Worked
- Diagnostic console.log confirmed server-side data was correct, narrowing the bug to pure CSS/JS display logic
- Call logging confirmed working end-to-end: call placed, Phone Call record created with correct duration (18s)
- Full call lifecycle verified: Device registered → Ringing → Call accepted → Call disconnected → Call logged ✅

---

## 2026-02-19 — Call Intelligence Viewer: Layout & Transcript Fixes

### Errors Found

1. **Transcript displayed as one blob — `<br>` not handled**
   - NetSuite TEXTAREA fields convert `\n` → `<br>` on storage
   - `getValue()` returns `<br>`-separated text, but viewer split on `\n` only → zero splits
   - Fix: `text.split(/\n|<br\s*\/?>/).filter(Boolean)` — handles both fresh and stored data

2. **Transcript not scrollable in VIEW mode**
   - Lines 9+ hidden via `display: none` with "Show all N lines" toggle button
   - `max-height: 300px; overflow-y: auto` never triggered because only 8 visible lines fit under the max-height
   - The collapse toggle and scroll container were mutually exclusive — couldn't both work
   - Fix: Removed collapse/toggle entirely. All lines always render, container scrolls naturally

3. **`message` field redundantly duplicated transcript**
   - Transcript written to both `custevent_ctc_transcript` and `message` (Message subtab)
   - Plus the viewer panel rendered it a third time
   - Fix: Removed `message` setValue from both `ctc_ss_poll_transcripts.js` and `ctc_rl_token.js`

### Layout Changes

- **v1**: Single-column stacked → **v2**: 2-column grid (transcript left, metrics right) → **v3**: 3-column metrics row + full-width scrollable transcript
- Added `field.updateLayoutType({ layoutType: 'OUTSIDEABOVE' })` + DOM fallback script to position panel above "Primary Information"
- Renamed "Custom" tab → "Call Intel" via `form.getTab({ id: 'custom' }).label`
- Added `N/ui/serverWidget` dependency for field layout API

### What Worked
- `splitLines()` regex handles `\n`, `<br>`, `<br/>`, `<br />` — all NetSuite storage variants
- 167 tests passing after all changes
- Deploy only uploaded changed file (5 seconds)

---

## 2026-02-19 — Call Intelligence Panel UI Overhaul

### Changes

1. **Metrics row expanded to 4-column grid** — moved recording link from bottom row into 4th column alongside score, duration, and tone pills. Shows "No recording" muted text when URL is empty.

2. **Action items restyled as orange quote block** — replaced blue bullet list with left-bordered orange block (`#f0ad4e` border, `#fef9f0` background), matching the AI Summary quote block pattern. Section omitted entirely when no action items.

3. **Redundant CRM fields hidden in VIEW mode** — 7 fields (summary, satisfaction, tone, actions, duration, recording URL, transcript) hidden via `updateDisplayType(HIDDEN)` since the panel already renders them. Fields remain visible in EDIT mode for manual editing.

4. **Subject/title generation improved** — LLM prompt clarified ("NOT a full sentence" + 2 examples). Fallback logic changed: instead of truncating full summary at 80 chars (producing cut-off sentences), now extracts first clause (split on `.!?`) limited to 60 chars.

5. **New `custevent_ctc_ai_brief` CRM field** — CLOBTEXT field for short 1-sentence summaries (~120 chars) suitable for sublist views. Populated by scheduled script with fallback to truncated summary.

6. **Visual separators added** — horizontal rules (`<hr>`) between panel sections (summary → metrics → transcript → action items) and vertical `border-right` dividers between metrics grid columns.

### Errors Found

1. **`FREEFORMTEXT` not valid for CRM event fields** — `custevent_ctc_ai_brief` initially used `FREEFORMTEXT`, SDF rejected it. CRM event fields only accept `CLOBTEXT`, `TEXTAREA`, `INTEGER`, `CHECKBOX`, `URL`, etc. Fixed to `CLOBTEXT`.

### What Worked
- 172 tests passing (8 new tests for field hiding, title fallback, brief fallback)
- All lint clean
- Deploy successful — 3 scripts uploaded, 1 new field created

---

## 2026-05-12 — BUILD_PLAN + Architecture Review Discoveries

### Errors / Drift Found

1. **`BUILD_PLAN.md` is no longer a safe implementation source of truth**
   - What went wrong: The plan still describes Account Customization scaffolding, `/SuiteScripts` paths, plaintext API key secret storage, CDN SDK loading, `returnExternalUrl: true`, Twilio codec enums, and an old scheduled-script-created Phone Call lifecycle.
   - Fix: Treat `BUILD_PLAN.md` as historical planning until rewritten; use a new current architecture/product spec for next-stage work.
   - Why: Following the old plan would reintroduce previously fixed deployment, CORS, credential, and runtime issues.

2. **Contact-origin calls may not link the created Phone Call to the Contact**
   - What went wrong: Contact records pass `entityId` and `entityType: contact`, but the Suitelet only sends `contactId` when a customer dropdown contact is selected. The RESTlet skips `company` for contacts and only sets `contact` when `body.contactId` exists.
   - Fix: Next implementation should add a call-target resolution seam and set the Phone Call `contact` field from the originating Contact record, while still supporting selected customer contacts.
   - Why: Calls launched from a Contact record should remain attached to that Contact for activity history and reporting.

3. **RESTlet and Scheduled Script enrichment paths have drifted**
   - What went wrong: RESTlet `checkTranscript` and Scheduled Script polling both enrich Phone Calls, but Scheduled writes fields the RESTlet path does not, including `custevent_ctc_ai_brief` and recording duration.
   - Fix: Move the shared enrichment write contract into one module used by both trigger adapters.
   - Why: Once the RESTlet marks a call processed, the Scheduled Script will not repair fields omitted by the RESTlet path.

4. **Recording URL storage conflicts with immediate recording deletion**
   - What went wrong: Both enrichment paths store a Twilio MP3 URL and then delete the Twilio recording. The viewer renders a download link when the URL exists.
   - Fix: Decide whether recordings are retained or deleted. If deleted, store deletion/audit metadata instead of a durable download URL.
   - Why: A dead download link misleads users and weakens recording-retention semantics.

5. **RESTlet trust boundary needs explicit authorization and validation**
   - What went wrong: One all-roles RESTlet accepts browser-supplied action, entity, contact, phone, duration, call SID, and record ID values for token, logging, and enrichment operations.
   - Fix: Add runtime user, role/permission, entity/contact relationship, Phone Call ownership, and call SID/record ID binding checks before mutation or recording deletion.
   - Why: Same-origin session auth proves the user is logged in, but it does not prove the requested mutation is authorized or internally consistent.

6. **Credential and transcript privacy controls need a current spec**
   - What went wrong: The API key secret moved to NetSuite API Secrets, but the Twilio Account Auth Token remains a normal `CLOBTEXT` field on a `NONENEEDED` config record. Transcript, AI output, and logging policies are also under-specified.
   - Fix: Specify secret storage, role visibility, transcript redaction/retention, search/reporting exposure, sanitized logging, and cleanup retry behavior before the next implementation phase.
   - Why: Call transcripts and Twilio credentials are sensitive enough that "works in sandbox" is not a sufficient production posture.

### What Worked

- CE-style document review plus architecture exploration produced consistent findings across coherence, feasibility, product/design, security, and integration perspectives.
- `npm test -- --runInBand` passed: 172 tests across 8 suites.
- `npm run lint` passed.

---

## 2026-05-12 — Future-State Flow Scope Correction

### Correction

1. **Diagram carried too much future scope**
   - What went wrong: The first future-state flow visual included inbound calling, inbound SMS, two-way inbox, NetSuite endpoint-first webhook scope, and Chrome extension risk framing while the current roadmap discussion had narrowed to outbound calling and outbound SMS.
   - Fix: Reworked `docs/architecture/future-state-communications-flow.html` around outbound-only Kami-style workflow nodes: outbound calling, outbound update SMS, and future outbound marketing SMS.
   - Why: The roadmap visual should clarify the next product direction, not preserve every explored option. Inbound/webhook/extension work can return as separate spikes when it is the active decision.

2. **Outbound SMS needed two distinct lanes**
   - What went wrong: Treating SMS as one generic flow hides the difference between rep-authored updates and marketing/campaign messages.
   - Fix: Split SMS into "Updates" and "Marketing Messages" tracks with consent, suppression, sender-readiness, and template gates shown explicitly.
   - Why: Update messaging and marketing messaging have different operational risk, compliance posture, and likely implementation sequence.
