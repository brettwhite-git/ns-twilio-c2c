/**
 * Per-step validation helpers.
 *
 * Pure functions over AppState that return true when the step's
 * required inputs are present. WizardNavFooter uses these to gate the
 * Continue button so admins can't advance with empty SIDs or
 * unassigned phones.
 *
 * Step 1 has no validation (advancing is informational). Step 5's
 * Activate button has its own preflight-pass gate inside Step5.tsx.
 */

import type {AppState} from './InitialState';

const nonEmpty = (v: string | undefined | null): boolean =>
    !!(v && String(v).trim().length > 0);

export function isStep2Valid(state: AppState): boolean {
    const s = state.step2;
    return nonEmpty(s.accountSid) && nonEmpty(s.apiKeySid) && nonEmpty(s.apiSecretId);
}

export function isStep3Valid(state: AppState): boolean {
    const s = state.step3;
    return nonEmpty(s.twimlAppSid) && nonEmpty(s.phoneNumber);
}

interface Step4Assignment {
    employeeIds?: number[];
}

export function isStep4Valid(state: AppState): boolean {
    const map = state.step4.assignments as Record<string, Step4Assignment>;
    for (const sid in map) {
        if (!Object.prototype.hasOwnProperty.call(map, sid)) continue;
        const ids = (map[sid] && map[sid].employeeIds) || [];
        if (ids.length > 0) return true;
    }
    return false;
}

export function isStepValid(stepNum: number, state: AppState): boolean {
    switch (stepNum) {
        case 2: return isStep2Valid(state);
        case 3: return isStep3Valid(state);
        case 4: return isStep4Valid(state);
        default: return true;
    }
}
