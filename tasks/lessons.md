# Lessons Learned

Capture corrections and patterns here after each user correction or bug discovery.

## Pre-Implementation (Doc Review)
- CRM custom fields use `<crmcustomfield>` with `custevent_` prefix, NOT `<custombodyfield>`/`custbody_`
- Scheduled Script recurrence uses `<everyweekday>` XML structure
- N/llm model family: `llm.ModelFamily.COHERE_COMMAND` (not COHERE_COMMAND_R_PLUS)
- Phone Call record type: `record.Type.PHONE_CALL` enum, not string `'phonecall'`

## N/crypto & JWT (Phase 2 Research)
- `crypto.createSecretKey({ secret })` — `secret` is a script ID from API Secrets (`custsecret_*`), NOT a plain text string
- `crypto.createHmac().digest()` returns a plain string — use this over `N/https.createSecureString()` when you need readable output
- `N/https.createSecureString().hmac()` returns opaque SecureString — good for server-to-server HTTP headers, unusable for client-side
- `encode.Encoding.BASE_64_URL_SAFE` exists — no need for manual `+`→`-`, `/`→`_` conversion
- Always strip `=` padding and `\n`/`\r` from base64url output (N/encode may insert MIME line breaks)
- Twilio JWT `cty: "twilio-fpa;v=1"` header is mandatory — without it, token silently fails
- Twilio JWT `nbf` claim is optional — omit to avoid clock-skew issues
- Twilio grants use underscore: `application_sid` not `applicationSid`

## Linting & Testing (Phase 3)
- `suitescript/no-log-module` rule says use global `log`, but global `log` doesn't exist in Jest test environment
- Fix: keep `N/log` import + `// eslint-disable-next-line suitescript/no-log-module` — works in both SuiteScript runtime and Jest

## Suitelet HTML Embedding (Phase 4)
- Two escaping contexts when embedding values in Suitelet HTML: HTML context (title, display text) and JS context (inside `<script>` string literals)
- HTML context: use standard `escapeHtml()` — `&` → `&amp;`, `<` → `&lt;`, etc.
- JS context: use `escapeJs()` — escape `\`, `'`, and use `\x3c`/`\x3e` for `<`/`>` to prevent script tag breakout
- Do NOT use `escapeHtml()` for JS string values — `&amp;` in a fetch URL will break the HTTP request
- `N/url.resolveScript({ returnExternalUrl: true })` returns full `https://...restlets.api.netsuite.com/...` URL — required for same-origin fetch from popup

## SDF Deployment (First Deploy)
- SuiteApp manifests REQUIRE `<projectversion>1.0.0</projectversion>` — ACP projects don't need this
- M2M auth: `.env` files aren't auto-loaded — must `export SUITECLOUD_CI=1` and `export SUITECLOUD_CI_PASSKEY=...` before CLI commands
- If `credentials_ci.p12` is encrypted with a stale passkey, delete it and re-run `account:setup:ci`
- The `--privatekeypath` flag expects PEM format, not PKCS12 (.p12)
- SuiteApp `deploy.xml` needs BOTH `<files>` and `<objects>` sections — without `<objects>`, scripts upload but no custom objects are created
- `FREEFORMTEXT` is NOT a valid SDF field type — use `CLOBTEXT` instead
- `<includename>` on custom records must be `T` or `F`, not a display string
- Scheduled Script deployment status: use `SCHEDULED` (not `RELEASED`)
- `<title>` is required on scheduledscript deployments but "not supported" (ignored) on clientscript deployments — SDF inconsistency

## Post-Deploy Runtime Issues
- `returnExternalUrl: true` on `url.resolveScript()` returns a cross-origin URL (`restlets.api.netsuite.com`) — causes CORS failure when fetched from Suitelet popup at `app.netsuite.com`. Use `returnExternalUrl: false` for same-origin requests.
- NetSuite field label DOM IDs differ between view and edit mode — use multiple selector strategies (`_fs_lbl_uir_label`, `_val`, `querySelector('label[for=...]')`) to support both

## CSS Override Patterns
- `element.style.display = ''` does NOT override a CSS class `display: none` — it only removes the inline style, so the class rule still applies
- Use `element.style.display = 'block'` (or appropriate value) to explicitly override class-level `display: none`
- General rule: setting inline style to empty string reverts to stylesheet rules; setting to a value overrides them

## NetSuite TEXTAREA Storage
- NetSuite converts `\n` → `<br>` when storing TEXTAREA/CLOBTEXT values
- `getValue()` returns `<br>`-separated text, not `\n`-separated
- Always split on both: `text.split(/\n|<br\s*\/?>/).filter(Boolean)` to handle fresh and stored data

## INLINEHTML Scroll vs Collapse
- Don't combine `display: none` collapse with `max-height` scroll containers — they fight each other
- If container has `max-height + overflow-y: auto` but children are hidden, container never overflows → no scroll
- Pick one: either collapse/expand toggle OR always-render with scrollable container

## INLINEHTML Field Positioning
- `form.addField()` always appends to the end of the main body tab
- `field.updateLayoutType({ layoutType: 'OUTSIDEABOVE' })` is the official API to position above field groups — works on some UE-decorated forms
- DOM fallback: inject `<script>` that moves `el.closest('tr')` to `tbody.firstChild` for reliable positioning
- `N/ui/serverWidget` must be in `define()` dependencies to access `FieldLayoutType` and `FieldBreakType` enums
