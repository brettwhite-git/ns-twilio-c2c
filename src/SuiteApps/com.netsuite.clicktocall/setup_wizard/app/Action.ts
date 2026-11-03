/**
 * Action types + action creators for the wizard + console Store.
 *
 * Phase 1 (2026-05-28) — expanded from the D-Store-2 minimum (4 dispatch
 * actions) to the full action surface needed by Phases 3-6. Subsequent
 * phases wire callers to dispatch these actions instead of mutating the
 * legacy STATE singleton directly.
 */

import type {
    AppState,
    Mode,
    SectionName,
    Step2State,
    Step3State,
    Step4State,
    Step5State,
    ConsoleState,
    CheckResult,
    CredentialsState,
    PhoneDraft,
    InboundPublishError,
    InboundPublishResult,
    InboundRoute,
    InboundEmployee,
    InboundSettings,
    OutboundSnapshot,
    OutboundStep,
    PresenceRow,
    HealthSignal,
    HealthAttentionItem
} from './InitialState';

// ─────────────────────────────────────────────────────────────────────
// ActionType — Symbol-keyed enum
// ─────────────────────────────────────────────────────────────────────

const ActionType = {
    // App-level dispatch
    SET_MODE: Symbol('setMode'),
    SET_CURRENT_STEP: Symbol('setCurrentStep'),
    SET_SELECTED_SECTION: Symbol('setSelectedSection'),
    SET_RAIL_VISIBLE: Symbol('setRailVisible'),
    SET_MOUNT_ROUTING: Symbol('setMountRouting'),
    SET_WIZARD_SAVING: Symbol('setWizardSaving'),

    // Step form field changes
    STEP2_FIELD_CHANGE: Symbol('step2FieldChange'),
    STEP3_FIELD_CHANGE: Symbol('step3FieldChange'),
    STEP4_FIELD_CHANGE: Symbol('step4FieldChange'),
    STEP5_FIELD_CHANGE: Symbol('step5FieldChange'),

    // Prereqs (Step 1)
    PREREQS_LOAD_START: Symbol('prereqsLoadStart'),
    PREREQS_LOAD_SUCCESS: Symbol('prereqsLoadSuccess'),
    PREREQS_LOAD_FAILURE: Symbol('prereqsLoadFailure'),

    // Console common loaders
    CONSOLE_LOAD_START: Symbol('consoleLoadStart'),
    CONSOLE_LOAD_SUCCESS: Symbol('consoleLoadSuccess'),
    CONSOLE_LOAD_FAILURE: Symbol('consoleLoadFailure'),
    CONSOLE_DRIFT_SET: Symbol('consoleDriftSet'),
    CONSOLE_PATCH: Symbol('consolePatch'),

    // Phones section
    PHONES_LOAD_START: Symbol('phonesLoadStart'),
    PHONES_LOAD_SUCCESS: Symbol('phonesLoadSuccess'),
    PHONES_LOAD_FAILURE: Symbol('phonesLoadFailure'),
    PHONES_DRAFT_SET: Symbol('phonesDraftSet'),
    PHONES_EDIT_ROW: Symbol('phonesEditRow'),
    PHONES_ROW_SAVE: Symbol('phonesRowSave'),

    // Inbound calls section
    INBOUND_LOAD_START: Symbol('inboundLoadStart'),
    INBOUND_LOAD_SUCCESS: Symbol('inboundLoadSuccess'),
    INBOUND_LOAD_FAILURE: Symbol('inboundLoadFailure'),
    INBOUND_FIELD_CHANGE: Symbol('inboundFieldChange'),
    INBOUND_SAVE: Symbol('inboundSave'),
    INBOUND_PUBLISH: Symbol('inboundPublish'),
    INBOUND_ROUTING_UPDATE: Symbol('inboundRoutingUpdate'),
    INBOUND_ROUTES_SET: Symbol('inboundRoutesSet'),

    // Rep phone presence
    PRESENCE_LOAD_START: Symbol('presenceLoadStart'),
    PRESENCE_LOAD_SUCCESS: Symbol('presenceLoadSuccess'),
    PRESENCE_LOAD_FAILURE: Symbol('presenceLoadFailure'),

    // Health read model (wizardLoadHealth)
    HEALTH_LOAD_START: Symbol('healthLoadStart'),
    HEALTH_LOAD_SUCCESS: Symbol('healthLoadSuccess'),
    HEALTH_LOAD_FAILURE: Symbol('healthLoadFailure'),

    // Outbound recording notice (Voice page)
    OUTBOUND_LOAD_START: Symbol('outboundLoadStart'),
    OUTBOUND_LOAD_SUCCESS: Symbol('outboundLoadSuccess'),
    OUTBOUND_LOAD_FAILURE: Symbol('outboundLoadFailure'),
    OUTBOUND_FIELD_CHANGE: Symbol('outboundFieldChange'),
    OUTBOUND_REQUEST: Symbol('outboundRequest'),
    OUTBOUND_CONFIRM_UNPUBLISH: Symbol('outboundConfirmUnpublish'),

    // Voice section
    VOICE_FIELD_EDIT: Symbol('voiceFieldEdit'),
    VOICE_FIELD_SAVE: Symbol('voiceFieldSave'),

    // Deactivate / Reactivate flow
    DEACTIVATE_REQUEST: Symbol('deactivateRequest'),
    DEACTIVATE_START: Symbol('deactivateStart'),
    DEACTIVATE_SUCCESS: Symbol('deactivateSuccess'),
    DEACTIVATE_FAILURE: Symbol('deactivateFailure'),
    REACTIVATE_REQUEST: Symbol('reactivateRequest'),
    REACTIVATE_SUCCESS: Symbol('reactivateSuccess'),
    REACTIVATE_FAILURE: Symbol('reactivateFailure'),

    // Credentials page (API key rotation)
    CREDENTIALS_UPDATE: Symbol('credentialsUpdate'),

    // Cross-section error surface
    ACTION_ERROR_SET: Symbol('actionErrorSet')
} as const;

