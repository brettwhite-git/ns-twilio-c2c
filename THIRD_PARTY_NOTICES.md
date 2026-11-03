# Third-party notices

The Click-to-Call SuiteApp (`com.netsuite.clicktocall`) ships these
third-party files in the File Cabinet. Nothing else from outside is bundled.
NetSuite supplies the UIF libraries (`@uif-js/*`) used by the Setup Wizard at
run time.

| Component | Version | Licence | Shipped file | Licence copy | Source |
|---|---|---|---|---|---|
| Twilio Voice JavaScript SDK (`@twilio/voice-sdk`) | 2.7.3 | Apache-2.0 (includes rtcpeerconnection-shim, BSD-3-Clause, and backoff, MIT) | `lib/twilio.min.js` | `lib/TWILIO-VOICE-SDK-LICENSE.txt` | https://github.com/twilio/twilio-voice.js/tree/2.7.3 |
| Figtree font (variable, Latin) | — | SIL Open Font License 1.1 | `lib/fonts/figtree-latin-wght-normal.woff2` | `lib/fonts/FIGTREE-OFL.txt` | https://github.com/erikdkennedy/figtree |

Paths are relative to `src/FileCabinet/SuiteApps/com.netsuite.clicktocall/`.

`lib/twilio.min.js` SHA-256:
`31a261615947affd014fb43a80e3acb33298967b9e41dd5093a0f0bfb0182b5f`

Update this file, the licence copy and the hash whenever the SDK is upgraded.
