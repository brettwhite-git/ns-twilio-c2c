> **ARCHIVED — historical MVP planning.** This document describes the original ACP-based scaffold and is no longer source of truth for implementation. Many specifics (project type, file paths, secret storage, codec preferences, RESTlet URL resolution, call lifecycle) have since diverged from the shipped SuiteApp.
> - Current architecture and roadmap: see [`ARCHITECTURE.md`](./ARCHITECTURE.md)
> - Current task tracker: see [`tasks/todo.md`](./tasks/todo.md)
> - Up-to-date conventions and gotchas: see [`AGENTS.md`](./AGENTS.md) and [`CLAUDE.md`](./CLAUDE.md)

# BUILD PLAN — NetSuite Click-to-Call MVP (HISTORICAL)

This document was the single source of truth for the original MVP build. It is preserved for historical context only. Do not use it as a build reference.

---

## Phase 0: SDF Project Scaffold

### manifest.xml

```xml
<manifest projecttype="ACCOUNTCUSTOMIZATION">
    <projectname>ClickToCall</projectname>
    <frameworkversion>1.0</frameworkversion>
    <dependencies>
        <features>
            <feature required="true">SERVERSIDESCRIPTING</feature>
            <feature required="true">CUSTOMRECORDS</feature>
        </features>
    </dependencies>
</manifest>
```

### deploy.xml

```xml
<deploy>
    <configuration>
        <path>~/Objects/*</path>
    </configuration>
    <files>
        <path>~/FileCabinet/SuiteScripts/click_to_call/*</path>
    </files>
</deploy>
```

### Directory Structure

Create all directories and empty files first:

```
mkdir -p src/FileCabinet/SuiteScripts/click_to_call/lib
mkdir -p src/Objects
touch src/manifest.xml
touch src/deploy.xml
touch src/FileCabinet/SuiteScripts/click_to_call/ctc_cl_phone_button.js
touch src/FileCabinet/SuiteScripts/click_to_call/ctc_sl_softphone.js
touch src/FileCabinet/SuiteScripts/click_to_call/ctc_rl_token.js
touch src/FileCabinet/SuiteScripts/click_to_call/ctc_ss_poll_transcripts.js
touch src/FileCabinet/SuiteScripts/click_to_call/lib/ctc_twilio_jwt.js
```

---

## Phase 1: SDF Custom Objects

Build ALL custom objects before any scripts. Scripts reference these field IDs.

### 1A. Config Record — `customrecord_ctc_config`

Single-row record storing Twilio API credentials. Restricted to Administrator role.

**File:** `src/Objects/customrecord_ctc_config.xml`

```xml
<customrecordtype scriptid="customrecord_ctc_config">
    <recordname>CTC Configuration</recordname>
    <includename>CTC Configuration</includename>
    <accesstype>USEPERMISSIONLIST</accesstype>
    <allowattachments>F</allowattachments>
    <allowinlinedeleting>F</allowinlinedeleting>
    <allowinlineinsert>F</allowinlineinsert>
    <allowquickadd>F</allowquickadd>
    <allowquicksearch>F</allowquicksearch>
    <enablemailmerge>F</enablemailmerge>
    <enablenumbering>F</enablenumbering>
    <enablesystemnotes>T</enablesystemnotes>
    <isinactive>F</isinactive>
    <numberingprefix></numberingprefix>
    <permissions>
        <permission>
            <permittedrole>ADMINISTRATOR</permittedrole>
            <permittedlevel>FULL</permittedlevel>
            <restriction>EDIT</restriction>
        </permission>
    </permissions>
    <customrecordcustomfields>
        <customrecordcustomfield scriptid="custrecord_ctc_account_sid">
            <label>Account SID</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_auth_token">
            <label>Auth Token</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_api_key_sid">
            <label>API Key SID</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_api_key_secret">
            <label>API Key Secret</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_twiml_app_sid">
            <label>TwiML App SID</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_phone_number">
            <label>Caller ID Number</label>
            <fieldtype>PHONE</fieldtype>
            <ismandatory>T</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
        <customrecordcustomfield scriptid="custrecord_ctc_intel_service_sid">
            <label>Intelligence Service SID</label>
            <fieldtype>FREEFORMTEXT</fieldtype>
            <ismandatory>F</ismandatory>
            <displaytype>NORMAL</displaytype>
        </customrecordcustomfield>
    </customrecordcustomfields>
</customrecordtype>
```

### 1B. Phone Call Custom Fields

These are CRM event fields on the native Phone Call record type. Each field is a separate XML file. CRM activity records (Phone Call, Task, Event) use `crmcustomfield` with `custevent_` prefix, NOT `custombodyfield`/`custbody_`.

