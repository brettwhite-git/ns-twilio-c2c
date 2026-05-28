# NetSuite Click-to-Call with AI Call Analysis

[![SuiteScript 2.1](https://img.shields.io/badge/SuiteScript-2.1-002E5F?logo=oracle&logoColor=white)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4387172221.html)
[![Twilio Voice SDK](https://img.shields.io/badge/Twilio_Voice_SDK-2.x-F22F46?logo=twilio&logoColor=white)](https://www.twilio.com/docs/voice/sdks/javascript)
[![UIF v9](https://img.shields.io/badge/NetSuite_UIF-v9-00A1E0)](https://www.npmjs.com/package/@oracle/netsuite-uif-types)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Jest](https://img.shields.io/badge/Jest-29-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![SDF SuiteApp](https://img.shields.io/badge/SDF-SuiteApp-00A1E0)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1558708800.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A NetSuite SuiteApp that adds browser-to-phone calling directly from CRM
records. Sales reps click a phone icon on Customer, Contact, or Lead records;
a softphone popup opens; calls place via Twilio. Recordings transcribe
automatically and are analyzed by NetSuite's N/llm module to produce Phone
Call activity records with AI summaries, satisfaction scores, tone keywords,
and action items.

**Zero external hosting required** — every script runs on NetSuite
SuiteScript 2.1; everything else is Twilio's managed platform. No middleware,
no Node.js server, no external services.

## Features

- **One-click calling** from Customer, Contact, and Lead records
- **Softphone popup** — dial, mute, hold, contact-info side panel
- **Sales Rep Central portlet** — recent calls + rollups at-a-glance
- **Setup Wizard SPA** — UIF-based 5-step onboarding + multi-section Admin Console
- **Automatic recording** with two-party consent disclosure
- **AI transcription + analysis** — Twilio Conversational Intelligence + N/llm (Cohere Command A)
- **Phone Call activity records** with full transcript, summary, score, tone keywords, action items
- **Recording cleanup** — Twilio recordings auto-deleted after transcript extraction
- **Multi-role support** — Admin + Sales Rep custom roles

## How It Works

```
CALL FLOW (synchronous)
    User Event (phone icon)
            │
    Suitelet (softphone popup HTML + Twilio Voice JS SDK 2.x)
            │
    RESTlet (mints Twilio JWT via N/crypto HMAC-SHA256)
            │
    Browser  ───  Twilio Voice  ───  PSTN

ENRICHMENT (async, polled every 15 min)
    Scheduled Script
            │
    Twilio Recordings API + Conversational Intelligence
            │
    N/llm (Cohere Command A)
            │
    Phone Call record updated with transcript + AI fields
            │
    Twilio recording deleted (cost containment)
```

## Architecture

| Layer | Technology |
|-------|-----------|
| **Phone icon injection** | UserEvent Script (beforeLoad on Customer/Contact/Lead) |
| **Softphone UI** | Suitelet-served HTML + Twilio Voice JS SDK 2.7.3 |
| **Setup wizard + admin console** | UIF SPA (`@uif-js/core` + `@uif-js/component`) |
| **Auth** | RESTlet mints Twilio JWTs using N/crypto HMAC-SHA256 |
| **Transcription** | Twilio Conversational Intelligence (async, $0.035/min) |
| **AI analysis** | N/llm (Cohere Command A, free tier ~1000 req/mo) |
| **Polling** | Scheduled Script every 15 min on weekdays |
| **Sales Rep dashboard** | Portlet (Sales Rep Central) |
| **Packaging** | SDF SuiteApp (`com.netsuite.clicktocall`) |

## Project Structure

```
src/
├── FileCabinet/SuiteApps/com.netsuite.clicktocall/
│   ├── ctc_pl_dashboard.js              Portlet — Sales Rep Central
│   ├── ctc_rl_token.js                  RESTlet — JWT mint + softphone actions
│   ├── ctc_sl_softphone.js              Suitelet — softphone popup HTML
│   ├── ctc_sl_wizard_api.js             Suitelet — setup wizard JSON API
│   ├── ctc_ss_poll_transcripts.js       Scheduled Script — poll Twilio
│   ├── ctc_ue_phone_button.js           UserEvent — phone icon
│   ├── ctc_ue_transcript_viewer.js      UserEvent — Call Intelligence panel
│   ├── lib/                             Shared SuiteScript modules + Twilio SDK
│   └── setup_wizard/                    SPA bundle output (generated, see below)
│       ├── SpaClient.js
│       └── SpaServer.js
├── SuiteApps/com.netsuite.clicktocall/
│   └── setup_wizard/                    SPA TypeScript source
│       ├── SpaClient.ts                 Entry point
│       ├── SpaServer.ts                 Server endpoints
│       ├── sections/                    Admin Console sections (overview/phones/voice/...)
│       ├── steps/                       Onboarding wizard step forms
│       └── render/                      Shared render primitives
├── Objects/
│   ├── Records/                         customrecord_*.xml
│   ├── Scripts/                         customscript_*.xml + custspa_*.xml
│   ├── Fields/                          custevent_*.xml (Phone Call CRM fields)
│   └── Lists/                           customlist_*.xml
├── manifest.xml
└── deploy.xml
```

## Prerequisites

- NetSuite account with SuiteScript 2.1, SDF, and UIF (2025.1+)
- Twilio account with:
  - Voice-capable phone number
  - API Key + Secret
  - TwiML App pointing to a TwiML Bin
  - Conversational Intelligence service enabled
- Node.js 20+ (for local development, testing, and the bundle pipeline)
- `@oracle/suitecloud-cli` configured with M2M auth (see Deploy below)

## Setup

```bash
npm install
npm test           # 524 jest tests
npm run lint       # eslint-plugin-suitescript
npm run typecheck  # tsc --noEmit (TS source validation)
npm run bundle     # gulp + rollup — regenerate SPA bundle from TS source
```

## Deploy

```bash
# Set up M2M credentials once (one-time per machine):
suitecloud account:setup:ci --account <accountId> --authid <id> \
    --certificateid <certId> --privatekeypath ./private-key.pem

# Deploy (bundles SPA + pushes to NetSuite):
npm run deploy
```

The `npm run deploy` script chains `gulp bundle` (TS → AMD JS) then
`suitecloud project:deploy`. The SPA bundle output (`SpaClient.js`,
`SpaServer.js`) is committed to git alongside its TypeScript source so a
fresh `git clone` + `npm run deploy` works without an extra bundle step.

### NetSuite Configuration

After first deploy:

1. **CTC Configuration record** — create a singleton instance with Twilio credentials (Account SID, API Key SID, API Secret pointer)
2. **API Secret** — store the Twilio API Key Secret value as a `custsecret_*` NetSuite API Secret; reference its script ID in the config record
3. **Setup Wizard** — admins open the Setup Wizard SPA from the Click-to-Call deployment to complete configuration

## Testing

```bash
npm test                  # 524 tests across 15 suites
npm test -- --watch       # watch mode
```

Tests use `@oracle/suitecloud-unit-testing` for SuiteScript module stubs, plus
a custom `N/llm` mock at `__mocks__/llm.js`.

## CI

GitHub Actions runs on every PR + push to main:
- ESLint (`eslint-plugin-suitescript`)
- TypeScript typecheck (`tsc --noEmit`)
- Jest (524 tests)
- Bundle drift gate (regenerates SPA and fails if committed bundle is stale)

See `.github/workflows/ci.yml`.

## Cost Estimate

For 10 reps making ~20 calls/day (5 min avg):

| Component | Monthly |
|---|---|
| Twilio Phone Number | $1.15 |
| Outbound Voice | $42.00 |
| Recording Storage | $1.50 |
| Conversational Intelligence | $105.00 |
| N/llm (free tier) | $0.00 |
| **Total** | **~$150/mo** |

## License

[MIT](LICENSE)
