/**
 * Health effects — the read model behind the Overview "Needs attention"
 * list and the Phone numbers / Intelligence service drift rows.
 *
 * Server contract (ctc_sl_wizard_api.js → lib/ctc_health.js):
 *   wizardLoadHealth {} → { ok, checkedAt,
 *       signals: { <key>: { key, title, value, severity, detail, action? } },
 *       attention: [{ key, title, severity, detail, action? }] }
 *   severity: 'ok' | 'warn' | 'problem' | 'unknown'; action: { label, route }.
 */

import {store} from '../Store';
import {Action} from '../Action';
import {wizardCall} from '../../services/wizardApi';
import type {AppState, HealthAction, HealthAttentionItem, HealthSeverity, HealthSignal} from '../InitialState';

interface HealthEnvelope {
    ok?: boolean;
    error?: string;
    message?: string;
    checkedAt?: string;
    signals?: Record<string, unknown>;
    attention?: unknown[];
}

const SEVERITIES: HealthSeverity[] = ['ok', 'warn', 'problem', 'unknown'];

const toSeverity = (v: unknown): HealthSeverity =>
    (SEVERITIES.indexOf(v as HealthSeverity) !== -1 ? v as HealthSeverity : 'unknown');

const toAction = (v: unknown): HealthAction | undefined => {
    const a = (v || null) as { label?: unknown; route?: unknown } | null;
    if (!a || typeof a.label !== 'string' || typeof a.route !== 'string') return undefined;
    return { label: a.label, route: a.route };
};

const toSignal = (raw: unknown): HealthSignal => {
    const r = (raw || {}) as Record<string, unknown>;
    const out: HealthSignal = {
        key: String(r.key ?? ''),
        title: String(r.title ?? ''),
        value: r.value ?? null,
        severity: toSeverity(r.severity),
        detail: String(r.detail ?? '')
    };
    const action = toAction(r.action);
    if (action) out.action = action;
    return out;
};

const toAttention = (raw: unknown): HealthAttentionItem => {
    const s = toSignal(raw);
    const item: HealthAttentionItem = { key: s.key, title: s.title, severity: s.severity, detail: s.detail };
    if (s.action) item.action = s.action;
    return item;
};

/** Load (or reload) the health read model. One load at a time. */
export async function loadHealth(): Promise<void> {
    if ((store.getState() as AppState).health.loading) return;
    store.dispatch(Action.healthLoadStart());
    try {
        const result = (await wizardCall('wizardLoadHealth', {})) as HealthEnvelope | null;
        if (!result || result.ok !== true) {
            store.dispatch(Action.healthLoadFailure(
                (result && (result.message || result.error)) || 'Could not load the health checks'
            ));
            return;
        }
        const signals: Record<string, HealthSignal> = {};
        Object.keys(result.signals || {}).forEach((k) => {
            signals[k] = toSignal((result.signals as Record<string, unknown>)[k]);
        });
        const attention = Array.isArray(result.attention) ? result.attention.map(toAttention) : [];
        store.dispatch(Action.healthLoadSuccess({
            checkedAt: String(result.checkedAt || ''),
            signals,
            attention
        }));
    } catch (e) {
        store.dispatch(Action.healthLoadFailure(
            e instanceof Error && e.message ? e.message : 'Could not load the health checks'
        ));
    }
}