**File:** `src/Objects/custevent_ctc_recording_sid.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_recording_sid">
    <label>Recording SID</label>
    <fieldtype>FREEFORMTEXT</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_recording_url.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_recording_url">
    <label>Recording URL</label>
    <fieldtype>URL</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_duration.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_duration">
    <label>Duration (seconds)</label>
    <fieldtype>INTEGER</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_transcript.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_transcript">
    <label>Full Transcript</label>
    <fieldtype>TEXTAREA</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>1</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_ai_summary.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_ai_summary">
    <label>AI Summary</label>
    <fieldtype>TEXTAREA</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_satisfaction.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_satisfaction">
    <label>Satisfaction Score</label>
    <fieldtype>INTEGER</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_tone_keywords.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_tone_keywords">
    <label>Tone Keywords</label>
    <fieldtype>FREEFORMTEXT</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_action_items.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_action_items">
    <label>Action Items</label>
    <fieldtype>TEXTAREA</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <searchlevel>1</searchlevel>
</crmcustomfield>
```

**File:** `src/Objects/custevent_ctc_processed.xml`
```xml
<crmcustomfield scriptid="custevent_ctc_processed">
    <label>AI Processed</label>
    <fieldtype>CHECKBOX</fieldtype>
    <appliestophonecall>T</appliestophonecall>
    <displaytype>NORMAL</displaytype>
    <ismandatory>F</ismandatory>
    <defaultchecked>F</defaultchecked>
    <searchlevel>2</searchlevel>
</crmcustomfield>
```

---

## Phase 2: JWT Library Module

### Spec: `lib/ctc_twilio_jwt.js`

**File:** `src/FileCabinet/SuiteScripts/click_to_call/lib/ctc_twilio_jwt.js`

**Type:** AMD module (not a script record — loaded via `define` by other scripts)

**No SDF deployment XML needed** — this is a library, not a deployed script.

#### Exports

```
generateAccessToken(options) → string (JWT)
```

**Parameters:**
```javascript
options = {
    accountSid:   string,  // Twilio Account SID (AC...)
    apiKeySid:    string,  // Twilio API Key SID (SK...)
    apiKeySecret: string,  // Twilio API Key Secret
    twimlAppSid:  string,  // TwiML Application SID (AP...)
    identity:     string,  // User identity (employee ID or username)
    ttl:          number   // Token lifetime in seconds (default 3600)
}
```

**Returns:** JWT string in format `header.payload.signature`

#### Dependencies

- `N/crypto` — HMAC-SHA256 signing
- `N/encode` — base64 encoding

#### Algorithm

1. Build header object: `{ typ: "JWT", alg: "HS256", cty: "twilio-fpa;v=1" }`
2. Build payload object:
   ```javascript
   {
       jti: apiKeySid + '-' + Math.floor(Date.now() / 1000),
       iss: apiKeySid,
       sub: accountSid,
       iat: now,
       nbf: now,
       exp: now + ttl,
       grants: {
           identity: identity,
           voice: {
               outgoing: { application_sid: twimlAppSid },
               incoming: { allow: false }
           }
       }
   }
   ```
3. JSON.stringify header → base64url encode → `encodedHeader`
4. JSON.stringify payload → base64url encode → `encodedPayload`
5. Concatenate: `signingInput = encodedHeader + '.' + encodedPayload`
6. Create HMAC-SHA256:
   - Create secret key from `apiKeySecret` using `crypto.createSecretKey()`
   - Create HMAC with `crypto.createHmac({ algorithm: crypto.HashAlg.SHA256, key })`
   - Update with `signingInput` (UTF-8 encoding)
   - Digest to base64
7. Convert signature from standard base64 → base64url
8. Return `signingInput + '.' + base64urlSignature`

#### base64url Conversion

Standard base64 → base64url (RFC 7515):
- Replace `+` with `-`
- Replace `/` with `_`
- Strip trailing `=` characters
- **Strip any `\n` or `\r` characters** (N/encode may insert line breaks in long output)

#### Critical Constraints

- The `cty` header field MUST be `"twilio-fpa;v=1"`. Without this, Twilio silently rejects the token with "Invalid Access Token".
- Timestamp: `Math.floor(Date.now() / 1000)`. If NetSuite server clock is skewed >2 minutes, the `nbf` claim will cause rejection.
- The grants object structure must be exact. `voice.outgoing.application_sid` (underscore, not camelCase).
- N/encode may insert line breaks (`\n`) in base64 output for strings longer than 76 characters. These MUST be stripped before base64url conversion.

#### Verification