// ─────────────────────────────────────────────────────────────────────
// Action payload interfaces
// ─────────────────────────────────────────────────────────────────────

interface SetModeAction {
    type: typeof ActionType.SET_MODE;
    payload: Mode;
}

interface SetCurrentStepAction {
    type: typeof ActionType.SET_CURRENT_STEP;
    payload: number;
}

interface SetSelectedSectionAction {
    type: typeof ActionType.SET_SELECTED_SECTION;
    payload: SectionName;
}

interface SetRailVisibleAction {
    type: typeof ActionType.SET_RAIL_VISIBLE;
    payload: boolean;
}

interface SetMountRoutingAction {
    type: typeof ActionType.SET_MOUNT_ROUTING;
    payload: boolean;
}

interface SetWizardSavingAction {
    type: typeof ActionType.SET_WIZARD_SAVING;
    payload: boolean;
}

interface Step2FieldChangeAction {
    type: typeof ActionType.STEP2_FIELD_CHANGE;
    payload: { field: keyof Step2State; value: string };
}

interface Step3FieldChangeAction {
    type: typeof ActionType.STEP3_FIELD_CHANGE;
    payload: { field: keyof Step3State; value: unknown };
}

interface Step4FieldChangeAction {
    type: typeof ActionType.STEP4_FIELD_CHANGE;
    payload: { field: keyof Step4State; value: unknown };
}

interface Step5FieldChangeAction {
    type: typeof ActionType.STEP5_FIELD_CHANGE;
    payload: { field: keyof Step5State; value: unknown };
}

interface PrereqsLoadStartAction {
    type: typeof ActionType.PREREQS_LOAD_START;
    payload: null;
}

interface PrereqsLoadSuccessAction {
    type: typeof ActionType.PREREQS_LOAD_SUCCESS;
    payload: { checks: unknown[] };
}

interface PrereqsLoadFailureAction {
    type: typeof ActionType.PREREQS_LOAD_FAILURE;
    payload: { error: string };
}

interface ConsoleLoadStartAction {
    type: typeof ActionType.CONSOLE_LOAD_START;
    payload: null;
}

