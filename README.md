# NetSuite Click-to-Call with AI Call Analysis

[![SuiteScript 2.1](https://img.shields.io/badge/SuiteScript-2.1-002E5F?logo=oracle&logoColor=white)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_4387172221.html)
[![Twilio Voice SDK](https://img.shields.io/badge/Twilio_Voice_SDK-2.x-F22F46?logo=twilio&logoColor=white)](https://www.twilio.com/docs/voice/sdks/javascript)
[![Jest](https://img.shields.io/badge/Jest-29-C21325?logo=jest&logoColor=white)](https://jestjs.io/)
[![ESLint](https://img.shields.io/badge/ESLint-8-4B32C3?logo=eslint&logoColor=white)](https://eslint.org/)
[![SDF SuiteApp](https://img.shields.io/badge/SDF-SuiteApp-00A1E0)](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/chapter_1558708800.html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A NetSuite SuiteApp that adds browser-to-phone calling directly from CRM records. Sales reps click a phone icon on Customer, Contact, or Lead records, a softphone popup opens, and the call is placed via Twilio. After the call, recordings are automatically transcribed and analyzed by AI to produce structured Phone Call activity records with summaries, satisfaction scores, and action items.

**Zero external hosting required** — everything runs on NetSuite SuiteScript + Twilio's managed platform.

## How It Works

```
CALL INITIATION
Customer Record  -->  Client Script  -->  Popup  -->  Suitelet HTML  -->  RESTlet (JWT)
                                                           |
                                                     Twilio Voice SDK
                                                           |
                                                  Browser <-> Twilio <-> PSTN

POST-CALL (async, 5-15 min)
Scheduled Script  -->  Twilio Recordings API  -->  Conversational Intelligence
                            |
                       N/llm AI Analysis
                            |
                       Phone Call Record (with transcript, summary, score)
                            |
                       Delete Recording from Twilio
```

## Features

- **One-click calling** from Customer, Contact, and Lead records
- **Softphone popup** with dial, hang up, and mute controls
- **Automatic recording** with two-party consent disclosure
- **AI-powered transcription** via Twilio Conversational Intelligence
- **Call analysis** using NetSuite N/llm — generates summaries, satisfaction scores (1-10), tone keywords, and action items
- **Phone Call activity records** with full transcript and AI insights
- **Recording cleanup** — Twilio recordings are deleted after transcript extraction
- **Installable SuiteApp** — clean install/uninstall via SDF

## Architecture

| Layer | Technology |
|-------|-----------|
| **CRM Integration** | SuiteScript 2.1 Client Script (button injection) |
| **Softphone UI** | Suitelet-served HTML + Twilio Voice JS SDK 2.x |
| **Auth** | RESTlet generates Twilio JWTs using N/crypto HMAC-SHA256 |
| **Transcription** | Twilio Conversational Intelligence (async, $0.035/min) |
| **AI Analysis** | N/llm module (Cohere Command, free tier) |
| **Polling** | Scheduled Script every 15 min on weekdays |
| **Packaging** | SDF SuiteApp (`com.netsuite.clicktocall`) |

## Project Structure

```
src/
├── FileCabinet/SuiteApps/com.netsuite.clicktocall/
│   └── click_to_call/
│       ├── ctc_cl_phone_button.js         # Client Script — button injection
│       ├── ctc_sl_softphone.js            # Suitelet — softphone popup HTML
│       ├── ctc_rl_token.js                # RESTlet — JWT token generation
│       ├── ctc_ss_poll_transcripts.js     # Scheduled Script — poll & analyze
│       └── lib/
│           └── ctc_twilio_jwt.js          # JWT library (N/crypto)
├── Objects/                               # SDF XML definitions
├── manifest.xml
└── deploy.xml
```

## Prerequisites

- NetSuite account with SuiteScript 2.1 and SDF enabled
- Twilio account with:
  - Phone number (Voice-capable)
  - API Key + Secret
  - TwiML App (pointing to a TwiML Bin with `<Dial record="record-from-answer-dual">`)
  - Conversational Intelligence service enabled
- Node.js 18+ (for local development/testing)

## Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint
```

### Twilio Configuration

1. **Purchase a phone number** with Voice capability
2. **Create an API Key** (Standard) — save the SID and Secret
3. **Create a TwiML Bin** with call recording and consent disclosure
4. **Create a TwiML App** pointing to the TwiML Bin URL
5. **Enable Conversational Intelligence** with auto-transcribe

### NetSuite Configuration

1. Deploy the SuiteApp via SDF (`suitecloud project:deploy`)
2. Create a **CTC Configuration** record with your Twilio credentials
3. Store the API Key Secret in **NetSuite API Secrets** (`custsecret_*`)

## Testing

```bash
npm test        # 80 tests across 5 test suites
npm run lint    # ESLint with suitescript/recommended rules
```

Tests use `@oracle/suitecloud-unit-testing` for SuiteScript module stubs with a custom `N/llm` mock.

## Cost Estimate

For 10 reps making ~20 calls/day (5 min avg):

| Component | Monthly |
|-----------|---------|
| Twilio Phone Number | $1.15 |
| Outbound Voice | $42.00 |
| Recording Storage | $1.50 |
| Conversational Intelligence | $105.00 |
| N/llm (free tier) | $0.00 |
| **Total** | **~$150/mo** |

## License

[MIT](LICENSE)
