/**
 * One saved Twilio setting with a VIEW / EDIT switch (Change → Dropdown
 * from the live Twilio list → Save / Cancel). Used by Outbound calls
 * (TwiML App, default caller ID) and Transcripts & AI (Intelligence
 * service). One field edits at a time (console.voiceEditing); the save
 * sends only that field (effects/voice saveVoiceField, partial: true).
 * The dropdown shows exactly the value Save sends.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {loadVoiceLists, saveVoiceField} from '../../app/effects/voice';
import type {AppState, ConsoleState, VoiceListKey} from '../../app/InitialState';
import {formatPhone} from './formatPhone';
import {friendlyError} from './friendlyError';

export type VoiceField = NonNullable<ConsoleState['voiceEditing']>;

interface TwilioListItem {
    sid?: string;
    phoneNumber?: string;
    friendlyName?: string;
}

export interface VoiceSnapshot {
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

export interface VoiceFieldSpec {
    field: VoiceField;
    label: string;
    helpText: string;
    docUrl?: string;
    allowEmpty?: boolean;
}

const TWILIO_DOCS = {
    twimlApp: 'https://www.twilio.com/docs/usage/api/applications',
    phoneNumber: 'https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource',
    intelService: 'https://www.twilio.com/docs/voice/intelligence'
};

export const VOICE_FIELD_SPECS: Record<VoiceField, VoiceFieldSpec> = {
    twimlAppSid: {
        field: 'twimlAppSid',
        label: 'TwiML Application',
        helpText: 'Outbound calls use this app. When you publish the recording ' +
            'notice, the console points its Voice URL at a Twilio Function in your account.',
        docUrl: TWILIO_DOCS.twimlApp
    },
    phoneNumber: {
        field: 'phoneNumber',
        label: 'Default caller ID',
        helpText: 'Reps who ring for no number call out from this number. A rep ' +
            'who rings for a number calls out from that number (Phones & reps).',
        docUrl: TWILIO_DOCS.phoneNumber
    },
    intelServiceSid: {
        field: 'intelServiceSid',
        label: 'Intelligence service',
        helpText: 'Twilio Conversational Intelligence, in your Twilio account. ' +
            'It turns call recordings into transcripts.',
        docUrl: TWILIO_DOCS.intelService,
        allowEmpty: true
    }
};

const listKeyFor = (field: VoiceField): VoiceListKey => {
    switch (field) {
        case 'twimlAppSid': return 'twimlApps';
        case 'phoneNumber': return 'phoneNumbers';
        case 'intelServiceSid': return 'intelServices';
    }
};

export const startVoiceEdit = (spec: VoiceFieldSpec): void => {
    const snap = ((store.getState() as AppState).console.snapshot || {}) as VoiceSnapshot;
    store.dispatch(Action.voiceFieldEdit(spec.field, snap[spec.field] || ''));
    loadVoiceLists();
};

const cancelVoiceEdit = (): void => {
    store.dispatch(Action.voiceFieldEdit(null, null));
};

const onPendingChange = (args: { value?: string }): void => {
    const value = (args && args.value) || null;
    store.dispatch(Action.voiceFieldEdit((store.getState() as AppState).console.voiceEditing, value));
};

/** Dropdown items for a field's Twilio list. */
const optionsFor = (field: VoiceField, list: TwilioListItem[]): Array<{ value: string; label: string }> =>
    list.map((it) => {
        if (field === 'phoneNumber') {
            return {
                value: it.phoneNumber || '',
                label: formatPhone(it.phoneNumber) + (it.friendlyName ? '  —  ' + it.friendlyName : '')
            };
        }
        return {
            value: it.sid || '',
            label: (it.friendlyName || '(unnamed)') + (it.sid ? '  [' + it.sid + ']' : '')
        };
    });

/**
 * The value the dropdown shows and Save sends (always the same): the
 * pending value when it is in the list; else none for the optional
 * field, or the first item for a required one.
 */
