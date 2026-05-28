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
    ConsoleState
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

    // Step form field changes
    STEP2_FIELD_CHANGE: Symbol('step2FieldChange'),
    STEP3_FIELD_CHANGE: Symbol('step3FieldChange'),
    STEP4_FIELD_CHANGE: Symbol('step4FieldChange'),

    // Prereqs (Step 1)
    PREREQS_LOAD_START: Symbol('prereqsLoadStart'),
    PREREQS_LOAD_SUCCESS: Symbol('prereqsLoadSuccess'),
    PREREQS_LOAD_FAILURE: Symbol('prereqsLoadFailure'),

    // Console common loaders
    CONSOLE_LOAD_START: Symbol('consoleLoadStart'),
    CONSOLE_LOAD_SUCCESS: Symbol('consoleLoadSuccess'),
    CONSOLE_LOAD_FAILURE: Symbol('consoleLoadFailure'),
    CONSOLE_DRIFT_SET: Symbol('consoleDriftSet'),

    // Phones section
    PHONES_LOAD_START: Symbol('phonesLoadStart'),
    PHONES_LOAD_SUCCESS: Symbol('phonesLoadSuccess'),
    PHONES_ASSIGNMENT_SAVE: Symbol('phonesAssignmentSave'),

    // Voice section
    VOICE_FIELD_EDIT: Symbol('voiceFieldEdit'),
    VOICE_FIELD_SAVE: Symbol('voiceFieldSave'),

    // Deactivate / Reactivate flow
    DEACTIVATE_REQUEST: Symbol('deactivateRequest'),
    DEACTIVATE_SUCCESS: Symbol('deactivateSuccess'),
    DEACTIVATE_FAILURE: Symbol('deactivateFailure'),
    REACTIVATE_REQUEST: Symbol('reactivateRequest'),
    REACTIVATE_SUCCESS: Symbol('reactivateSuccess'),
    REACTIVATE_FAILURE: Symbol('reactivateFailure'),

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
    };
}

interface PhonesAssignmentSaveAction {
    type: typeof ActionType.PHONES_ASSIGNMENT_SAVE;
    payload: {
        phoneSid: string;
        saving?: boolean;
        assignment?: unknown;
        error?: string | null;
    };
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
    payload: null;
}

interface ReactivateSuccessAction {
    type: typeof ActionType.REACTIVATE_SUCCESS;
    payload: null;
}

interface ReactivateFailureAction {
    type: typeof ActionType.REACTIVATE_FAILURE;
    payload: { error: string };
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
    | Step2FieldChangeAction
    | Step3FieldChangeAction
    | Step4FieldChangeAction
    | PrereqsLoadStartAction
    | PrereqsLoadSuccessAction
    | PrereqsLoadFailureAction
    | ConsoleLoadStartAction
    | ConsoleLoadSuccessAction
    | ConsoleLoadFailureAction
    | ConsoleDriftSetAction
    | PhonesLoadStartAction
    | PhonesLoadSuccessAction
    | PhonesAssignmentSaveAction
    | VoiceFieldEditAction
    | VoiceFieldSaveAction
    | DeactivateRequestAction
    | DeactivateSuccessAction
    | DeactivateFailureAction
    | ReactivateRequestAction
    | ReactivateSuccessAction
    | ReactivateFailureAction
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

    step2FieldChange(field: keyof Step2State, value: string): Step2FieldChangeAction {
        return { type: ActionType.STEP2_FIELD_CHANGE, payload: { field, value } };
    },
    step3FieldChange(field: keyof Step3State, value: unknown): Step3FieldChangeAction {
        return { type: ActionType.STEP3_FIELD_CHANGE, payload: { field, value } };
    },
    step4FieldChange(field: keyof Step4State, value: unknown): Step4FieldChangeAction {
        return { type: ActionType.STEP4_FIELD_CHANGE, payload: { field, value } };
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

    phonesLoadStart(): PhonesLoadStartAction {
        return { type: ActionType.PHONES_LOAD_START, payload: null };
    },
    phonesLoadSuccess(slice: PhonesLoadSuccessAction['payload']): PhonesLoadSuccessAction {
        return { type: ActionType.PHONES_LOAD_SUCCESS, payload: slice };
    },
    phonesAssignmentSave(
        payload: PhonesAssignmentSaveAction['payload']
    ): PhonesAssignmentSaveAction {
        return { type: ActionType.PHONES_ASSIGNMENT_SAVE, payload };
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
    deactivateSuccess(): DeactivateSuccessAction {
        return { type: ActionType.DEACTIVATE_SUCCESS, payload: null };
    },
    deactivateFailure(error: string): DeactivateFailureAction {
        return { type: ActionType.DEACTIVATE_FAILURE, payload: { error } };
    },
    reactivateRequest(): ReactivateRequestAction {
        return { type: ActionType.REACTIVATE_REQUEST, payload: null };
    },
    reactivateSuccess(): ReactivateSuccessAction {
        return { type: ActionType.REACTIVATE_SUCCESS, payload: null };
    },
    reactivateFailure(error: string): ReactivateFailureAction {
        return { type: ActionType.REACTIVATE_FAILURE, payload: { error } };
    },

    actionErrorSet(error: string | null): ActionErrorSetAction {
        return { type: ActionType.ACTION_ERROR_SET, payload: error };
    }
} as const;

export { Action, ActionType };
export type { AppState };
