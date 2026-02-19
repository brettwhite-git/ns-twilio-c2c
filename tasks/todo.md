# Click-to-Call MVP — Task Tracker

## Phase 0: SDF Project Scaffold
- [x] Update manifest.xml with dependencies
- [x] Tighten deploy.xml paths
- [x] Create directory structure & placeholder files
- [x] Install dev dependencies (jest, eslint, suitecloud-unit-testing)
- [x] Create jest.config.js
- [x] Create .eslintrc.json
- [x] Create tasks/todo.md & tasks/lessons.md
- [x] Add npm scripts (test, lint)
- [x] Verify: npm test runs clean
- [x] Verify: npm run lint runs clean

## Phase 1: SDF Custom Objects
- [x] customrecord_ctc_config.xml (7 fields)
- [x] custevent_ctc_recording_sid.xml
- [x] custevent_ctc_recording_url.xml
- [x] custevent_ctc_duration.xml
- [x] custevent_ctc_transcript.xml
- [x] custevent_ctc_ai_summary.xml
- [x] custevent_ctc_satisfaction.xml
- [x] custevent_ctc_tone_keywords.xml
- [x] custevent_ctc_action_items.xml
- [x] custevent_ctc_processed.xml

## Phase 2: JWT Library Module
- [x] lib/ctc_twilio_jwt.js (N/crypto approach — plain string output)
- [x] __tests__/ctc_twilio_jwt.test.js (13 tests passing)
- [x] Updated customrecord_ctc_config.xml (custrecord_ctc_api_secret_id replaces custrecord_ctc_api_key_secret)
- [ ] Verify: JWT decodes correctly at jwt.io (requires NetSuite deployment)

## Phase 3: RESTlet Token Generator
- [x] ctc_rl_token.js
- [x] customscript_ctc_rl_token.xml
- [x] __tests__/ctc_rl_token.test.js (10 tests passing)

## Phase 4: Suitelet Softphone UI
- [x] ctc_sl_softphone.js
- [x] customscript_ctc_sl_softphone.xml
- [x] __tests__/ctc_sl_softphone.test.js (15 tests passing)

## Phase 5: Client Script Button Injection
- [x] ctc_cl_phone_button.js
- [x] customscript_ctc_cl_phone_button.xml (3 deployments: Customer, Contact, Lead)
- [x] __tests__/ctc_cl_phone_button.test.js (19 tests passing)

## Phase 6: Scheduled Script Poll
- [x] ctc_ss_poll_transcripts.js
- [x] customscript_ctc_ss_poll.xml
- [x] __tests__/ctc_ss_poll_transcripts.test.js (23 tests passing)
