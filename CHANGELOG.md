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