interface ConsoleLoadSuccessAction {
    type: typeof ActionType.CONSOLE_LOAD_SUCCESS;
    payload: Partial<ConsoleState>;
}

interface ConsoleLoadFailureAction {
    type: typeof ActionType.CONSOLE_LOAD_FAILURE;
    payload: { error: string };
}

interface ConsoleDriftSetAction {
    type: typeof ActionType.CONSOLE_DRIFT_SET;
    payload: unknown;
}

/** Merge fields into console state (does not touch console.loading). */
interface ConsolePatchAction {
    type: typeof ActionType.CONSOLE_PATCH;
    payload: Partial<ConsoleState>;
}

interface PhonesLoadStartAction {
    type: typeof ActionType.PHONES_LOAD_START;
    payload: null;
}

interface PhonesLoadSuccessAction {
    type: typeof ActionType.PHONES_LOAD_SUCCESS;
    payload: {
        employees?: unknown[] | null;
        numbers?: unknown[] | null;
        byPhone?: unknown[] | null;
        /** Twilio number list error ('' / null = none). */
        listError?: string | null;
        hasMore?: boolean;
        /** Employee / assignment load error. */
        error?: string | null;
    };
}

interface PhonesLoadFailureAction {
    type: typeof ActionType.PHONES_LOAD_FAILURE;
    payload: { error: string };
}

interface PhonesDraftSetAction {
    type: typeof ActionType.PHONES_DRAFT_SET;
    /** draft null = discard the row's edits (Cancel). */
    payload: { phoneSid: string; draft: PhoneDraft | null };
}

interface PhonesEditRowAction {
    type: typeof ActionType.PHONES_EDIT_ROW;
    /** The row to open in the editor, or null to close it (drafts dropped). */
    payload: { phoneSid: string | null };
}

/** One row save: start (row busy) → success (draft cleared) / failure (error kept). */
export interface PhonesRowSavePayload {
    phoneSid: string;
    phase: 'start' | 'success' | 'failure';
    error?: string | null;
    /** Inbound routing errors from the save's `routing` result. */
    routingErrors?: InboundPublishError[];
}

interface PhonesRowSaveAction {
    type: typeof ActionType.PHONES_ROW_SAVE;
    payload: PhonesRowSavePayload;
}

export interface InboundLoadPayload extends InboundSettings {
    flowSid: string;
    publishedAt: string;
    routes: InboundRoute[];
    employees: InboundEmployee[];
}

interface InboundLoadStartAction {
    type: typeof ActionType.INBOUND_LOAD_START;
    payload: null;
}

interface InboundLoadSuccessAction {
    type: typeof ActionType.INBOUND_LOAD_SUCCESS;
    payload: InboundLoadPayload;
}

interface InboundLoadFailureAction {
    type: typeof ActionType.INBOUND_LOAD_FAILURE;
    payload: { error: string };
}

interface InboundFieldChangeAction {
    type: typeof ActionType.INBOUND_FIELD_CHANGE;
    payload: Partial<InboundSettings>;
}

interface InboundSaveAction {
    type: typeof ActionType.INBOUND_SAVE;
    payload: {
        phase: 'start' | 'success' | 'failure';
        settings?: InboundSettings;
        publish?: InboundPublishResult;
        error?: string | null;
    };
}

interface InboundPublishAction {
    type: typeof ActionType.INBOUND_PUBLISH;
    payload: {
        phase: 'start' | 'success' | 'failure';
        publish?: InboundPublishResult;
        error?: string | null;
    };
}

interface InboundRoutingUpdateAction {
    type: typeof ActionType.INBOUND_ROUTING_UPDATE;
    payload: InboundPublishResult;
}

/** Fresh routing table (after a Phones & reps save); leaves form edits alone. */
export interface InboundRoutesPayload {
    routes: InboundRoute[];
    flowSid?: string;
    publishedAt?: string;
}

interface InboundRoutesSetAction {
    type: typeof ActionType.INBOUND_ROUTES_SET;
    payload: InboundRoutesPayload;
}