Generate a token with this module → decode at https://jwt.io → verify:
1. Header has all three fields: `typ`, `alg`, `cty`
2. Payload `iss` matches your API Key SID
3. Payload `sub` matches your Account SID
4. Payload `grants.voice.outgoing.application_sid` matches your TwiML App SID
5. Signature validates when you paste the API Key Secret into jwt.io's verify box

**Fallback:** If token validation fails after debugging, replace this module's usage with a Twilio Function. See FALLBACK section at end of document.

---

## Phase 3: RESTlet Token Generator

### Spec: `ctc_rl_token.js`

**File:** `src/FileCabinet/SuiteScripts/click_to_call/ctc_rl_token.js`

**Type:** RESTlet

**Deployment XML:** `src/Objects/customscript_ctc_rl_token.xml`

#### Script Record XML

```xml
<restlet scriptid="customscript_ctc_rl_token">
    <name>CTC Token Generator</name>
    <scriptfile>[/SuiteScripts/click_to_call/ctc_rl_token.js]</scriptfile>
    <notifyadmins>F</notifyadmins>
    <notifyemails></notifyemails>
    <notifyowner>T</notifyowner>
    <notifyuser>F</notifyuser>
    <status>RELEASED</status>
    <isinactive>F</isinactive>
    <loglevel>DEBUG</loglevel>
    <scriptdeployments>
        <scriptdeployment scriptid="customdeploy_ctc_rl_token">
            <title>CTC Token Generator</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <allroles>T</allroles>
        </scriptdeployment>
    </scriptdeployments>
</restlet>
```

#### Entry Points

```
POST → post(requestBody) → { token: string }
```

#### Input Contract

```json
{
    "employeeId": "string (optional, defaults to current user runtime.getCurrentUser().id)"
}
```

#### Output Contract

```json
{
    "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### Dependencies

- `./lib/ctc_twilio_jwt` — JWT construction
- `N/search` — load config record
- `N/runtime` — get current user ID
- `N/log` — error logging

#### Logic

1. Extract `employeeId` from request body. If not provided, use `runtime.getCurrentUser().id`.
2. Load config from `customrecord_ctc_config` (search for first active record).
3. Call `twilioJwt.generateAccessToken()` with config values + identity.
4. Return `{ token: jwt }`.

#### Config Loading Pattern

Used by both the RESTlet and Scheduled Script. Extract to shared function or duplicate (simpler for MVP):

```javascript
function loadConfig() {
    const results = search.create({
        type: 'customrecord_ctc_config',
        filters: [['isinactive', 'is', 'F']],
        columns: [
            'custrecord_ctc_account_sid',
            'custrecord_ctc_auth_token',
            'custrecord_ctc_api_key_sid',
            'custrecord_ctc_api_key_secret',
            'custrecord_ctc_twiml_app_sid',
            'custrecord_ctc_phone_number',
            'custrecord_ctc_intel_service_sid'
        ]
    }).run().getRange({ start: 0, end: 1 });

    if (!results.length) throw new Error('CTC config record not found or inactive');

    const r = results[0];
    return {
        accountSid:      r.getValue('custrecord_ctc_account_sid'),
        authToken:       r.getValue('custrecord_ctc_auth_token'),
        apiKeySid:       r.getValue('custrecord_ctc_api_key_sid'),
        apiKeySecret:    r.getValue('custrecord_ctc_api_key_secret'),
        twimlAppSid:     r.getValue('custrecord_ctc_twiml_app_sid'),
        phoneNumber:     r.getValue('custrecord_ctc_phone_number'),
        intelServiceSid: r.getValue('custrecord_ctc_intel_service_sid')
    };
}
```

#### Governance Budget

- search.create + run + getRange: ~10 units
- JWT construction (N/crypto): ~20 units
- Total per request: ~30 units (well within 5,000 limit)

#### Error Handling

- Config not found → return `{ error: 'Configuration not found' }` with HTTP 500
- JWT construction fails → log error, return `{ error: 'Token generation failed' }`

---

## Phase 4: Suitelet Softphone UI

### Spec: `ctc_sl_softphone.js`

**File:** `src/FileCabinet/SuiteScripts/click_to_call/ctc_sl_softphone.js`

**Type:** Suitelet

**Deployment XML:** `src/Objects/customscript_ctc_sl_softphone.xml`

#### Script Record XML

```xml
<suitelet scriptid="customscript_ctc_sl_softphone">
    <name>CTC Softphone</name>
    <scriptfile>[/SuiteScripts/click_to_call/ctc_sl_softphone.js]</scriptfile>
    <notifyadmins>F</notifyadmins>
    <notifyowner>T</notifyowner>
    <status>RELEASED</status>
    <isinactive>F</isinactive>
    <loglevel>DEBUG</loglevel>
    <scriptdeployments>
        <scriptdeployment scriptid="customdeploy_ctc_sl_softphone">
            <title>CTC Softphone</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <allroles>T</allroles>
            <isonline>F</isonline>
        </scriptdeployment>
    </scriptdeployments>
