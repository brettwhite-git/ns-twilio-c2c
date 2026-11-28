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

/** Console pages (hash routes in routes.ts; #/voice and #/credentials redirect). */
export type SectionName =
    'overview' | 'phones' | 'inbound' | 'outbound' | 'transcripts' | 'health' | 'account';

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
    /** wizardActivate is in flight (Activate button busy). */
    activating: boolean;
    activateError: string | null;
    loading: boolean;
}

/** A preflight / credential check row as the server returns it. */
export interface CheckResult {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
    repairHint?: string | null;
}

/** Unsaved edits of one Phones & reps row (keyed by phone SID). */
export interface PhoneDraft {
    employeeIds: number[];
    /** The rep the number rings (and whose outbound caller ID it is). */
    primaryEmployeeId: number | null;
}

/** Twilio list a Voice row edits. */
export type VoiceListKey = 'twimlApps' | 'phoneNumbers' | 'intelServices';

// ─────────────────────────────────────────────────────────────────────
// Admin Console state (post-activation, multi-section)
// ─────────────────────────────────────────────────────────────────────

export interface ConsoleState {
    snapshot: unknown | null;
    assignments: unknown[] | null;
    preflight: unknown[] | null;
    activity: unknown[] | null;
    drift: unknown | null;
    loading: boolean;

    // Phones section
    phonesEmployees: unknown[] | null;
    phonesNumbers: unknown[] | null;
    phonesByPhone: unknown[] | null;
    phonesLoading: boolean;
    /** wizardListPhoneNumbers failed (Twilio error): show it, not "no numbers". */
    phonesListError: string | null;
    /** Twilio has more numbers than the first page the server lists. */
    phonesHasMore: boolean;
    /** The row open in the editor panel under the grid (one at a time), else null. */
    phonesEditingSid: string | null;
    /** Unsaved edits of the open row; Save is enabled while one exists. */
    phonesDrafts: Record<string, PhoneDraft>;
    /** The one row save in flight (saves are serialised), else null. */
    phonesSavingSid: string | null;
    /** Last save error per row (phone SID). */
    phonesRowErrors: Record<string, string>;
    phonesError: string | null;
    /** Numbers whose inbound routing did not update after the last save. */
    phonesRoutingErrors: InboundPublishError[];
    /** ISO time the Twilio number list last loaded ('' = not yet). */
    phonesLoadedAt: string;

    // Voice section
    voiceEditing: 'twimlAppSid' | 'phoneNumber' | 'intelServiceSid' | null;
    voicePendingValue: string | null;
    voiceLists: {
        twimlApps: unknown[] | null;
        phoneNumbers: unknown[] | null;
        intelServices: unknown[] | null;
    };
    voiceListsLoading: boolean;
    /** Per-list Twilio load errors (shown instead of "no items"). */
    voiceListErrors: Partial<Record<VoiceListKey, string>>;
    voiceSaving: boolean;
    voiceError: string | null;

    // Credentials section
    activeModal: 'rotate-secret' | null;

    // Phone tab mode switch (Danger zone; wizardSetPhoneTab)
    phoneTabSaving: boolean;
    phoneTabError: string | null;

    // Recording keep period (Transcripts page; wizardSetRecordingKeep)
    recordingKeepSaving: boolean;
    recordingKeepError: string | null;

    // Health + Deactivate / Reactivate flow
    pendingDeactivateConfirm: boolean;
    deactivating: boolean;
    deactivateError: string | null;
    reactivating: boolean;
    /** Which Reactivate button ran (its error shows next to it). */
    reactivateSource: 'banner' | 'overview';
    reactivateError: string | null;
    /** Checks that blocked Reactivate (server preflight_failed). */
    reactivateFailedChecks: CheckResult[];
    preflightRefreshing: boolean;
    /** wizardRunPreflight did not return (not the same as "not run"). */
    preflightError: string | null;
    /** ISO time the last preflight result landed ('' = none yet). */
    preflightAt: string;

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
    /** Why the publish failed or is partial (ok false). */
    message?: string;
    /** The flow is live but some numbers were not pointed at it. */
    partial?: boolean;
    flowSid?: string;
    /** On ok false: the PREVIOUS publish time ('' = never). */
    publishedAt?: string;
    numbersUpdated?: number;
    errors?: InboundPublishError[];
    /** E.164 numbers that did not update (partial). */
    failedNumbers?: string[];
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

    /** The settings as last loaded / saved (unsaved-change count, Discard). */
    saved: InboundSettings | null;

