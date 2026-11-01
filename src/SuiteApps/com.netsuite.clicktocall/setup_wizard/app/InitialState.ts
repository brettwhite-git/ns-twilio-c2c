/**
 * Initial state tree for the wizard + console Store.
 *
 * Phase 1 (2026-05-28) — expanded from the D-Store-2 dispatch-only slice
 * to the full app state tree. Step + console interfaces folded in from
 * the legacy state.ts mutable singleton.
 *
 * This file is the single source of truth for state shape. The legacy
 * state.ts module re-exports these interfaces for back-compat while
 * AppController + sections + steps still mutate the runtime STATE
 * singleton directly. Phases 3-6 wire those callers to dispatch + read
 * via store.getState(); Phase 6 deletes state.ts entirely.
 */

// ─────────────────────────────────────────────────────────────────────
// Top-level dispatch state — drives MODE/CURRENT_STEP/SELECTED_SECTION
// ─────────────────────────────────────────────────────────────────────

export type Mode = 'stepper' | 'console';

export type SectionName = 'overview' | 'phones' | 'inbound' | 'voice' | 'credentials' | 'health';

// ─────────────────────────────────────────────────────────────────────
// Per-step state shapes
// ─────────────────────────────────────────────────────────────────────

export interface Step2State {
    accountSid: string;
    apiKeySid: string;
    apiSecretId: string;
}

export interface Step3State {
    twimlAppSid: string;
    phoneNumber: string;
    intelServiceSid: string;
    twimlApps: unknown[] | null;
    phoneNumbers: unknown[] | null;
    intelServices: unknown[] | null;
    listLoadError: string | null;
}

export interface Step4State {
    phoneNumbers: unknown[] | null;
    employees: unknown[] | null;
    assignments: Record<string, unknown>;
    listLoadError: string | null;
}

export interface Step5State {
    snapshot: unknown | null;
    assignments: unknown[] | null;
    preflight: unknown[] | null;
    activated: boolean;
    activateError: string | null;
    loading: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Admin Console state (post-activation, multi-section)
// ─────────────────────────────────────────────────────────────────────

export interface ConsoleState {
    snapshot: unknown | null;
    assignments: unknown[] | null;
    preflight: unknown[] | null;
    activity: unknown[] | null;
    recentCalls: unknown[] | null;
    drift: unknown | null;
    loading: boolean;

    // Phones section
    phonesEmployees: unknown[] | null;
    phonesNumbers: unknown[] | null;
    phonesByPhone: unknown[] | null;
    phonesLoading: boolean;
    phonesSaving: Record<string, boolean>;
    phonesError: string | null;
    /** Numbers whose inbound routing did not update after the last save. */
    phonesRoutingErrors: InboundPublishError[];

    // Voice section
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

    // Credentials section
    activeModal: 'rotate-secret' | null;

    // Health + Deactivate flow
    pendingDeactivateConfirm: boolean;
    deactivateError: string | null;
    preflightRefreshing: boolean;

    // Cross-section error surface
    actionError: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Inbound calls section — server contract of wizardLoadInbound /
// wizardSaveInbound / wizardPublishRouting (ctc_sl_wizard_api.js)
// ─────────────────────────────────────────────────────────────────────

export interface InboundPublishError {
    phoneNumber: string;
    message: string;
}

export interface InboundPublishResult {
    ok: boolean;
    flowSid?: string;
    publishedAt?: string;
    numbersUpdated?: number;
    errors?: InboundPublishError[];
    skipped?: 'inbound_off' | 'not_published';
}

export interface InboundRoute {
    phoneSid: string;
    phoneNumber: string;
    employeeId: number | string;
    employeeName: string;
}

/** An employee the Inbound calls page offers as the fallback owner. */
export interface InboundEmployee {
    id: string;
    name: string;
}

export interface InboundSettings {
    inboundEnabled: boolean;
    ringSeconds: number;
    noAnswerMessage: string;
    recordInbound: boolean;
    recordingNoticeOn: boolean;
    recordingNotice: string;
    /** Unanswered / unrouted callers can leave a voicemail. */
    voicemailOn: boolean;
    /** Longest voicemail, whole seconds (30-300). */
    voicemailMaxSeconds: number;
    /** Employee id that owns unrouted calls and voicemails; '' = not set. */
    fallbackOwnerId: string;
}

export interface InboundState {
    /** True once wizardLoadInbound returned; false forces a reload on mount. */
    loaded: boolean;
    loading: boolean;
    loadError: string | null;