</suitelet>
```

#### Entry Points

```
GET → onRequest(context)
```

Responds with a full HTML page (not a NetSuite form). Uses `context.response.write()`.

#### URL Parameters

| Param | Type | Description |
|-------|------|-------------|
| `phone` | string | Phone number to dial (E.164 format preferred) |
| `entityId` | string | NetSuite internal ID of Customer/Contact/Lead |
| `entityName` | string | Display name for UI header |

#### Dependencies

- `N/url` — resolve RESTlet URL for token endpoint
- `N/runtime` — get current user for identity

#### What the HTML Page Must Do

1. **Load Twilio Voice SDK 2.x** from CDN: `https://sdk.twilio.com/js/client/releases/2.7.3/twilio.min.js`
2. **On page load:**
   - Fetch token from RESTlet via `fetch()` (POST, same-origin, JSON body with employeeId)
   - Initialize `Twilio.Device` with token
   - Register event handlers: `registered`, `error`, `incoming` (ignore for MVP)
3. **Call button click:**
   - `device.connect({ params: { To: phoneNumber } })` — `params.To` is what the TwiML Bin receives as `{{To}}`
4. **During call:**
   - Display timer (seconds elapsed)
   - Mute/unmute via `call.mute(true/false)`
   - Status updates from call events: `accept`, `disconnect`, `error`, `ringing`
5. **Hang up button:**
   - `call.disconnect()` or `device.disconnectAll()`

#### Twilio Voice SDK 2.x API Notes

SDK 2.x has breaking changes from 1.x:

```javascript
// 2.x initialization
const device = new Twilio.Device(token, {
    codecPreferences: [Twilio.Device.Codec.Opus, Twilio.Device.Codec.PCMU],
    logLevel: 1
});
await device.register();

// 2.x event names
device.on('registered', () => { /* ready */ });
device.on('error', (twilioError) => { /* error.message */ });

// 2.x outbound call
const call = await device.connect({
    params: { To: phoneNumber }
});

call.on('accept', () => { /* call connected */ });
call.on('disconnect', () => { /* call ended */ });
call.on('ringing', () => { /* ringing */ });

// 2.x mute
call.mute(true);   // mute
call.mute(false);  // unmute
call.isMuted();    // check state

// 2.x hangup
call.disconnect();
```

#### UI Requirements

- Window size: 380×500 pixels (popup)
- Dark theme background (`#1a1a2e`)
- Display: entity name, phone number, status text, call timer (MM:SS), call/mute/hangup buttons
- Buttons: green call, orange mute (toggle), red hangup
- Disabled states: call button disabled during active call, mute/hangup disabled when idle
- No external CSS frameworks — inline styles only (the HTML is a single string in the Suitelet)

#### RESTlet Token Fetch

The Suitelet resolves the RESTlet URL server-side and embeds it in the HTML:

```javascript
const tokenEndpoint = url.resolveScript({
    scriptId: 'customscript_ctc_rl_token',
    deploymentId: 'customdeploy_ctc_rl_token',
    returnExternalUrl: true
});
```

Client-side JS uses `fetch(TOKEN_URL, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({}) })`.

**Important:** `returnExternalUrl: true` gives the full `https://...restlets.api.netsuite.com/...` URL. The fetch happens from the browser using the user's existing NetSuite session cookies. No additional auth headers needed because the Suitelet page is served from the same NetSuite domain.

#### Verification

1. Open the Suitelet URL directly in browser with `?phone=+15551234567&entityId=123&entityName=Test`
2. Status should progress: "Fetching token..." → "Ready to call"
3. Click Call → status shows "Ringing..." then "Connected" with timer counting
4. Mute toggles correctly
5. Hang up ends call, timer stops

---

## Phase 5: Client Script (Button Injection)

### Spec: `ctc_cl_phone_button.js`

**File:** `src/FileCabinet/SuiteScripts/click_to_call/ctc_cl_phone_button.js`

**Type:** Client Script

**Deployment XML:** `src/Objects/customscript_ctc_cl_phone_button.xml`

#### Script Record XML

