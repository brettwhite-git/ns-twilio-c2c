/**
 * Outbound calls page (#/outbound; #/voice redirects here) — canvas
 * Outbound.dc.html.
 *   1. "Call path" card, key/value rows: Twilio app and Default caller ID
 *      (shared voiceField editor: live Twilio list, partial save), and
 *      "Who calls out from what" (the caller-ID rule; Phones & reps link).
 *      The Intelligence service moved to Transcripts & AI.
 *   2. "Recording notice" card + its action row (OutboundNotice: save,
 *      publish, resume, remove from Twilio).
 */

import {PureComponent} from '@uif-js/core';
import * as core from '@uif-js/core';
import {store} from '../../app/Store';
import {loadPhonesData} from '../../app/effects/phones';
import {goToSection} from '../../app/effects/navigation';
import type {AppState} from '../../app/InitialState';
import type {PageTickProps} from '../../App';
import OutboundNotice from './OutboundNotice';
import {callerIdList} from './PhonesPage';
import {friendlyError} from '../shared/friendlyError';
import {formatPhone} from '../shared/formatPhone';
import {VOICE_FIELD_SPECS, voiceActionControl, voiceValueControl} from '../shared/voiceField';
import type {VoiceFieldSpec} from '../shared/voiceField';
import {button, card, cardTitle, divider, errorLine, grid, help, label, pageHeader, text, vstack, Gap} from '../shared/ui';
import type {Child} from '../shared/ui';

/** A canvas `.kv` row: label | value + help | action. */
const kv = (name: string, value: Child, action: Child): core.VDom.Node =>
    grid('180px minmax(0, 1fr) auto', [label(name), value, action || text('')],
        Gap.SPACING4X);

const settingRow = (name: string, spec: VoiceFieldSpec, helpText: string, viewText?: string): core.VDom.Node =>
    kv(name, vstack([voiceValueControl(spec, viewText), help(helpText)], Gap.SPACING1X), voiceActionControl(spec));

interface TwilioNumber {
    phoneNumber?: string;
    friendlyName?: string;
}

export default class OutboundPage extends PureComponent<PageTickProps, unknown> {
    componentDidMount(): void {
        const c = (store.getState() as AppState).console;
        if (c.phonesByPhone === null && !c.phonesLoading) loadPhonesData();
    }

    render(): core.VDom.Node {
        const state = store.getState() as AppState;
        const c = state.console;
        const snap = (c.snapshot || {}) as { phoneNumber?: string };
        const n = ((c.phonesNumbers || []) as TwilioNumber[]).find((x) => x.phoneNumber === snap.phoneNumber);
        const callerIdText = snap.phoneNumber
            ? formatPhone(snap.phoneNumber) + (n && n.friendlyName ? ' · ' + n.friendlyName : '')
            : undefined;

        const path: Child[] = [
            cardTitle('Call path'),
            settingRow('Twilio app', VOICE_FIELD_SPECS.twimlAppSid,
                'Outbound calls use this app; publishing the recording notice points it at our dial function. ' +
                'While the notice is published, remove it from Twilio before you change the app.'),
            divider(),
            settingRow('Default caller ID', VOICE_FIELD_SPECS.phoneNumber,
                'Each rep calls out from the number that rings them. Reps that ring for no number use this one.',
                callerIdText),
            divider(),
            kv('Who calls out from what', callerIdList(state),
                button('Phones & reps', () => { goToSection('phones'); }, { link: true, small: true }))
        ];
        if (c.voiceError) path.push(errorLine(friendlyError(c.voiceError)));

        return vstack([
            pageHeader('Outbound calls', 'How reps\' calls leave NetSuite, and what the person called hears first.'),
            card(path, { label: 'Call path', gap: Gap.SPACING3X }),
            <OutboundNotice tick={this.props.tick} />
        ], Gap.SPACING4X);
    }
}
