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
 * Render the Step 2 form: heading + intro + three text fields laid
 * out in a 3-column grid. The fields read from + write to STATE.step2
 * directly.
 *
 * Path C polish (2026-05-27) — the three credential fields used to
 * stack vertically (3 stacked rows). At admin-console widths the
 * three SID inputs are short enough to sit side-by-side, which both
 * shortens the form and makes the "these go together" relationship
 * visually explicit. GridPanel with '1fr 1fr 1fr' gives equal column
 * widths; the heading + intro stay vertical above the grid so reading
 * order is heading → explanation → fields.
 */
export const buildStep2Form = (d: EnumsBag): unknown => {
    const heading = safeNew(d.H, {
        content: 'Connect to your Twilio account',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(step2)');

    const intro = safeNew(d.T, {
        text: 'Enter your Twilio Account SID and API Key SID. ' +
              'The API Key Secret must already exist in NetSuite ' +
              'API Secrets (Setup > Company > API Secrets) — paste ' +
              'its script ID below. Live validation against Twilio ' +
              'runs at Step 5 (Test & activate) using the configured ' +
              'secret pointer — no need to paste the secret value here.'
    }, 'Text(step2-intro)');

    const fields = [
        buildTextField('Account SID', 'AC...',
            STATE.step2.accountSid,
            (v) => { STATE.step2.accountSid = v; }),
        buildTextField('API Key SID', 'SK...',
            STATE.step2.apiKeySid,
            (v) => { STATE.step2.apiKeySid = v; }),
        buildTextField('API Key Secret script ID', 'custsecret_...',
            STATE.step2.apiSecretId,
            (v) => { STATE.step2.apiSecretId = v; })
    ].filter((f) => f != null);

    // 3-col grid. Falls back to vertical stack if GridPanel
    // construction fails (defensive — d.GP is guaranteed available in
    // v9.0.0 but safeNew handles the runtime case anyway).
    const fieldsBlock = safeNew(d.GP, {
        columns: '1fr 1fr 1fr',
        rows: 'auto',
        items: fields,
        columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
    }, 'GridPanel(step2-fields)') || safeNew(d.SP, {
        items: fields,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(step2-fields-fallback)');

    const items = [heading, intro, fieldsBlock].filter((c) => c != null);
    return safeNew(d.SP, {
        items: items,
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(step2)');
};