```xml
<clientscript scriptid="customscript_ctc_cl_phone_button">
    <name>CTC Phone Button</name>
    <scriptfile>[/SuiteScripts/click_to_call/ctc_cl_phone_button.js]</scriptfile>
    <notifyadmins>F</notifyadmins>
    <notifyowner>T</notifyowner>
    <status>RELEASED</status>
    <isinactive>F</isinactive>
    <loglevel>DEBUG</loglevel>
    <scriptdeployments>
        <scriptdeployment scriptid="customdeploy_ctc_cl_phone_button_cust">
            <title>CTC Phone Button - Customer</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <allroles>T</allroles>
            <recordtype>CUSTOMER</recordtype>
        </scriptdeployment>
        <scriptdeployment scriptid="customdeploy_ctc_cl_phone_button_cont">
            <title>CTC Phone Button - Contact</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <allroles>T</allroles>
            <recordtype>CONTACT</recordtype>
        </scriptdeployment>
        <scriptdeployment scriptid="customdeploy_ctc_cl_phone_button_lead">
            <title>CTC Phone Button - Lead</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <allroles>T</allroles>
            <recordtype>LEAD</recordtype>
        </scriptdeployment>
    </scriptdeployments>
</clientscript>
```

#### Entry Points

```
pageInit(context) → void
```

#### Dependencies

- `N/currentRecord` — get phone field values and entity ID
- `N/url` — resolve Suitelet URL

#### Logic

1. On `pageInit`, read phone fields from current record:
   - `phone` (primary phone)
   - `altphone` (alternate phone)
   - For Contacts: also check `mobilephone`
2. For each non-empty phone field, inject a clickable 📞 icon next to the field label.
3. On icon click: open Suitelet softphone as popup window.

#### DOM Injection Strategy

Target the field's label container. NetSuite renders fields with predictable DOM IDs:
- Field label: `{fieldId}_fs_lbl_uir_label` or `{fieldId}_fs_lbl`
- Field container: `{fieldId}_fs`

Use defensive DOM traversal. If the expected element isn't found, log a warning and skip (don't break the page).

```javascript
function injectCallButton(fieldId, phoneNumber, entityId, entityName) {
    if (!phoneNumber) return;

    // Try multiple possible DOM targets
    const targets = [
        document.getElementById(fieldId + '_fs_lbl_uir_label'),
        document.getElementById(fieldId + '_fs_lbl'),
        document.getElementById(fieldId + '_fs')
    ];

    const target = targets.find(el => el !== null);
    if (!target) {
        console.warn('CTC: Could not find DOM target for field: ' + fieldId);
        return;
    }

    const btn = document.createElement('span');
    btn.innerHTML = '📞';
    btn.title = 'Click to call ' + phoneNumber;
    btn.style.cssText = 'cursor:pointer;font-size:16px;margin-left:6px;vertical-align:middle;';
    btn.setAttribute('data-ctc-btn', fieldId); // marker to prevent duplicates
    btn.onclick = (e) => {
        e.stopPropagation();
        openSoftphone(phoneNumber, entityId, entityName);
    };

    // Prevent duplicate injection on re-renders
    if (target.parentNode.querySelector('[data-ctc-btn="' + fieldId + '"]')) return;
    target.parentNode.appendChild(btn);
}
```

#### Popup Window

```javascript
function openSoftphone(phoneNumber, entityId, entityName) {
    const softphoneUrl = url.resolveScript({
        scriptId: 'customscript_ctc_sl_softphone',
        deploymentId: 'customdeploy_ctc_sl_softphone',
        params: {
            phone: phoneNumber,
            entityId: entityId,
            entityName: entityName
        }
    });

    window.open(
        softphoneUrl,
        'ctc_softphone',
        'width=380,height=500,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no'
    );
}
```

#### Entity Name Resolution

- Customer: `companyname` or `entityid`
- Contact: `firstname` + ' ' + `lastname`
- Lead: `companyname` or `firstname` + ' ' + `lastname`

Check record type via `context.currentRecord.type` and read appropriate fields.

#### Verification

1. Navigate to any Customer record with a phone number
2. Phone icon 📞 should appear next to the phone field
3. Click icon → popup window opens with Suitelet softphone
4. Phone number and entity name display correctly in the popup

---

## Phase 6: Scheduled Script (Poll + Transcribe + Analyze)

### Spec: `ctc_ss_poll_transcripts.js`

**File:** `src/FileCabinet/SuiteScripts/click_to_call/ctc_ss_poll_transcripts.js`

**Type:** Scheduled Script

**Deployment XML:** `src/Objects/customscript_ctc_ss_poll.xml`

#### Script Record XML