const effectiveValue = (
    spec: VoiceFieldSpec,
    options: Array<{ value: string }>,
    pending: string | null
): string | null => {
    if (pending && options.some((o) => o.value === pending)) return pending;
    if (spec.allowEmpty) return null;
    return options.length > 0 ? options[0].value : null;
};

const saveVoiceEdit = (spec: VoiceFieldSpec): void => {
    const c = (store.getState() as AppState).console;
    const list = c.voiceLists[listKeyFor(spec.field)] as TwilioListItem[] | null;
    if (!list) return;
    const value = effectiveValue(spec, optionsFor(spec.field, list), c.voicePendingValue);
    if (value) {
        saveVoiceField(spec.field, value);
    } else if (spec.allowEmpty) {
        // "(none)": clear the optional Intelligence service.
        saveVoiceField(spec.field, '');
    }
};

/** Saved value as text (VIEW), or the Twilio picker (EDIT). */
export function voiceValueControl(spec: VoiceFieldSpec, viewText?: string): unknown {
    const c = (store.getState() as AppState).console;
    const snap = (c.snapshot || {}) as VoiceSnapshot;

    if (c.voiceEditing !== spec.field) {
        const value = snap[spec.field];
        if (value) {
            return new component.Text({
                text: viewText || (spec.field === 'phoneNumber' ? formatPhone(value) : value)
            });
        }
        return new component.Text({ text: '(not set)', type: component.Text.Type.WEAK });
    }

    const listKey = listKeyFor(spec.field);
    const list = c.voiceLists[listKey] as TwilioListItem[] | null;
    if (list === null || c.voiceListsLoading) {
        return new component.Loader({ label: 'Loading from Twilio…', indeterminate: true } as never);
    }
    const listError = c.voiceListErrors[listKey];
    if (listError) {
        return new component.Text({
            text: '✕ The Twilio list did not load: ' + friendlyError(listError),
            type: component.Text.Type.STRONG,
            size: component.Text.Size.S
        });
    }
    if (list.length === 0) {
        return new component.Text({ text: '(none found in this Twilio account)', type: component.Text.Type.WEAK });
    }
    const options = optionsFor(spec.field, list);
    return new component.Dropdown({
        dataSource: new core.ArrayDataSource(options),
        valueMember: 'value',
        displayMember: 'label',
        selectedValue: effectiveValue(spec, options, c.voicePendingValue),
        allowEmpty: !!spec.allowEmpty,
        placeholder: spec.allowEmpty ? '(none)' : 'Select…',
        onSelectionChanged: onPendingChange,
        rootStyle: { width: '100%' }
    } as never);
}

/** Change (VIEW) or Save / Cancel / Retry (EDIT). */
export function voiceActionControl(spec: VoiceFieldSpec): unknown {
    const c = (store.getState() as AppState).console;
    const small = component.Button.Size.SMALL;
    if (c.voiceEditing !== spec.field) {
        return new component.Button({
            label: 'Change',
            size: small,
            enabled: !c.voiceSaving,
            action: (): void => { startVoiceEdit(spec); }
        } as never);
    }
    const listKey = listKeyFor(spec.field);
    const list = c.voiceLists[listKey] as TwilioListItem[] | null;
    const cancel = new component.Button({ label: 'Cancel', size: small, enabled: !c.voiceSaving, action: cancelVoiceEdit } as never);
    if (list === null || c.voiceListsLoading || list.length === 0) return cancel;
    const row = (items: unknown[]): unknown => new component.StackPanel({
        orientation: component.StackPanel.Orientation.HORIZONTAL,
        itemGap: component.StackPanel.GapSize.SPACING2X,
        items
    } as never);
    if (c.voiceListErrors[listKey]) {
        return row([
            new component.Button({
                label: 'Retry', size: small, startIcon: core.SystemIcon.REFRESH,
                action: (): void => { loadVoiceLists(); }
            } as never),
            cancel
        ]);
    }
    return row([
        new component.Button({
            label: c.voiceSaving ? 'Saving…' : 'Save',
            size: small,
            type: component.Button.Type.PRIMARY,
            enabled: !c.voiceSaving,
            action: (): void => { saveVoiceEdit(spec); }
        } as never),
        cancel
    ]);
}