interface PresenceLoadStartAction {
    type: typeof ActionType.PRESENCE_LOAD_START;
    payload: null;
}

interface PresenceLoadSuccessAction {
    type: typeof ActionType.PRESENCE_LOAD_SUCCESS;
    payload: { items: PresenceRow[]; clockSkewMs: number };
}

interface PresenceLoadFailureAction {
    type: typeof ActionType.PRESENCE_LOAD_FAILURE;
    payload: { error: string };
}

export interface HealthLoadPayload {
    checkedAt: string;
    signals: Record<string, HealthSignal>;
    attention: HealthAttentionItem[];
}

interface HealthLoadStartAction {
    type: typeof ActionType.HEALTH_LOAD_START;
    payload: null;
}

interface HealthLoadSuccessAction {
    type: typeof ActionType.HEALTH_LOAD_SUCCESS;
    payload: HealthLoadPayload;
}

interface HealthLoadFailureAction {
    type: typeof ActionType.HEALTH_LOAD_FAILURE;
    payload: { error: string };
}

interface OutboundLoadStartAction {
    type: typeof ActionType.OUTBOUND_LOAD_START;
    payload: null;
}

interface OutboundLoadSuccessAction {
    type: typeof ActionType.OUTBOUND_LOAD_SUCCESS;
    payload: OutboundSnapshot;
}

interface OutboundLoadFailureAction {
    type: typeof ActionType.OUTBOUND_LOAD_FAILURE;
    payload: { error: string };
}

/** Form values of the outbound notice (edited in place; sent by Save & publish). */
export interface OutboundFields {
    noticeOn: boolean;
    noticeText: string;
}

interface OutboundFieldChangeAction {
    type: typeof ActionType.OUTBOUND_FIELD_CHANGE;
    payload: Partial<OutboundFields>;
}

/**
 * One server round trip of the outbound notice: 'start' sets the busy
 * flag for `op`; 'done' clears it and applies whatever came back
 * (a new snapshot, the step list, an error).
 */
export interface OutboundRequestPayload {
    op: 'save' | 'publish' | 'unpublish';
    phase: 'start' | 'done';
    snapshot?: OutboundSnapshot;
    /** Publish only: the Twilio build is still running ("Check again"). */
    pending?: boolean;
    steps?: OutboundStep[];
    error?: string | null;
}

interface OutboundRequestAction {
    type: typeof ActionType.OUTBOUND_REQUEST;
    payload: OutboundRequestPayload;
}

interface OutboundConfirmUnpublishAction {
    type: typeof ActionType.OUTBOUND_CONFIRM_UNPUBLISH;
    payload: boolean;
}

interface VoiceFieldEditAction {
    type: typeof ActionType.VOICE_FIELD_EDIT;
    payload: {
        field: ConsoleState['voiceEditing'];
        pendingValue?: string | null;
    };
}

interface VoiceFieldSaveAction {
    type: typeof ActionType.VOICE_FIELD_SAVE;
    payload: {
        phase: 'start' | 'success' | 'failure';
        field?: ConsoleState['voiceEditing'];
        value?: unknown;
        error?: string | null;
    };
}

interface DeactivateRequestAction {
    type: typeof ActionType.DEACTIVATE_REQUEST;
    payload: null;
}

interface DeactivateStartAction {
    type: typeof ActionType.DEACTIVATE_START;
    payload: null;
}

interface DeactivateSuccessAction {
    type: typeof ActionType.DEACTIVATE_SUCCESS;
    payload: null;
}

interface DeactivateFailureAction {
    type: typeof ActionType.DEACTIVATE_FAILURE;
    payload: { error: string };
}

interface ReactivateRequestAction {
    type: typeof ActionType.REACTIVATE_REQUEST;
    payload: { source: ConsoleState['reactivateSource'] };
}

interface ReactivateSuccessAction {
    type: typeof ActionType.REACTIVATE_SUCCESS;
    payload: null;
}

interface ReactivateFailureAction {
    type: typeof ActionType.REACTIVATE_FAILURE;
    payload: { error: string; failedChecks: CheckResult[] };
}