```xml
<scheduledscript scriptid="customscript_ctc_ss_poll">
    <name>CTC Poll Transcripts</name>
    <scriptfile>[/SuiteScripts/click_to_call/ctc_ss_poll_transcripts.js]</scriptfile>
    <notifyadmins>F</notifyadmins>
    <notifyowner>T</notifyowner>
    <status>RELEASED</status>
    <isinactive>F</isinactive>
    <loglevel>DEBUG</loglevel>
    <scriptdeployments>
        <scriptdeployment scriptid="customdeploy_ctc_ss_poll">
            <title>CTC Poll Transcripts</title>
            <isdeployed>T</isdeployed>
            <status>RELEASED</status>
            <loglevel>DEBUG</loglevel>
            <recurrence>
                <everyweekday>
                    <startdate>2024-01-01</startdate>
                    <starttime>00:00:00Z</starttime>
                    <repeat>PT15M</repeat>
                    <enddate>2099-12-31</enddate>
                </everyweekday>
            </recurrence>
        </scriptdeployment>
    </scriptdeployments>
</scheduledscript>
```

#### Entry Points

```
execute(context) → void
```

#### Dependencies

- `N/https` — Twilio REST API calls
- `N/record` — create Phone Call records
- `N/search` — load config, check for duplicates
- `N/llm` — AI analysis
- `N/encode` — base64 for Basic Auth
- `N/log` — structured logging

#### Processing Pipeline

For each execution cycle:

```
1. Load config from customrecord_ctc_config
2. Check N/llm free usage: llm.getRemainingFreeUsage()
   → If < 10 remaining, skip AI analysis (still create records with transcripts)
3. GET Twilio Recordings API: list recordings from last 30 minutes
4. For each recording:
   a. Check if recording.sid already exists in NetSuite (saved search on custevent_ctc_recording_sid)
      → If exists, skip
   b. GET Conversational Intelligence Transcripts API: filter by SourceSid = recording.sid
      → If no transcript or status != 'completed', skip (will retry next cycle)
   c. GET Transcript Sentences: fetch all sentences with speaker attribution
   d. Format transcript text with speaker labels: [REP] / [CUSTOMER]
   e. Call N/llm.generateText() with analysis prompt
   f. Create Phone Call record with all fields populated
   g. DELETE recording from Twilio (cleanup after processing)
5. Log summary: processed count, skipped count, errors
```

#### Twilio API Calls

**Authentication for all Twilio calls:**
```javascript
const auth = encode.convert({
    string: config.accountSid + ':' + config.authToken,
    inputEncoding: encode.Encoding.UTF_8,
    outputEncoding: encode.Encoding.BASE_64
});
const headers = { 'Authorization': 'Basic ' + auth };
```

**1. List Recent Recordings**
```
GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings.json
    ?DateCreated>={ISO8601_30min_ago}
    &PageSize=50
```
Response: `{ recordings: [{ sid, duration, date_created, call_sid, account_sid, ... }] }`

Governance: ~10 units per N/https.get

**2. List Transcripts for Recording**
```
GET https://intelligence.twilio.com/v2/Transcripts
    ?SourceSid={RecordingSid}
```
Response: `{ transcripts: [{ sid, status, source_sid, ... }] }`

Check `status === 'completed'` before proceeding.

Governance: ~10 units per N/https.get

**3. Fetch Transcript Sentences**
```
GET https://intelligence.twilio.com/v2/Transcripts/{TranscriptSid}/Sentences
```
Response: `{ sentences: [{ media_channel, transcript, ... }] }`

Format: `media_channel === 1` → REP (agent), `media_channel === 2` → CUSTOMER

Governance: ~10 units per N/https.get

**4. Delete Recording (cleanup)**
```
DELETE https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Recordings/{RecordingSid}.json
```

Governance: ~10 units per N/https.delete

#### N/llm Analysis

```javascript
const response = llm.generateText({
    prompt: analysisPrompt,
    modelFamily: llm.ModelFamily.COHERE_COMMAND,
    modelParameters: {
        temperature: 0.2,
        maxTokens: 800
    }
});
```

**Prompt:**
```
You are a sales call analyst. Analyze this call transcript and return ONLY valid JSON — no markdown, no explanation, no code fences.

{
  "summary": "2-3 sentence summary of call purpose, key points, and outcome",
  "satisfaction_score": <integer 1-10>,
  "tone_keywords": ["keyword1", "keyword2", "keyword3"],
  "action_items": ["item1", "item2"],
  "buying_signals": ["signal1"],
  "objections": ["objection1"],
  "risk_flags": ["flag1"]
}

SCORING GUIDE:
- 1-3: Hostile, complaint, churn risk, unresolved issues
- 4-5: Neutral, informational, no clear engagement
- 6-7: Positive, engaged, follow-up likely
- 8-10: Highly positive, strong buying signals, deal progression

TRANSCRIPT:
{transcriptText}
```

