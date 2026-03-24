# NetSuite Click-to-Call with AI Call Analysis

## Workflow Orchestration

### 1. Plan Mode Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, testing, deployment and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop
- After ANY correction or bug discovery: update `CHANGELOG.md` with what went wrong, the fix, and why
- After user corrections specifically: also update `tasks/lessons.md` with the pattern
- Review `CHANGELOG.md` at session start to avoid repeating past mistakes
- Ruthlessly iterate on these lessons until mistake rate drops

### 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## What This Is

A SuiteApp (SDF) project that adds browser-to-PSTN calling to NetSuite. App ID: `com.netsuite.clicktocall`. Sales reps click a phone icon on Customer/Contact/Lead records, a softphone popup opens, the call is recorded by Twilio, transcribed by Twilio Conversational Intelligence, and analyzed by NetSuite's N/llm module. The result is a Phone Call activity record with AI-generated summary, satisfaction score, tone keywords, and action items.

## Architecture — Zero External Hosting

Everything lives in two places:
1. **NetSuite SuiteScripts** — 6 scripts (Client, UserEvent, Suitelet, RESTlet, Scheduled, library module)
2. **Twilio's managed platform** — TwiML Bin, TwiML App, Conversational Intelligence (no custom server code)

No middleware. No Node.js server. No OCI Compute. No external hosting.

## Key Technical Decisions

- **JWT tokens built in SuiteScript** using N/crypto HMAC-SHA256 (no Twilio SDK dependency)
- **Twilio Voice JS SDK 2.x** loaded in Suitelet-served HTML page (popup window)
- **Post-call transcription** via Twilio Conversational Intelligence ($0.035/min, async)
- **AI analysis** via N/llm module (native SuiteScript, Cohere Command A (cohere.command-a-03-2025), free tier ~1000 req/month)
- **Polling model** — Scheduled Script polls Twilio every 15 min for completed transcripts (no webhooks needed)
- **Recording cleanup** — delete Twilio recordings after transcript extraction

## SuiteScript Conventions

- API Version: 2.1 (ES6+ syntax, arrow functions, template literals)
- Module scope: SameAccount
- All scripts use JSDoc @NApiVersion / @NScriptType / @NModuleScope annotations
- Config loaded from `customrecord_ctc_config` singleton record
- Error handling: try/catch with N/log.error, never throw unhandled in Scheduled Scripts
- Field IDs prefixed `custrecord_ctc_` (custom record fields) or `custevent_ctc_` (CRM event fields on Phone Call)
- CRM activity records (Phone Call, Task, Event) use `crmcustomfield` with `custevent_` prefix, NOT `custombodyfield`/`custbody_`
- All server-side scripts use 2.1 module pattern (`@NApiVersion 2.1`, `define([...])`)
- Logging uses `N/log` (not `console.log`) on server side; client-side (Suitelet HTML) uses `console.log`
- Script definitions in `src/Objects/` XML files control deployment, audience, and execution role

## File Layout

```
src/
├── FileCabinet/
│   └── SuiteApps/
│       └── com.netsuite.clicktocall/
│           └── click_to_call/
│               ├── ctc_cl_phone_button.js       # Client Script (edit-mode phone icon)
│               ├── ctc_ue_phone_button.js      # UserEvent Script (toolbar button + view-mode phone icon)
│               ├── ctc_sl_softphone.js          # Suitelet (softphone popup HTML)
│               ├── ctc_rl_token.js              # RESTlet (JWT token endpoint)
│               ├── ctc_ss_poll_transcripts.js   # Scheduled Script (poll Twilio)
│               ├── ctc_ue_transcript_viewer.js # UserEvent Script (Call Intelligence panel)
│               └── lib/
│                   ├── ctc_twilio_jwt.js        # JWT module
│                   ├── ctc_transcript_utils.js  # Shared transcript/Twilio API utilities
│                   └── twilio.min.js            # Twilio Voice SDK 2.7.3 (bundled)
├── Objects/
│   ├── customrecord_ctc_config.xml
│   ├── customscript_ctc_cl_phone_button.xml
│   ├── customscript_ctc_ue_phone_button.xml
│   ├── customscript_ctc_ue_transcript_viewer.xml
│   ├── customscript_ctc_sl_softphone.xml
│   ├── customscript_ctc_rl_token.xml
│   ├── customscript_ctc_ss_poll.xml
│   └── custevent_ctc_*.xml                  # Phone Call CRM custom fields
├── manifest.xml
└── deploy.xml
```

## Build Order (dependencies flow downward)