    saving: boolean;
    saveError: string | null;
    publishing: boolean;
    /** Result of the last save/publish this session (status line source). */
    lastPublish: InboundPublishResult | null;
}

// ─────────────────────────────────────────────────────────────────────
// Outbound recording notice (Outbound calls page) — server contract of
// wizardLoadOutbound / wizardSaveOutbound / wizardPublishOutbound /
// wizardUnpublishOutbound (ctc_sl_wizard_api.js)
// ─────────────────────────────────────────────────────────────────────

export type OutboundStepStatus = 'ok' | 'skipped' | 'failed' | 'pending';

/** One step of a publish / unpublish run (service, build, Voice URL, ...). */
export interface OutboundStep {
    key: string;
    label: string;
    status: OutboundStepStatus;
    detail: string;
}

/** Live check of the TwiML App's Voice URL against the published Function. */
export type OutboundDrift = 'pass' | 'fail' | 'unknown';

/** The load payload, normalised (also returned by save and as publish `state`). */
export interface OutboundSnapshot {
    noticeOn: boolean;
    noticeText: string;
    noticeVersion: number;
    defaultText: string;
    maxLength: number;
    appSid: string;
    functionUrl: string;
    prevVoiceUrl: string;
    publishedAt: string;
    publishedCodeVersion: string;
    codeVersion: string;
    needsRepublish: boolean;
    published: boolean;
    /** The Twilio build was still running when publish returned. */
    pending: boolean;
    /** null = not checked. */
    voiceUrlMatches: boolean | null;
    driftVoiceUrl: OutboundDrift;
    /** Notice version Twilio plays now (0 = no notice). */
    publishedNoticeVersion: number;
    /** Published, and the saved notice differs from what Twilio plays. */
    changesPending: boolean;
    /** Country prefixes /dial allows ('+1,+44' or '*'), from the config record. */
    allowedPrefixes: string;
    /** 'config' | 'caller-id' | 'fallback' (where allowedPrefixes came from). */
    allowedSource: string;
    /** Allow-list the last publish put live ('' = none yet). */
    publishedAllowedPrefixes: string;
    /** Published, and the allow-list differs from the live one. */
    allowListPending: boolean;
    /** The published service/environment still exist in Twilio; null = not checked / unknown. */
    functionExists: boolean | null;
    /** Plain message when the published Function is missing in Twilio ('' otherwise). */
    functionMessage: string;
}

export interface OutboundState extends OutboundSnapshot {
    /** True once wizardLoadOutbound returned; false forces a reload on mount. */
    loaded: boolean;
    loading: boolean;
    loadError: string | null;

    /**
     * The notice as last saved on the server (every load / save / publish /
     * unpublish snapshot). The form differs from it = unsaved edits.
     */
    savedNoticeOn: boolean;
    savedNoticeText: string;

    saving: boolean;
    publishing: boolean;
    unpublishing: boolean;
    /** A whole publish run (save, publish, automatic "Check again") is in progress. */
    publishRunning: boolean;
    /** "Remove from Twilio…" was clicked once; Remove / Cancel shown. */
    confirmUnpublish: boolean;
    /** Last save / publish / unpublish error. */
    error: string | null;
    /** Steps of the last publish / unpublish this session. */
    steps: OutboundStep[] | null;
}

// ─────────────────────────────────────────────────────────────────────
// Rep phone presence — server contract of wizardLoadPresence
// (ctc_sl_wizard_api.js; rows written by the token RESTlet's phoneHeartbeat)
// ─────────────────────────────────────────────────────────────────────