interface CredentialsUpdateAction {
    type: typeof ActionType.CREDENTIALS_UPDATE;
    payload: Partial<CredentialsState>;
}

interface ActionErrorSetAction {
    type: typeof ActionType.ACTION_ERROR_SET;
    payload: string | null;
}

/** Union of every action the reducer handles. */
export type AppAction =
    | SetModeAction
    | SetCurrentStepAction
    | SetSelectedSectionAction
    | SetRailVisibleAction
    | SetMountRoutingAction
    | SetWizardSavingAction
    | Step2FieldChangeAction
    | Step3FieldChangeAction
    | Step4FieldChangeAction
    | Step5FieldChangeAction
    | PrereqsLoadStartAction
    | PrereqsLoadSuccessAction
    | PrereqsLoadFailureAction
    | ConsoleLoadStartAction
    | ConsoleLoadSuccessAction
    | ConsoleLoadFailureAction
    | ConsoleDriftSetAction
    | ConsolePatchAction
    | PhonesLoadStartAction
    | PhonesLoadSuccessAction
    | PhonesLoadFailureAction
    | PhonesDraftSetAction
    | PhonesEditRowAction
    | PhonesRowSaveAction
    | InboundLoadStartAction
    | InboundLoadSuccessAction
    | InboundLoadFailureAction
    | InboundFieldChangeAction
    | InboundSaveAction
    | InboundPublishAction
    | InboundRoutingUpdateAction
    | InboundRoutesSetAction
    | PresenceLoadStartAction
    | PresenceLoadSuccessAction
    | PresenceLoadFailureAction
    | HealthLoadStartAction
    | HealthLoadSuccessAction
    | HealthLoadFailureAction
    | OutboundLoadStartAction
    | OutboundLoadSuccessAction
    | OutboundLoadFailureAction
    | OutboundFieldChangeAction
    | OutboundRequestAction
    | OutboundConfirmUnpublishAction
    | VoiceFieldEditAction
    | VoiceFieldSaveAction
    | DeactivateRequestAction
    | DeactivateStartAction
    | DeactivateSuccessAction
    | DeactivateFailureAction
    | ReactivateRequestAction
    | ReactivateSuccessAction
    | ReactivateFailureAction
    | CredentialsUpdateAction
    | ActionErrorSetAction;

// ─────────────────────────────────────────────────────────────────────
// Action creators
// ─────────────────────────────────────────────────────────────────────

