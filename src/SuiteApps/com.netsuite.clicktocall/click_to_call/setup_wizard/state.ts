// @ts-check
/**
 * Setup Wizard + Admin Console state — the single mutable STATE
 * object shared across all sections, steps, and the post-activation
 * console.
 *
 * Path B.3d (2026-05-27) — extracted from SpaClient.ts. The 235
 * `STATE.X` references in SpaClient.ts work unchanged because the
 * object is exported as a `const` binding — importers can't reassign
 * STATE itself but CAN mutate its properties (which is what every
 * existing call site does — `STATE.console.phonesNumbers = [...]`
 * etc.).
 *
 * Why one big STATE object instead of per-section modules?
 *
 *   The wizard's data model has heavy cross-section sharing —
 *   snapshot + assignments + preflight are fetched once on console
 *   mount and reused across overview/voice/health/phones. Splitting
 *   STATE into 5+ section modules would either duplicate the shared
 *   slices or require dependency injection at every section's render
 *   call. One mutable root is the pragmatic shape; the type interfaces
 *   below give us per-section typing without splitting the runtime
 *   object.
 *
 * TypeScript discipline (vs the original .js STATE):
 *
 *   The original SpaClient.js declared STATE as plain object literal
 *   with no types. This module adds interface declarations for each
 *   slice so:
 *     1. tsc errors when a section writes `STATE.console.foo` with
 *        a missing/typo field
 *     2. VS Code autocomplete works across the whole codebase
 *     3. Future renames can be refactored safely
 *
 *   The interfaces use `unknown`/`null` for fields where the upstream
 *   API response shape is intentionally loose (drift detection,
 *   activity feed). Tighten as discriminated unions when the shapes
 *   stabilize.
 */

// ─────────────────────────────────────────────────────────────────────
// Per-step state shapes (Steps 1-5 of the onboarding wizard)
// ─────────────────────────────────────────────────────────────────────

export interface Step2State {
    /** Twilio Account SID (starts with AC...). */
    accountSid: string;
    /** Twilio API Key SID (starts with SK...). */
    apiKeySid: string;
    /** NetSuite custsecret pointer for the API secret value. Never the secret itself. */
    apiSecretId: string;
}

export interface Step3State {
    twimlAppSid: string;
    phoneNumber: string;
    intelServiceSid: string;
    /**
     * Auto-populated dropdown source lists. Fetched from the
     * server via wizardListTwiMLApps / wizardListPhoneNumbers /
     * wizardListIntelServices on Step 3 mount. Secret VALUE
     * never travels — server uses SecureString + custsecret
     * pointer at the N/https socket boundary.
     */
    twimlApps: unknown[] | null;
    phoneNumbers: unknown[] | null;
    intelServices: unknown[] | null;
    listLoadError: string | null;
}

export interface Step4State {
    /** Source lists (null = not yet fetched). */
    phoneNumbers: unknown[] | null;  // from Twilio (live)
    employees: unknown[] | null;      // from NetSuite
    /**
     * assignments shape: { <phoneSid>: { employeeIds: [n], label: '',
     * primaryEmployeeId: n }, ... }
     */
    assignments: Record<string, unknown>;
    listLoadError: string | null;
}

export interface Step5State {
    snapshot: unknown | null;        // from wizardSnapshot — config record state
    assignments: unknown[] | null;   // from wizardLoadAssignments — current rep list
    preflight: unknown[] | null;     // from wizardRunPreflight — check results array
    activated: boolean;              // true after successful activate
    activateError: string | null;
    loading: boolean;                // true while preflight is running
}

// ─────────────────────────────────────────────────────────────────────
// Admin Console state (post-activation, multi-section)
// ─────────────────────────────────────────────────────────────────────

export interface ConsoleState {
    // Shared across sections — fetched once on console mount.
    snapshot: unknown | null;        // from wizardSnapshot
    assignments: unknown[] | null;   // from wizardLoadAssignments
    preflight: unknown[] | null;     // from wizardRunPreflight (Health + Overview)
    activity: unknown[] | null;      // legacy stub field — kept for back-compat; superseded by recentCalls
    recentCalls: unknown[] | null;   // from wizardListRecentCalls (Overview Recent calls)
    drift: unknown | null;           // client-computed {phoneNumbers, voiceUrl, intelService}
    loading: boolean;                // initial-load gate

    // Phones section (U3 — Phase 3b): inline-edit DataGrid state.
    phonesEmployees: unknown[] | null;   // from wizardListEmployees (cached)
    phonesNumbers: unknown[] | null;     // from wizardListPhoneNumbers (live Twilio list)
    phonesByPhone: unknown[] | null;     // derived: assignments grouped by phoneSid
    phonesLoading: boolean;              // section-level loader gate
    phonesSaving: Record<string, boolean>; // { phoneSid: bool } — per-row save spinner
    phonesError: string | null;

    // Voice section (U4 — Phase 3b): per-field VIEW/EDIT toggle.
    voiceEditing: 'twimlAppSid' | 'phoneNumber' | 'intelServiceSid' | null;
    voicePendingValue: string | null;
    voiceLists: {
        twimlApps: unknown[] | null;
        phoneNumbers: unknown[] | null;
        intelServices: unknown[] | null;
    };
    voiceListsLoading: boolean;
    voiceSaving: boolean;
    voiceError: string | null;

    // Credentials section (U5 — Phase 3c): modal state.
    activeModal: 'rotate-secret' | null;

    // Health + Deactivate flow (U6 / U11 carry-over).
    pendingDeactivateConfirm: boolean;
    deactivateError: string | null;

    // Cross-section error surface.
    actionError: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Root state interface
// ─────────────────────────────────────────────────────────────────────

export interface WizardState {
    step2: Step2State;
    step3: Step3State;
    step4: Step4State;
    step5: Step5State;
    console: ConsoleState;
}

// ─────────────────────────────────────────────────────────────────────
// The actual STATE object. Exported as `const` — importers mutate
// properties (STATE.console.foo = bar) but never reassign STATE itself.
// ─────────────────────────────────────────────────────────────────────

export const STATE: WizardState = {
    step2: { accountSid: '', apiKeySid: '', apiSecretId: '' },
    step3: {
        twimlAppSid: '',
        phoneNumber: '',
        intelServiceSid: '',
        twimlApps: null,
        phoneNumbers: null,
        intelServices: null,
        listLoadError: null
    },
    step4: {
        phoneNumbers: null,
        employees: null,
        assignments: {},
        listLoadError: null
    },
    step5: {
        snapshot: null,
        assignments: null,
        preflight: null,
        activated: false,
        activateError: null,
        loading: false
    },
    console: {
        snapshot: null,
        assignments: null,
        preflight: null,
        activity: null,
        recentCalls: null,
        drift: null,
        loading: false,
        phonesEmployees: null,
        phonesNumbers: null,
        phonesByPhone: null,
        phonesLoading: false,
        phonesSaving: {},
        phonesError: null,
        voiceEditing: null,
        voicePendingValue: null,
        voiceLists: {
            twimlApps: null,
            phoneNumbers: null,
            intelServices: null
        },
        voiceListsLoading: false,
        voiceSaving: false,
        voiceError: null,
        activeModal: null,
        pendingDeactivateConfirm: false,
        deactivateError: null,
        actionError: null
    }
};
