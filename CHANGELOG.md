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
