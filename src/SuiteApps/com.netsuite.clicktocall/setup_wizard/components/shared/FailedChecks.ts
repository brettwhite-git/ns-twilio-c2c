/**
 * Failed check lines — imperative Text components for checks that
 * blocked an action (Reactivate's failedChecks, the Credentials
 * connection test). One line per check: "✕ Label: detail → hint".
 */

import * as component from '@uif-js/component';
import type {CheckResult} from '../../app/InitialState';

export const buildFailedCheckLines = (checks: CheckResult[]): unknown[] =>
    checks
        .filter((c) => c && c.status !== 'pass')
        .map((c) => new component.Text({
            text: '✕ ' + (c.label || c.id || 'Check') +
                (c.detail ? ': ' + c.detail : '') +
                (c.repairHint ? ' → ' + c.repairHint : ''),
            size: component.Text.Size.S,
            // Console type scale: 12px (consoleStyles.ts; no effect outside the console).
            classList: ['ctc-t-small']
        } as never));

export default buildFailedCheckLines;