1. `lib/ctc_twilio_jwt.js` — no dependencies, test independently
2. `ctc_rl_token.js` — depends on #1 + config record
3. `ctc_sl_softphone.js` — depends on #2 (resolves RESTlet URL)
4. `ctc_ue_phone_button.js` — depends on #3 (resolves Suitelet URL, adds toolbar button + view-mode icon)
5. `ctc_cl_phone_button.js` — depends on #3 (resolves Suitelet URL, adds edit-mode field icon)
6. `ctc_ss_poll_transcripts.js` — independent of #1-5, depends on config record + Phone Call fields + `lib/ctc_transcript_utils.js`
7. `ctc_ue_transcript_viewer.js` — independent, depends on N/ui/serverWidget + Phone Call CRM event fields

## Critical Gotchas

- **N/crypto base64url**: N/encode outputs standard base64. Must convert: `+` → `-`, `/` → `_`, strip trailing `=`. If line breaks appear in output, strip those too.
- **Twilio JWT cty header**: Must include `"cty": "twilio-fpa;v=1"` or token silently fails.
- **Suitelet HTML**: The Suitelet serves raw HTML (not a NetSuite form). Use `context.response.write()` not `N/ui/serverWidget`.
- **RESTlet auth**: The Suitelet's client-side JS calls the RESTlet using the user's existing NetSuite session (same-origin). No separate auth needed.
- **Phone Call record type**: Use `record.Type.PHONE_CALL` enum (not string `'phonecall'`). Required fields: `title`, `status` (COMPLETE/SCHEDULED).
- **N/llm JSON parsing**: Model may wrap JSON in markdown code fences. Strip ` ```json ` and ` ``` ` before parsing.
- **Twilio Voice SDK version**: Use 2.x. SDK is bundled in File Cabinet (`lib/twilio.min.js`) — loaded via `N/file.load()` at runtime. CDN blocked by NetSuite CSP.
- **Twilio codec preferences**: Use string literals `'opus'`, `'pcmu'` — NOT `Twilio.Device.Codec.Opus` (enum doesn't exist in SDK 2.7.3).
- **RESTlet URL in Suitelet**: Use `returnExternalUrl: false` — internal URL stays same-origin with Suitelet popup. `returnExternalUrl: true` resolves to `restlets.api.netsuite.com` which causes CORS failure.
- **CSS display override**: `element.style.display = ''` does NOT override a CSS class `display: none`. Use `element.style.display = 'block'` to explicitly override class-level hiding.
- **NetSuite TEXTAREA storage**: Converts `\n` → `<br>` on save. Always split on `/\n|<br\s*\/?>/` when reading back stored text.
- **INLINEHTML positioning**: `form.addField()` appends to end. Use `field.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEABOVE })` + DOM script fallback to position above Primary Information.
- **Call Intelligence panel patterns**: Blue quote block (`.ctc-summary`) for AI text, orange quote block (`.ctc-action-block`) for action items, 4-column metrics grid with `border-right` dividers, `<hr class="ctc-divider">` between sections. Hide redundant CRM fields in VIEW mode via `updateDisplayType(HIDDEN)`.

## SDF Gotchas

- **CRM event field types**: `custevent_*` fields reject `FREEFORMTEXT` — use `CLOBTEXT` for all text fields, `TEXTAREA` for multiline
- **XML element names**: Use `<restlet>`, `<suitelet>`, `<scheduledscript>`, `<clientscript>` — NOT `<restletscripttype>` etc.
- **`isinactive` filter**: Not valid on all record types — test before assuming it works on a given type
- **deploy.xml differences**: SuiteApp projects don't support `<configuration>` or `<translationcollections>` sections. This project is a SuiteApp — deploy.xml has only `<files>`.
- **SuiteApp scriptfile paths**: XML `<scriptfile>` refs must use `/SuiteApps/com.netsuite.clicktocall/click_to_call/...` (not `/SuiteScripts/...`). Physical files live at `src/FileCabinet/SuiteApps/<appId>/`
- **SuiteApp manifest requirements**: `projecttype="SUITEAPP"` requires `<publisherid>` and `<projectid>` — Jest's `ProjectInfoService` reads these from manifest.xml at test time
- **Custom role permissions in SuiteApp XML**: SuiteApps can only reference standard roles (e.g., `ADMINISTRATOR`, `SALES_PERSON`) in `<permittedrole>`. Custom roles (e.g., `customrole1126_0`) are rejected because they're account-specific. For custom roles, use `NONENEEDED` access type or add permissions manually in the UI after deploy.
- **`<restriction>` valid values**: Only `EDIT` and `CREATE` are valid for the `<restriction>` element in custom record permissions. `VIEW` and `NONE` are invalid and fail validation. Omit `<restriction>` entirely for VIEW-level permissions.
- **Config record access type**: Currently `NONENEEDED` to support custom roles (MFG Sales = `customrole1126_0`). Admin retains FULL permission via the permissions list for edit access.

## Multi-Role Support

- **Config record** (`customrecord_ctc_config`): Access type `NONENEEDED` — any role can read config. Required because SuiteApp XML can't reference custom roles, and the sandbox uses custom roles (MFG Sales).
- **All script deployments**: `<allroles>T</allroles>` — executes for all internal roles. Note: this only covers internal roles; external roles (Customer Center, Vendor Center) need `<audslctrole>` if ever required.
- **Activities sublist view**: The CTC custom fields (AI Processed, AI Summary, Duration, Tone Keywords, Satisfaction Score) only appear if the role's Activities sublist uses a custom view that includes them. This is a per-role UI configuration in NetSuite (Customize View), not controlled by SDF. After deploy, each role needs the custom view configured once.

## Unit Testing

- **Framework**: Jest 29 + `@oracle/suitecloud-unit-testing` (official Oracle package)
- **Config**: `jest.config.js` uses `SuiteCloudJestConfiguration.build()` which auto-provides stubs for all `N/` modules and transforms AMD `define([...])` to CommonJS
- **Test location**: `__tests__/` at project root (keeps tests out of `src/` which gets deployed)
- **Stubs**: All `N/*` modules are auto-mocked — use `jest.fn()` / `mockReturnValue()` / `mockImplementation()` to control behavior in tests
- **N/llm stub missing**: `@oracle/suitecloud-unit-testing` has no `N/llm` stub. Manual mock at `__mocks__/llm.js`, mapped via `moduleNameMapper['^N/llm$']` in `jest.config.js`
- **Test imports**: Use `SuiteScripts/click_to_call/...` in test imports — the Jest moduleNameMapper transparently redirects to the SuiteApps directory regardless of project type

## Linting

- **Engine**: ESLint 8 + `eslint-plugin-suitescript` (community standard — no official Oracle ESLint plugin exists)
- **Config**: `.eslintrc.json` extends `plugin:suitescript/recommended` (all 10 rules at error level)
- **Key rules**: `api-version`, `script-type`, `entry-points`, `module-vars`, `no-extra-modules`, `no-invalid-modules`
- **Scope**: Lints only `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/click_to_call/`

## Deployment (SDF + M2M Auth)

### Account & Credentials
- **Account ID**: `td3061543` (MFG 25.2 AI — sandbox)
- **Auth method**: M2M (machine-to-machine) certificate auth
- **Certificate ID**: `ibNoJEIe0oFFvNSjmLYndlWzmUXA8kLoOqWAbYB0vu0`
- **Private key**: `/Users/brettwhite/Projects/ns-twilio-c2c/private-key.pem`
- **CI passkey**: stored in macOS Keychain under service `suitecloud-ci-passkey` — retrieve with `security find-generic-password -s "suitecloud-ci-passkey" -w`

### Deploy Command (copy-paste ready)
```bash
# From the repo root (not src/) — suitecloud auto-detects src/
# Credentials sourced from .env (SUITECLOUD_CI and SUITECLOUD_CI_PASSKEY)
source .env && suitecloud project:deploy
```

### First-Time Setup Per Context (auth ID must be linked to project)
If deploy fails with "No account has been set up for this project", run:
```bash
source .env && suitecloud account:setup:ci \
  --account td3061543 \
  --authid ctc-m2m-deploy \
  --certificateid ibNoJEIe0oFFvNSjmLYndlWzmUXA8kLoOqWAbYB0vu0 \
  --privatekeypath /Users/brettwhite/Projects/ns-twilio-c2c/private-key.pem
```
**Important**: If the authid is already taken ("This authentication ID is already in use"), just pick a new unique name (e.g., `ctc-m2m-3`, `ctc-m2m-deploy`). The name is arbitrary — it just links credentials to the project.

### Common Deploy Issues
- **"No account has been set up"** — run `account:setup:ci` as above. This happens when context is cleared or `.suitecloud` project config is missing.
- **"authentication ID already in use"** — change the `--authid` value to something new. Old IDs persist globally in `~/.suitecloud-sdk/credentials_ci.p12`.
- **"cannot decrypt credentials file"** — passkey changed since `.p12` was created. Delete `~/.suitecloud-sdk/credentials_ci.p12` and re-run setup.
- **`SUITECLOUD_CI` env var** — must be set for CLI to use M2M auth. Without it, CLI tries browser-based login (which fails in headless/CLI contexts).
- **`--select` doesn't work with `SUITECLOUD_CI` set** — the `--select` flag on `account:setup:ci` is incompatible with the CI env var. Use full setup instead.
- **Deploy warnings are safe to ignore** — `loglevel`, `status`, `title` on clientscript deployments, `allowinlineinsert` on custom records — all cosmetic, don't affect functionality.

## Git & GitHub

- **Repo**: `brettwhite-git/ns-twilio-c2c` (private)
- **Branch**: `main`
- **gh CLI**: authenticated, use for PR/issue workflows

## What NOT to Build

- No inbound call handling (outbound only for MVP)
- No real-time transcription (post-call only)
- No webhook endpoints (polling model only)
- No middleware server
- No mobile support
- No call transfer/conference features
