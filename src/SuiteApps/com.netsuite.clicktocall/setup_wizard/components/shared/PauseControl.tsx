/**
 * Pause / resume calling — Overview status card and Twilio account danger
 * zone. Canvas States "Pause calling (2 steps)": the first press shows the
 * consequence inline with Confirm pause / Cancel (no dialog); while the
 * call runs the button reads "Pausing…". Pause = wizardActivate
 * { deactivate: true } (effects/console deactivate). Resume = reactivate
 * (the server re-runs preflight; failed checks show).
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import {store} from '../../app/Store';
import {Action} from '../../app/Action';
import {deactivate, reactivate} from '../../app/effects/console';
import type {AppState} from '../../app/InitialState';
import {friendlyError} from './friendlyError';
import {buildFailedCheckLines} from './FailedChecks';
import {button, errorLine, hstack, text, vstack, Gap} from './ui';

export const PAUSE_CONFIRM_TEXT =
    'Reps will not be able to call until you resume. Open phones stop within about a minute; ' +
    'calls in progress finish.';

interface PauseControlProps {
    /** 'Pause calling' (Overview) or 'Pause calling…' (danger zone). */
    pauseLabel?: string;
    /** Danger-zone look (red button). */
    danger?: boolean;
    tick?: number;
}

export const PauseControl = (props: PauseControlProps): core.VDom.Node => {
    const c = (store.getState() as AppState).console;
    const snap = (c.snapshot || {}) as { active?: boolean };
    const paused = snap.active === false;
    const out: unknown[] = [];

    if (paused) {
        out.push(button(c.reactivating ? 'Resuming…' : 'Resume calling', () => { reactivate('overview'); }, {
            primary: true, enabled: !c.reactivating, icon: core.SystemIcon.PLAY
        }));
    } else if (c.deactivating) {
        out.push(button('Pausing…', () => undefined, { danger: true, enabled: false }));
    } else if (c.pendingDeactivateConfirm) {
        out.push(hstack([
            text(PAUSE_CONFIRM_TEXT, { small: true }),
            button('Confirm pause', () => { deactivate(); }, { small: true, danger: true }),
            // deactivateSuccess clears pendingDeactivateConfirm in the reducer.
            button('Cancel', () => { store.dispatch(Action.deactivateSuccess()); }, { small: true })
        ], Gap.SPACING2X, { wrap: true }));
    } else {
        out.push(button(props.pauseLabel || 'Pause calling', () => { store.dispatch(Action.deactivateRequest()); }, {
            quietDanger: !!props.danger
        }));
    }

    if (c.deactivateError) out.push(errorLine('Pause failed: ' + friendlyError(c.deactivateError)));
    if (c.reactivateError && c.reactivateSource === 'overview') {
        out.push(errorLine('Resume failed: ' + friendlyError(c.reactivateError)));
        buildFailedCheckLines(c.reactivateFailedChecks).forEach((line) => { out.push(line); });
    }
    return vstack(out, Gap.SPACING2X, { alignment: component.StackPanel.Alignment.END });
};

export default PauseControl;