export interface PresenceRow {
    employeeId: string;
    employeeName: string;
    canReceive: boolean;
    /** registered / unregistered / registering / offline / frozen; '' = never reported. */
    state: string;
    /** ISO time of the last heartbeat write; '' = never. */
    lastSeen: string;
    lastChange: string;
    /** lastSeen older than 12 minutes (or never). */
    stale: boolean;
    /** The phone's token grants inbound calls (false = inbound off). */
    incomingGranted: boolean;
    /** Last phone error the softphone reported ('' = none). Diagnostics. */
    lastError: string;
    /** Token identity equals the session user. Diagnostics. */
    identityMatch: boolean;
    /** Short browser label, e.g. "Chrome 130 on macOS". */
    client: string;
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
// Health read model — server contract of wizardLoadHealth
// (ctc_sl_wizard_api.js → lib/ctc_health.js). Phase 1: the Overview
// "Needs attention" list and the Phone numbers / Intelligence drift rows.
// ─────────────────────────────────────────────────────────────────────

export type HealthSeverity = 'ok' | 'warn' | 'problem' | 'unknown';

export interface HealthAction {
    label: string;
    /** SPA hash route, e.g. '#/inbound'. */
    route: string;
}

export interface HealthSignal {
    key: string;
    title: string;
    /** Signal-specific data (see lib/ctc_health.js); null when unknown. */
    value: unknown;
    severity: HealthSeverity;
    detail: string;
    action?: HealthAction;
}

export interface HealthAttentionItem {
    key: string;
    title: string;
    severity: HealthSeverity;
    detail: string;
    action?: HealthAction;
}

export interface HealthState {
    loaded: boolean;
    loading: boolean;
    error: string | null;
    checkedAt: string;
    signals: Record<string, HealthSignal>;
    /** Problem signals first, then warn signals. */
    attention: HealthAttentionItem[];
}

// ─────────────────────────────────────────────────────────────────────
// Credentials (console) — API key rotation form (wizardSaveCredentials)
// ─────────────────────────────────────────────────────────────────────

export interface CredentialsState {
    /** The change form is open. */
    editing: boolean;
    /** Form values: the NEW API Key SID and secret script id. */
    apiKeySid: string;
    apiSecretId: string;
    /** Test + save in flight. */
    saving: boolean;
    error: string | null;
    /** Checks that failed the connection test (values not saved). */
    failedChecks: CheckResult[];
    /** The last save passed the test and saved. */
    saved: boolean;
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

    /** A stepper Continue save is in flight (Continue / Back disabled). */
    wizardSaving: boolean;

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

    // Health read model (Overview "Needs attention" + drift rows)
    health: HealthState;

    // Outbound recording notice (Outbound calls page; Health "TwiML VoiceUrl")
    outbound: OutboundState;

    // Twilio account page — API key rotation form
    credentials: CredentialsState;
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
    wizardSaving: false,
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
        activating: false,
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
        drift: null,
        loading: false,
        phonesEmployees: null,
        phonesNumbers: null,
        phonesByPhone: null,
        phonesLoading: false,
        phonesListError: null,
        phonesHasMore: false,
        phonesEditingSid: null,
        phonesDrafts: {},
        phonesSavingSid: null,
        phonesRowErrors: {},
        phonesError: null,
        phonesRoutingErrors: [],
        phonesLoadedAt: '',
        voiceEditing: null,
        voicePendingValue: null,
        voiceLists: {
            twimlApps: null,
            phoneNumbers: null,
            intelServices: null
        },
        voiceListsLoading: false,
        voiceListErrors: {},
        voiceSaving: false,
        voiceError: null,
        activeModal: null,
        phoneTabSaving: false,
        phoneTabError: null,
        recordingKeepSaving: false,
        recordingKeepError: null,
        pendingDeactivateConfirm: false,
        deactivating: false,
        deactivateError: null,
        reactivating: false,
        reactivateSource: 'banner',
        reactivateError: null,
        reactivateFailedChecks: [],
        preflightRefreshing: false,
        preflightError: null,
        preflightAt: '',
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
        saved: null,
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
    },
    health: {
        loaded: false,
        loading: false,
        error: null,
        checkedAt: '',
        signals: {},
        attention: []
    },
    outbound: {
        loaded: false,
        loading: false,
        loadError: null,
        noticeOn: false,
        noticeText: '',
        noticeVersion: 0,
        defaultText: '',
        maxLength: 300,
        appSid: '',
        functionUrl: '',
        prevVoiceUrl: '',
        publishedAt: '',
        publishedCodeVersion: '',
        codeVersion: '',
        needsRepublish: false,
        published: false,
        pending: false,
        voiceUrlMatches: null,
        driftVoiceUrl: 'unknown',
        publishedNoticeVersion: 0,
        changesPending: false,
        allowedPrefixes: '',
        allowedSource: '',
        publishedAllowedPrefixes: '',
        allowListPending: false,
        functionExists: null,
        functionMessage: '',
        savedNoticeOn: false,
        savedNoticeText: '',
        saving: false,
        publishing: false,
        unpublishing: false,
        publishRunning: false,
        confirmUnpublish: false,
        error: null,
        steps: null
    },
    credentials: {
        editing: false,
        apiKeySid: '',
        apiSecretId: '',
        saving: false,
        error: null,
        failedChecks: [],
        saved: false
    }
};

export default initialState;
