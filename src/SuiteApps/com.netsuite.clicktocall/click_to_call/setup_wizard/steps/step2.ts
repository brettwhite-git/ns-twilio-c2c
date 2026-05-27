// @ts-check
/**
 * Step 2 — Connect Twilio.
 *
 * Three text-field rows: Account SID, API Key SID, API Key Secret
 * script ID (custsecret_ pointer; the secret VALUE never travels —
 * it lives in NetSuite API Secrets and is held opaque by
 * N/https.createSecureString at the server boundary).
 *
 * Pure renderer — no async work, no event handlers beyond the
 * onChange callbacks that mutate STATE.step2. The Continue button
 * in the parent nav footer dispatches wizardSavePublicIds; this
 * module just paints the form.
 *
 * Path B.4-2 (2026-05-27) — first per-step module extracted.
 */

import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { buildTextField } from '../render/shared';
import type { EnumsBag } from '../render/shell';

/**
 * Render the Step 2 form: heading + intro + three text fields.
 * The fields read from + write to STATE.step2 directly.
 */
export const buildStep2Form = (d: EnumsBag): unknown => {
    const rows: unknown[] = [];

    rows.push(safeNew(d.H, {
        content: 'Connect to your Twilio account',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(step2)'));

    rows.push(safeNew(d.T, {
        text: 'Enter your Twilio Account SID and API Key SID. ' +
              'The API Key Secret must already exist in NetSuite ' +
              'API Secrets (Setup > Company > API Secrets) — paste ' +
              'its script ID below. Live validation against Twilio ' +
              'runs at Step 6 (Test & activate) using the configured ' +
              'secret pointer — no need to paste the secret value here.'
    }, 'Text(step2-intro)'));

    rows.push(buildTextField('Account SID', 'AC...',
        STATE.step2.accountSid,
        (v) => { STATE.step2.accountSid = v; }));

    rows.push(buildTextField('API Key SID', 'SK...',
        STATE.step2.apiKeySid,
        (v) => { STATE.step2.apiKeySid = v; }));

    rows.push(buildTextField('API Key Secret script ID',
        'custsecret_...',
        STATE.step2.apiSecretId,
        (v) => { STATE.step2.apiSecretId = v; }));

    return safeNew(d.SP, {
        items: rows.filter((r) => r != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(step2)');
};
