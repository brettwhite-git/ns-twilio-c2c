/**
 * CRIT-4 + HIGH-14 regression tests for ctc_sl_wizard_api.js#wizardSaveAssignments.
 *
 * Phase A SAFE review 2026-05-21 (docs/plans/2026-05-21-002) flagged:
 *   - CRIT-4: nested loops (assignments × existing × employees) with no
 *     caps. A large payload blows the Suitelet 10k-unit governance
 *     budget mid-save and leaves the rep_assignment table partially
 *     deleted (no transaction rollback).
 *   - HIGH-14: inner employeeIds array has no length cap (DoS vector).
 *
 * Fix landed in this commit:
 *   - Payload cap: MAX_PHONES_PER_SAVE = 20 (reject upfront if exceeded)
 *   - Inner cap: MAX_EMPLOYEES_PER_PHONE = 50 (skip with audit if exceeded)
 *   - Governance guard: getRemainingUsage() < 500 → break with
 *     partial-progress envelope
 */

import suitelet from 'SuiteScripts/ctc_sl_wizard_api';
import runtime from 'N/runtime';
import record from 'N/record';
import search from 'N/search';

jest.mock('N/runtime');
jest.mock('N/record');
jest.mock('N/search');
jest.mock('N/query');
jest.mock('N/crypto');
jest.mock('N/https');
jest.mock('N/encode');
jest.mock('SuiteScripts/lib/ctc_config', () => ({
    loadConfig: jest.fn().mockReturnValue({ accountSid: 'AC_test', apiKeySid: 'SK_test' })
}));
jest.mock('SuiteScripts/lib/ctc_twilio_admin', () => ({
    buildSecureAuthHeader: jest.fn(),
    pingAccount: jest.fn()
}));
jest.mock('SuiteScripts/lib/ctc_twilio_jwt');

/** Build a fake Suitelet context with the given action + payload. */
const buildContext = (action, payload) => {
    let written = '';
    return {
        request: {
            parameters: { action: action },
            method: 'POST',
            body: JSON.stringify(payload || {})
        },
        response: {
            setHeader: jest.fn(),
            write: (s) => { written += s; },
            getWritten: () => written
        }
    };
};

describe('ctc_sl_wizard_api — wizardSaveAssignments governance', () => {
    let mockExistingResults;

    beforeEach(() => {
        jest.clearAllMocks();

        // Default: high remaining governance budget; no existing rows in
        // rep_assignment table; record.create returns a stub that captures
        // saves. Per-test overrides simulate low budget / oversize payloads.
        runtime.getCurrentScript = jest.fn().mockReturnValue({
            getRemainingUsage: jest.fn().mockReturnValue(9000)
        });
        runtime.getCurrentUser = jest.fn().mockReturnValue({ id: 42, role: 3 });

        mockExistingResults = [];
        search.create = jest.fn().mockReturnValue({
            run: jest.fn().mockReturnValue({
                getRange: jest.fn().mockReturnValue(mockExistingResults)
            })
        });

        record.create = jest.fn().mockReturnValue({
            setValue: jest.fn(),
            save: jest.fn().mockReturnValue(1000)
        });
        record.delete = jest.fn();
    });

    /** Convenience — invoke the wizard's wizardSaveAssignments action and parse the response. */
    const callSaveAssignments = (assignments) => {
        const ctx = buildContext('wizardSaveAssignments', { assignments: assignments });
        suitelet.onRequest(ctx);
        return JSON.parse(ctx.response.getWritten());
    };

    it('CRIT-4: rejects payload with > 20 phone numbers (MAX_PHONES_PER_SAVE)', () => {
        // 21 phones × 1 employee each. The cap should fire BEFORE any
        // record ops are issued — otherwise governance can blow mid-save.
        const assignments = [];
        for (let i = 0; i < 21; i++) {
            assignments.push({
                phoneSid: 'PN' + i,
                phoneNumber: '+15551' + String(i).padStart(6, '0'),
                employeeIds: [100 + i]
            });
        }

        const result = callSaveAssignments(assignments);

        expect(result.ok).toBe(false);
        expect(result.error).toBe('payload_too_large');
        expect(record.create).not.toHaveBeenCalled();
        expect(record.delete).not.toHaveBeenCalled();
    });

    it('CRIT-4: accepts payload at the 20-phone boundary', () => {
        const assignments = [];
        for (let i = 0; i < 20; i++) {
            assignments.push({
                phoneSid: 'PN' + i,
                phoneNumber: '+15551' + String(i).padStart(6, '0'),
                employeeIds: [100 + i]
            });
        }

        const result = callSaveAssignments(assignments);

        expect(result.saved).toBe(true);
        expect(result.inserted).toBe(20);
    });

    it('CRIT-4: returns partial-progress envelope on governance break', () => {
        // Simulate: budget drops below 500 after 3 iterations. The loop
        // should break with the partial counts so the caller can resubmit.
        let callCount = 0;
        runtime.getCurrentScript().getRemainingUsage = jest.fn().mockImplementation(() => {
            callCount++;
            return callCount > 3 ? 400 : 9000;
        });

        const assignments = [];
        for (let i = 0; i < 10; i++) {
            assignments.push({
                phoneSid: 'PN' + i,
                phoneNumber: '+1555000000' + i,
                employeeIds: [100 + i]
            });
        }

        const result = callSaveAssignments(assignments);

        expect(result.ok).toBe(false);
        expect(result.error).toBe('governance_limit');
        expect(result.processed).toBe(3);
        expect(result.total).toBe(10);
        expect(result.inserted).toBe(3);
    });

    it('HIGH-14: skips a phone whose employeeIds array exceeds 50 (does not abort whole save)', () => {
        // Phone 1 has 60 employees (skipped); phone 2 has 5 (inserts).
        // The save should succeed overall with inserted=5, not fail.
        const tooManyEmployees = [];
        for (let i = 0; i < 60; i++) tooManyEmployees.push(1000 + i);

        const assignments = [
            { phoneSid: 'PN_oversize', phoneNumber: '+15551110000', employeeIds: tooManyEmployees },
            { phoneSid: 'PN_normal',   phoneNumber: '+15552220000', employeeIds: [200, 201, 202, 203, 204] }
        ];

        const result = callSaveAssignments(assignments);

        expect(result.saved).toBe(true);
        expect(result.inserted).toBe(5); // only the normal phone's employees
    });

    it('still accepts a legit single-phone single-employee save (regression)', () => {
        const result = callSaveAssignments([
            { phoneSid: 'PN_ok', phoneNumber: '+15553330000', employeeIds: [42], primaryEmployeeId: 42 }
        ]);

        expect(result.saved).toBe(true);
        expect(result.inserted).toBe(1);
        expect(record.create).toHaveBeenCalledTimes(1);
    });
});
