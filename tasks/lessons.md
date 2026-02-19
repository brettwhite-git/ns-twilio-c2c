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
