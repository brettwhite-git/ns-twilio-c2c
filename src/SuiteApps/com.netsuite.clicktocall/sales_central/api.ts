/** Sales Central: the RESTlet calls and the data they return. */

export interface NeedsRow {
    companyId: string; name: string; entityType: string; phone: string;
    why: string; more: number; kind: string; status: string; tone: 'red' | 'amber' | 'grey';
    next: string; open: number; lastTouch: string;
    /** The contact on the newest call, and everything waiting ("1 call back · 2 invoices past due"). */
    contact: string; needs: string;
}

/** A Needs me account hidden until tomorrow (salesCentralNeeds.snoozed). */
export interface SnoozedRow { companyId: string; name: string; until: string; }

export interface CallRow {
    id: string; date: string; timeOfDay: string; companyId: string; companyName: string;
    contactName: string; phone: string; brief: string; satisfaction: number | null;
    duration: number; direction: string; voicemail: boolean; callStatus: string;
}

/** One Phone Call for the call drawer (getCallDetail). */
export interface CallDetail {
    call: {
        id: string; title: string; companyId: string; companyName: string; contactName: string;
        ownerName: string; phone: string; date: string; direction: 'inbound' | 'outbound'; duration: number;
        status: string; voicemail: boolean; satisfaction: number | null; toneKeywords: string; summary: string;
        transcriptLines: Array<{ speaker: '' | 'rep' | 'customer'; text: string }>; transcriptLineCount: number;
        /** The whole transcript as turns (same speaker joined), with sentence times when stored (2026-11-28+). */
        turns?: Array<{ speaker: '' | 'rep' | 'customer'; start: number | null; end: number | null; lines: string[] }>;
        /** Talk time per side: seconds from sentence times, else word counts for older transcripts. */
        talk?: { rep: number; customer: number; basis: 'seconds' | 'words' };
        recordingUrl: string;
        /** The access-checked audio Suitelet for this call; '' when the recording is gone or was never made. */
        audioUrl?: string;
    };
    /** Pending follow-ups proposed from this call. */
    tasks: Array<{ id: string; text: string; proposedDue: string }>;
    tasksError?: boolean;
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

export interface DealStatus { id: string; name: string; probability: number; }
export interface Deal {
    id: string; number: string; title: string; companyId: string; companyName: string;
    statusId: string; amount: number; probability: number; close: string;
    /** Sales rep (display name) and the date the deal was created, for the card. */
    rep: string; created: string;
}
export interface PipelineData {
    statuses: DealStatus[]; deals: Deal[]; partial: string[];
    kpis: { open: number; openCount: number; weighted: number; won: number; wonCount: number; late: number; lateCount: number };
}
/** One deal's detail for the drawer (salesCentralDeal); read only. */
export interface DealDetail {
    details: { salesRep: string; leadSource: string; partner: string; forecastType: string;
        rangeLow: number; rangeHigh: number; memo: string; created: string };
    items: Array<{ item: string; quantity: number; amount: number }>;
    activity: Array<{ kind: 'call' | 'task' | 'event'; title: string; date: string }>;
    todayIso: string;
    partial: string[];
}
/** Only the fields that changed (salesCentralUpdateDeal). */
export interface DealEdit { title?: string; statusId?: string; close?: string; probability?: number; }

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