**Response Parsing:**
```javascript
let text = response.text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
const analysis = JSON.parse(text);
```

If parsing fails, fall back to:
```javascript
{ summary: response.text.substring(0, 500), satisfaction_score: 5, tone_keywords: [], action_items: [], buying_signals: [], objections: [], risk_flags: [] }
```

Governance: ~100 units per N/llm.generateText()

#### Phone Call Record Creation

```javascript
const phoneCall = record.create({ type: record.Type.PHONE_CALL, isDynamic: true });

phoneCall.setValue({ fieldId: 'title', value: 'Call: ' + (analysis.summary || '').substring(0, 80) });
phoneCall.setValue({ fieldId: 'status', value: 'COMPLETE' });
phoneCall.setValue({ fieldId: 'message', value: transcriptText });
phoneCall.setValue({ fieldId: 'custevent_ctc_recording_sid', value: recording.sid });
phoneCall.setValue({ fieldId: 'custevent_ctc_recording_url',
    value: 'https://api.twilio.com/2010-04-01/Accounts/' + config.accountSid + '/Recordings/' + recording.sid + '.mp3' });
phoneCall.setValue({ fieldId: 'custevent_ctc_duration', value: parseInt(recording.duration) });
phoneCall.setValue({ fieldId: 'custevent_ctc_transcript', value: transcriptText });
phoneCall.setValue({ fieldId: 'custevent_ctc_ai_summary', value: analysis.summary || '' });
phoneCall.setValue({ fieldId: 'custevent_ctc_satisfaction', value: analysis.satisfaction_score || 5 });
phoneCall.setValue({ fieldId: 'custevent_ctc_tone_keywords', value: (analysis.tone_keywords || []).join(', ') });
phoneCall.setValue({ fieldId: 'custevent_ctc_action_items', value: (analysis.action_items || []).join('\n') });
phoneCall.setValue({ fieldId: 'custevent_ctc_processed', value: true });

// TODO Phase 4: Entity linking — match recording's phone number → customer lookup
// phoneCall.setValue({ fieldId: 'company', value: matchedCustomerId });

phoneCall.save();
```

#### Governance Budget Per Recording

| Operation | Units |
|-----------|-------|
| List recordings (1 call for batch) | 10 |
| Check duplicate (saved search) | 10 |
| Get transcripts | 10 |
| Get sentences | 10 |
| N/llm analysis | 100 |
| Create Phone Call record | 20 |
| Delete recording | 10 |
| **Total per recording** | **~170** |

Scheduled Script budget: 10,000 units → can process ~58 recordings per execution. At 20 calls/day, a single 15-min cycle handles the entire day's backlog.

#### Error Handling

- Wrap each recording in try/catch. Log error, continue to next recording.
- If N/llm quota exhausted, create Phone Call record WITHOUT AI fields (still has transcript).
- If Twilio API returns non-200, log response body and skip recording.
- Never throw unhandled exceptions — the Scheduled Script must complete gracefully.

#### Verification

1. Make a test call via the softphone
2. Wait 5-15 minutes for Conversational Intelligence to transcribe
3. Manually trigger the Scheduled Script (or wait for next cycle)
4. Check: Phone Call record created with recording SID, transcript text, AI summary, satisfaction score
5. Check: Recording deleted from Twilio after processing

---

## Twilio Platform Configuration (Manual Steps)

These are done in the Twilio Console, not in SDF. Document here for completeness.

### Step 1: Purchase Phone Number

Twilio Console → Phone Numbers → Buy a Number
- Country: US
- Capabilities: Voice (required), SMS (optional)
- Cost: $1.15/month
- Note the number in E.164 format: `+1XXXXXXXXXX`

### Step 2: Create API Key

Twilio Console → Account → API Keys → Create API Key
- Type: Standard
- **Save immediately:** SID (`SK...`) and Secret (shown once)

### Step 3: Create TwiML Bin

Twilio Console → Develop → TwiML Bins → Create New
- Name: `CTC Outbound Dial`
- Content:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>This call may be recorded for quality purposes.</Say>
    <Dial record="record-from-answer-dual" callerId="{{From}}">
        <Number>{{To}}</Number>
    </Dial>
