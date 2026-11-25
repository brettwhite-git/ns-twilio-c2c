/** Sales Central: the RESTlet calls and the data they return. */

export interface NeedsRow {
    companyId: string; name: string; entityType: string; phone: string;
    why: string; more: number; kind: string; status: string; tone: 'red' | 'amber' | 'grey';
    next: string; open: number; lastTouch: string;
}

export interface CallRow {
    id: string; date: string; timeOfDay: string; companyId: string; companyName: string;
    contactName: string; phone: string; brief: string; satisfaction: number | null;
    duration: number; direction: string; voicemail: boolean; callStatus: string;
}

export interface AccountContext {
    outstanding?: { sum: number; count: number; overdueCount: number; oldestDays: number | null };
    lastTouchDays?: number | null;
    orders90?: { count: number; total: number };
    activity?: Array<{ kind: string; text: string; at: string; ageDays: number }>;
    followUps?: Array<{ id: string; title: string; due: string }>;
    error?: string;
}

export interface ContactRow { contactId: string; name: string; title?: string; phones?: Array<{ number: string; type: string }>; }

export type Post = <T>(body: Record<string, unknown>) => Promise<T & { error?: string }>;

export const makePost = (restletUrl: string): Post => (body) =>
    fetch(restletUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    });

export interface TaskRow {
    kind: 'task' | 'suggestion'; id: string; title: string; companyId: string; companyName: string;
    contactId: string; due: string; band: 'overdue' | 'today' | 'week' | 'later'; status: string; priority: string;
    note: string; fromCall: { id: string; title: string; date: string } | null;
    /** Suggestions: who Approve gives the Task to (the call's rep, else the approver). */
    assignTo?: string;
}

export type Outcome = 'done' | 'next' | 'reach' | 'no';
export interface CompletePayload { outcome: Outcome; note: string; next?: { title: string; due: string } }