const Action = {
    setMode(mode: Mode): SetModeAction {
        return { type: ActionType.SET_MODE, payload: mode };
    },
    setCurrentStep(step: number): SetCurrentStepAction {
        return { type: ActionType.SET_CURRENT_STEP, payload: step };
    },
    setSelectedSection(section: SectionName): SetSelectedSectionAction {
        return { type: ActionType.SET_SELECTED_SECTION, payload: section };
    },
    setRailVisible(visible: boolean): SetRailVisibleAction {
        return { type: ActionType.SET_RAIL_VISIBLE, payload: visible };
    },
    setMountRouting(routing: boolean): SetMountRoutingAction {
        return { type: ActionType.SET_MOUNT_ROUTING, payload: routing };
    },
    setWizardSaving(saving: boolean): SetWizardSavingAction {
        return { type: ActionType.SET_WIZARD_SAVING, payload: saving };
    },

    step2FieldChange(field: keyof Step2State, value: string): Step2FieldChangeAction {
        return { type: ActionType.STEP2_FIELD_CHANGE, payload: { field, value } };
    },
    step3FieldChange(field: keyof Step3State, value: unknown): Step3FieldChangeAction {
        return { type: ActionType.STEP3_FIELD_CHANGE, payload: { field, value } };
    },
    step4FieldChange(field: keyof Step4State, value: unknown): Step4FieldChangeAction {
        return { type: ActionType.STEP4_FIELD_CHANGE, payload: { field, value } };
    },
    step5FieldChange(field: keyof Step5State, value: unknown): Step5FieldChangeAction {
        return { type: ActionType.STEP5_FIELD_CHANGE, payload: { field, value } };
    },

    prereqsLoadStart(): PrereqsLoadStartAction {
        return { type: ActionType.PREREQS_LOAD_START, payload: null };
    },
    prereqsLoadSuccess(checks: unknown[]): PrereqsLoadSuccessAction {
        return { type: ActionType.PREREQS_LOAD_SUCCESS, payload: { checks } };
    },
    prereqsLoadFailure(error: string): PrereqsLoadFailureAction {
        return { type: ActionType.PREREQS_LOAD_FAILURE, payload: { error } };
    },

    consoleLoadStart(): ConsoleLoadStartAction {
        return { type: ActionType.CONSOLE_LOAD_START, payload: null };
    },
    consoleLoadSuccess(slice: Partial<ConsoleState>): ConsoleLoadSuccessAction {
        return { type: ActionType.CONSOLE_LOAD_SUCCESS, payload: slice };
    },
    consoleLoadFailure(error: string): ConsoleLoadFailureAction {
        return { type: ActionType.CONSOLE_LOAD_FAILURE, payload: { error } };
    },
    consoleDriftSet(drift: unknown): ConsoleDriftSetAction {
        return { type: ActionType.CONSOLE_DRIFT_SET, payload: drift };
    },
    consolePatch(patch: Partial<ConsoleState>): ConsolePatchAction {
        return { type: ActionType.CONSOLE_PATCH, payload: patch };
    },

    phonesLoadStart(): PhonesLoadStartAction {
        return { type: ActionType.PHONES_LOAD_START, payload: null };
    },
    phonesLoadSuccess(slice: PhonesLoadSuccessAction['payload']): PhonesLoadSuccessAction {
        return { type: ActionType.PHONES_LOAD_SUCCESS, payload: slice };
    },
    phonesLoadFailure(error: string): PhonesLoadFailureAction {
        return { type: ActionType.PHONES_LOAD_FAILURE, payload: { error } };
    },
    phonesDraftSet(phoneSid: string, draft: PhoneDraft | null): PhonesDraftSetAction {
        return { type: ActionType.PHONES_DRAFT_SET, payload: { phoneSid, draft } };
    },
    phonesEditRow(phoneSid: string | null): PhonesEditRowAction {
        return { type: ActionType.PHONES_EDIT_ROW, payload: { phoneSid } };
    },
    phonesRowSave(payload: PhonesRowSavePayload): PhonesRowSaveAction {
        return { type: ActionType.PHONES_ROW_SAVE, payload };
    },

    inboundLoadStart(): InboundLoadStartAction {
        return { type: ActionType.INBOUND_LOAD_START, payload: null };
    },
    inboundLoadSuccess(payload: InboundLoadPayload): InboundLoadSuccessAction {
        return { type: ActionType.INBOUND_LOAD_SUCCESS, payload };
    },
    inboundLoadFailure(error: string): InboundLoadFailureAction {
        return { type: ActionType.INBOUND_LOAD_FAILURE, payload: { error } };
    },
    inboundFieldChange(changes: Partial<InboundSettings>): InboundFieldChangeAction {
        return { type: ActionType.INBOUND_FIELD_CHANGE, payload: changes };
    },
    inboundSave(payload: InboundSaveAction['payload']): InboundSaveAction {
        return { type: ActionType.INBOUND_SAVE, payload };
    },
    inboundPublish(payload: InboundPublishAction['payload']): InboundPublishAction {
        return { type: ActionType.INBOUND_PUBLISH, payload };
    },
    /**
     * A Phones & reps save republished routing. Copies the new
     * flowSid/publishedAt (the routes refresh with inboundRoutesSet;
     * unsaved Inbound form edits are kept).
     */
    inboundRoutingUpdate(publish: InboundPublishResult): InboundRoutingUpdateAction {
        return { type: ActionType.INBOUND_ROUTING_UPDATE, payload: publish };
    },
    inboundRoutesSet(payload: InboundRoutesPayload): InboundRoutesSetAction {
        return { type: ActionType.INBOUND_ROUTES_SET, payload };
    },

    presenceLoadStart(): PresenceLoadStartAction {
        return { type: ActionType.PRESENCE_LOAD_START, payload: null };
    },
    presenceLoadSuccess(items: PresenceRow[], clockSkewMs: number): PresenceLoadSuccessAction {
        return { type: ActionType.PRESENCE_LOAD_SUCCESS, payload: { items, clockSkewMs } };
    },
    presenceLoadFailure(error: string): PresenceLoadFailureAction {
        return { type: ActionType.PRESENCE_LOAD_FAILURE, payload: { error } };
    },

    healthLoadStart(): HealthLoadStartAction {
        return { type: ActionType.HEALTH_LOAD_START, payload: null };
    },
    healthLoadSuccess(payload: HealthLoadPayload): HealthLoadSuccessAction {
        return { type: ActionType.HEALTH_LOAD_SUCCESS, payload };
    },
    healthLoadFailure(error: string): HealthLoadFailureAction {
        return { type: ActionType.HEALTH_LOAD_FAILURE, payload: { error } };
    },

    outboundLoadStart(): OutboundLoadStartAction {
        return { type: ActionType.OUTBOUND_LOAD_START, payload: null };
    },
    outboundLoadSuccess(snapshot: OutboundSnapshot): OutboundLoadSuccessAction {
        return { type: ActionType.OUTBOUND_LOAD_SUCCESS, payload: snapshot };
    },
    outboundLoadFailure(error: string): OutboundLoadFailureAction {
        return { type: ActionType.OUTBOUND_LOAD_FAILURE, payload: { error } };
    },
    outboundFieldChange(changes: Partial<OutboundFields>): OutboundFieldChangeAction {
        return { type: ActionType.OUTBOUND_FIELD_CHANGE, payload: changes };
    },
    outboundRequest(payload: OutboundRequestPayload): OutboundRequestAction {
        return { type: ActionType.OUTBOUND_REQUEST, payload };
    },
    outboundConfirmUnpublish(open: boolean): OutboundConfirmUnpublishAction {
        return { type: ActionType.OUTBOUND_CONFIRM_UNPUBLISH, payload: open };
    },

    voiceFieldEdit(
        field: ConsoleState['voiceEditing'],
        pendingValue: string | null = null
    ): VoiceFieldEditAction {
        return { type: ActionType.VOICE_FIELD_EDIT, payload: { field, pendingValue } };
    },
    voiceFieldSave(payload: VoiceFieldSaveAction['payload']): VoiceFieldSaveAction {
        return { type: ActionType.VOICE_FIELD_SAVE, payload };
    },

    deactivateRequest(): DeactivateRequestAction {
        return { type: ActionType.DEACTIVATE_REQUEST, payload: null };
    },
    deactivateStart(): DeactivateStartAction {
        return { type: ActionType.DEACTIVATE_START, payload: null };
    },
    deactivateSuccess(): DeactivateSuccessAction {
        return { type: ActionType.DEACTIVATE_SUCCESS, payload: null };
    },
    deactivateFailure(error: string): DeactivateFailureAction {
        return { type: ActionType.DEACTIVATE_FAILURE, payload: { error } };
    },
    reactivateRequest(source: ConsoleState['reactivateSource']): ReactivateRequestAction {
        return { type: ActionType.REACTIVATE_REQUEST, payload: { source } };
    },
    reactivateSuccess(): ReactivateSuccessAction {
        return { type: ActionType.REACTIVATE_SUCCESS, payload: null };
    },
    reactivateFailure(error: string, failedChecks: CheckResult[] = []): ReactivateFailureAction {
        return { type: ActionType.REACTIVATE_FAILURE, payload: { error, failedChecks } };
    },

    credentialsUpdate(patch: Partial<CredentialsState>): CredentialsUpdateAction {
        return { type: ActionType.CREDENTIALS_UPDATE, payload: patch };
    },

    actionErrorSet(error: string | null): ActionErrorSetAction {
        return { type: ActionType.ACTION_ERROR_SET, payload: error };
    }
} as const;

export { Action, ActionType };
export type { AppState };