</Response>
```
- Note the TwiML Bin URL

### Step 4: Create TwiML App

Twilio Console → Develop → Voice → TwiML Apps → Create
- Voice Request URL: paste the TwiML Bin URL from Step 3
- Method: POST
- Note the Application SID (`AP...`)

### Step 5: Enable Conversational Intelligence

Twilio Console → Develop → Conversational Intelligence → Services → Create
- Auto Transcribe: ON
- Language: en-US
- PII Redaction: Optional
- Note the Service SID (`GA...`)

### Step 6: Populate NetSuite Config Record

Create one record in `customrecord_ctc_config` with:
- Account SID: from Twilio Console → Account Dashboard
- Auth Token: from Twilio Console → Account Dashboard
- API Key SID: from Step 2
- API Key Secret: from Step 2
- TwiML App SID: from Step 4
- Caller ID Number: from Step 1
- Intelligence Service SID: from Step 5

---

## Fallback: Twilio Function for Token Generation

If the N/crypto JWT approach produces invalid tokens after debugging, deploy this single Twilio Function:

### Setup

Twilio Console → Develop → Functions and Assets → Services → Create Service

**Function:** `/token`

```javascript
exports.handler = function(context, event, callback) {
    const AccessToken = Twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const token = new AccessToken(
        context.ACCOUNT_SID,
        context.API_KEY_SID,
        context.API_KEY_SECRET,
        { identity: event.identity || 'user', ttl: 3600 }
    );

    token.addGrant(new VoiceGrant({
        outgoingApplicationSid: context.TWIML_APP_SID,
        incomingAllow: false
    }));

    const response = new Twilio.Response();
    response.appendHeader('Content-Type', 'application/json');
    response.setBody({ token: token.toJwt() });
    callback(null, response);
};
```

**Environment Variables:**
- `API_KEY_SID`: SK...
- `API_KEY_SECRET`: (secret)
- `TWIML_APP_SID`: AP...

**Impact on architecture:** The RESTlet (`ctc_rl_token.js`) would call this Twilio Function URL via `N/https.post()` instead of using the local JWT module. The Suitelet remains unchanged — it still fetches from the RESTlet.

---

## Data Flow Summary

```
CALL INITIATION:
Customer Record → [Client Script] → popup → [Suitelet HTML] → fetch → [RESTlet] → JWT
                                                    ↓
                                              Twilio.Device.connect()
                                                    ↓
                                         Twilio TwiML App → TwiML Bin
                                                    ↓
                                              <Dial> + record
                                                    ↓
                                         Browser ↔ Twilio ↔ PSTN

POST-CALL (async, 5-20 min later):
[Scheduled Script] → GET /Recordings → GET /Transcripts → GET /Sentences
                          ↓
                     N/llm.generateText(transcript)
                          ↓
                     record.create(record.Type.PHONE_CALL) with all fields
                          ↓
                     DELETE /Recordings/{sid} (cleanup)
```

## Recording Lifecycle

During the call, NetSuite does NOTHING. The WebRTC audio stream flows directly between the browser and Twilio's media servers. Recording happens inside Twilio's infrastructure — it forks the audio streams and writes them to storage. No API calls, no webhooks, no SuiteScript executing. The browser doesn't even know recording is happening.

After the call ends:
1. Twilio marks recording as `completed` (~30 seconds)
2. Conversational Intelligence auto-transcribes (~3-5 minutes for a 5-min call)
3. Scheduled Script polls and picks up the transcript
4. After creating the Phone Call record, the script deletes the recording from Twilio
5. Audio is gone, but the transcript text lives permanently in NetSuite

---

## Cost Estimate

10 reps, ~20 calls/day, 5 min avg = 3,000 min/month

| Component | Rate | Monthly |
|-----------|------|---------|
| Twilio Phone Number | $1.15/mo | $1.15 |
| Outbound Voice | $0.014/min | $42.00 |
| Recording Storage | $0.0005/min | $1.50 |
| Conv. Intelligence Transcription | $0.035/min | $105.00 |
| Language Operators (optional) | $0.005/min | $15.00 |
| N/llm | Free tier | $0.00 |
| **Total** | | **~$165/mo** |

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| N/crypto JWT mismatch | **BLOCKER** | Test first. Compare byte-for-byte against jwt.io. Fallback: Twilio Function. |
| N/encode line breaks in base64 | High | Strip `\n` and `\r` before base64url conversion |
| NetSuite DOM changes break button injection | Medium | Defensive selectors, feature-detect DOM nodes, log failures |
| N/llm free quota exceeded | Low | Check at script start, skip AI if < 10 remaining |
| Popup blocked by browser | Medium | Log warning. Phase 2: implement iframe fallback |
| Twilio Conv. Intelligence latency | Low | Polling handles this — script retries next cycle |
| Recording compliance (two-party consent) | Legal | TwiML Bin includes `<Say>` disclosure before `<Dial>` |
| Twilio recording pile-up | Operational | Script deletes recordings after transcript extraction |