    /** Form values (edited in place; sent by Save & publish). */
    inboundEnabled: boolean;
    ringSeconds: number;
    noAnswerMessage: string;
    recordInbound: boolean;
    recordingNoticeOn: boolean;
    recordingNotice: string;
    voicemailOn: boolean;
    voicemailMaxSeconds: number;
    fallbackOwnerId: string;

    flowSid: string;
    publishedAt: string;
    routes: InboundRoute[];
    /** Fallback-owner choices (from wizardLoadInbound). */
    employees: InboundEmployee[];

    saving: boolean;
    saveError: string | null;
    publishing: boolean;
    /** Result of the last save/publish this session (status line source). */
    lastPublish: InboundPublishResult | null;
}

// ─────────────────────────────────────────────────────────────────────
// Rep phone presence — server contract of wizardLoadPresence
// (ctc_sl_wizard_api.js; rows written by the token RESTlet's phoneHeartbeat)
// ─────────────────────────────────────────────────────────────────────

export interface PresenceRow {
    employeeId: string;
    employeeName: string;
    canReceive: boolean;
    /** registered / unregistered / registering / offline; '' = never reported. */
    state: string;
    /** ISO time of the last heartbeat write; '' = never. */
    lastSeen: string;
    lastChange: string;
    /** lastSeen older than 12 minutes (or never). */
    stale: boolean;
}

export interface PresenceState {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    items: PresenceRow[];
    /** Server clock minus browser clock at load (ms), for "2 min ago". */
    clockSkewMs: number;
}

// ─────────────────────────────────────────────────────────────────────
// Prereqs (Step 1) — separate slice; not part of console
// ─────────────────────────────────────────────────────────────────────

interface PrereqsState {
    checks: unknown[] | null;
    loading: boolean;
    error: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Root state interface
// ─────────────────────────────────────────────────────────────────────

export interface AppState {
    // Dispatch state (mode/step/section routing)
    mode: Mode;
    currentStep: number;
    selectedSection: SectionName;
    railVisible: boolean;
    /**
     * Phase 1 C-9/U8 carryover — true during the brief window between
     * App mount and wizardSnapshot resolution. Render gates on this to
     * avoid the "Step 1 flash" before the snapshot-driven landing
     * decision routes the user to the correct step or console section.
     */
    mountRouting: boolean;

    // Per-step form state
    step2: Step2State;
    step3: Step3State;
    step4: Step4State;
    step5: Step5State;
    prereqs: PrereqsState;

    // Console state
    console: ConsoleState;

    // Inbound calls section
    inbound: InboundState;

    // Rep phone presence (Health "Phones" + Inbound routing "Phone")
    presence: PresenceState;
}

/**
 * Initial state — what the app starts in on fresh mount.
 */
const initialState: AppState = {
    mode: 'stepper',
    currentStep: 1,
    selectedSection: 'overview',
    railVisible: false,
    mountRouting: true,
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
    prereqs: {
        checks: null,
        loading: false,
        error: null
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
        phonesRoutingErrors: [],
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
        preflightRefreshing: false,
        actionError: null
    },
    inbound: {
        loaded: false,
        loading: false,
        loadError: null,
        inboundEnabled: false,
        ringSeconds: 20,
        noAnswerMessage: '',
        recordInbound: true,
        recordingNoticeOn: false,
        recordingNotice: '',
        voicemailOn: true,
        voicemailMaxSeconds: 120,
        fallbackOwnerId: '',
        flowSid: '',
        publishedAt: '',
        routes: [],
        employees: [],
        saving: false,
        saveError: null,
        publishing: false,
        lastPublish: null
    },
    presence: {
        loaded: false,
        loading: false,
        error: null,
        items: [],
        clockSkewMs: 0
    }
};

export default initialState;
