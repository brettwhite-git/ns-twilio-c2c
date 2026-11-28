/**
 * Sales Central · the call drawer (ORCA board ScCallDrawer): one Phone Call,
 * read with getCallDetail when the drawer opens. One scroll like the deal
 * drawer: facts, AI summary, the recording player, follow-ups from the call
 * (Approve / Dismiss) and the first transcript lines. The audio comes from
 * the access-checked audio Suitelet (`audioUrl`), never from Twilio directly:
 * Twilio media needs the account's key, and recordings are kept only for the
 * admin's retention window.
 */

import {el, clear, clock, shortDate, nsDateToIso} from './dom';
import type {CallRow, CallDetail, Post} from './api';

export interface CallDrawerHandlers {
    post: Post;
    top: () => number;
    onClose: () => void;
    onAccount: (row: CallRow) => void;
    onCallBack: (row: CallRow) => void;
    /** Approve or dismiss one follow-up; resolves to a problem to show, or ''. */
    onFollowUp: (taskId: string, approve: boolean, title: string) => Promise<string>;
}

const button = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
};

const section = (title: string, aside: string): HTMLElement => {
    const h = el('div', 'sc-dsec');
    h.append(el('span', '', title), el('i', '', aside));
    return h;
};

const firstName = (name: string): string => (name || '').split(' ')[0];
const recordUrl = (id: string): string => '/app/crm/calendar/call.nl?id=' + encodeURIComponent(id);

const unanswered = (c: CallDetail['call']): boolean => c.status === 'Missed' || c.status === 'No answer';

const pillsOf = (row: CallRow, c: CallDetail['call']): HTMLElement => {
    const facts = el('div', 'sc-cfacts');
    const pill = (text: string, cls?: string): void => { facts.appendChild(el('span', 'sc-pill' + (cls ? ' ' + cls : ''), text)); };
    pill(c.direction === 'inbound' ? 'Inbound' : 'Outbound');
    const day = nsDateToIso(row.date);
    pill((day ? shortDate(day) + ' ' : '') + (row.timeOfDay || ''));
    if (c.voicemail) pill('Voicemail');
    else if (unanswered(c)) pill(c.status, 'late');
    if (c.duration) pill(clock(c.duration));
    if (c.satisfaction) pill('Score ' + c.satisfaction + ' / 10', c.satisfaction <= 3 ? 'late' : '');
    if (c.ownerName) pill(firstName(c.ownerName));
    return facts;
};

const followUps = (host: HTMLElement, d: CallDetail, h: CallDrawerHandlers): void => {
    if (!d.tasks.length && !d.tasksError) return;
    host.appendChild(section('Follow-ups', d.tasksError ? 'Could not load' : d.tasks.length + ' to review'));
    d.tasks.forEach((t) => {
        const row = el('div', 'sc-cfu');
        const text = el('span', '', t.text);
        if (t.proposedDue) text.appendChild(el('small', '', 'Proposed due ' + shortDate(nsDateToIso(t.proposedDue) || t.proposedDue)));
        const err = el('span', 'sc-err');
        const act = (approve: boolean): void => {
            row.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
            err.textContent = '';
            h.onFollowUp(t.id, approve, t.text).then((problem) => {
                if (problem) {
                    err.textContent = problem;
                    row.querySelectorAll('button').forEach((b) => { (b as HTMLButtonElement).disabled = false; });
                } else row.remove();
            });
        };
        const acts = el('span', 'acts');
        acts.append(button('sc-cancel', 'Dismiss', () => act(false)), button('sc-btn pri', 'Approve', () => act(true)));
        row.append(text, acts, err);
        host.appendChild(row);
    });
};

const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"></path></svg>';
const PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"></path></svg>';
const SPEEDS = [1, 1.5, 2];

/** The recording: our own controls over a hidden <audio> (play/pause, seek bar, time, speed). */
export const player = (src: string, knownSeconds: number): HTMLElement => {
    const wrap = el('div', 'sc-player');
    const audio = el('audio');
    audio.preload = 'metadata';
    audio.src = src;
    const play = el('button', 'sc-pplay');
    play.type = 'button';
    play.innerHTML = PLAY;
    play.setAttribute('aria-label', 'Play recording');
    const seek = el('input', 'sc-pseek');
    seek.type = 'range';
    seek.min = '0';
    seek.step = '0.1';
    seek.value = '0';
    seek.setAttribute('aria-label', 'Position');
    const time = el('span', 'sc-ptime');
    const speed = el('button', 'sc-pspeed', '1×');
    speed.type = 'button';
    speed.setAttribute('aria-label', 'Playback speed');
    const err = el('span', 'sc-err');
    const total = (): number => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : knownSeconds);
    const paint = (): void => {
        seek.max = String(total() || 0);
        if (document.activeElement !== seek) seek.value = String(audio.currentTime);
        seek.style.setProperty('--p', (total() ? (audio.currentTime / total()) * 100 : 0) + '%');
        time.textContent = clock(audio.currentTime) + ' / ' + clock(total());
        play.innerHTML = audio.paused ? PLAY : PAUSE;
        play.setAttribute('aria-label', audio.paused ? 'Play recording' : 'Pause recording');
    };
    play.addEventListener('click', () => {
        err.textContent = '';
        if (audio.paused) audio.play().catch(() => { err.textContent = 'The recording could not play.'; });
        else audio.pause();
    });
    seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); paint(); });
    speed.addEventListener('click', () => {
        const next = SPEEDS[(SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length];
        audio.playbackRate = next;
        speed.textContent = next + '×';
    });
    ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((ev) => audio.addEventListener(ev, paint));
    audio.addEventListener('error', () => { err.textContent = 'The recording is not available.'; play.disabled = true; });
    paint();
    wrap.append(play, seek, time, speed, audio, err);
    return wrap;
};

/** Fills the drawer body from the call read (pure DOM; no reads). */
export const renderCallDetail = (host: HTMLElement, row: CallRow, d: CallDetail, h: CallDrawerHandlers): void => {
    clear(host);
    const c = d.call;
    host.appendChild(pillsOf(row, c));
    if (c.summary && !c.voicemail) {
        host.appendChild(section('AI summary', c.toneKeywords.split(',').map((s) => s.trim()).filter(Boolean).join(' · ')));
        host.appendChild(el('div', 'sc-dmemo', c.summary));
    } else if (!c.voicemail && !unanswered(c)) {
        // No transcript / Failed are final: never promise a summary that will not come.
        const final = c.status === 'No transcript' || c.status === 'Failed';
        host.appendChild(section('AI summary', c.status));
        host.appendChild(el('div', 'mut', final ? 'No summary for this call: there was no transcript to summarise.'
            : 'The summary is on its way. It is written after the transcript is ready.'));
    }
    if (c.audioUrl) {
        host.appendChild(section('Recording', ''));
        host.appendChild(player(c.audioUrl, c.duration));
    }
    followUps(host, d, h);
    if (c.transcriptLines.length) {
        const shown = c.transcriptLines.length;
        host.appendChild(section('Transcript', shown < c.transcriptLineCount ? 'First ' + shown + ' of ' + c.transcriptLineCount + ' lines' : shown + ' lines'));
        const tr = el('div', 'sc-ctr');
        const who = (s: string): string => (s === 'rep' ? firstName(c.ownerName) || 'Rep' : s === 'customer' ? firstName(c.contactName) || 'Customer' : '');
        c.transcriptLines.forEach((l) => {
            const p = el('p');
            if (who(l.speaker)) p.appendChild(el('b', '', who(l.speaker)));
            p.appendChild(document.createTextNode(l.text));
            tr.appendChild(p);
        });
        host.appendChild(tr);
        const all = el('a', 'sc-rec', 'Full transcript in NetSuite');
        all.href = recordUrl(c.id);
        all.target = '_top';
        host.appendChild(all);
    }
};

const loading = (host: HTMLElement): void => {
    clear(host);
    ['AI summary', 'Transcript'].forEach((t) => {
        host.appendChild(section(t, ''));
        const bars = el('div', 'sc-dload');
        [80, 64, 72].forEach((w) => { const b = el('span'); b.style.width = w + '%'; bars.appendChild(b); });
        host.appendChild(bars);
    });
};

/** Opens (or replaces) the call drawer and reads the call. */
export const openCallDrawer = (host: HTMLElement, row: CallRow, h: CallDrawerHandlers): HTMLElement => {
    closeCallDrawer(host);
    const dw = el('aside', 'sc-drawer sc-calld');
    dw.setAttribute('aria-label', 'Call · ' + (row.companyName || row.phone || 'Unknown caller'));
    dw.style.top = h.top() + 'px';
    const bar = el('div', 'sc-dhead');
    const tools = el('span', 'tools');
    const x = button('sc-icon', '✕', h.onClose);
    x.setAttribute('aria-label', 'Close');
    tools.appendChild(x);
    bar.append(el('span', 'sc-lbl', 'Call'), tools);

    const title = el('div', 'sc-dtitle');
    const sub = el('div', 'sc-dsub');
    if (row.companyId) {
        const acct = button('sc-lk', 'Account', () => h.onAccount(row));
        acct.title = 'Account details';
        sub.append(acct, el('span', 'mut', ' · '));
    }
    if (row.contactName) sub.append(el('span', 'mut', row.contactName + ' · '));
    const rec = el('a', 'sc-rec', 'Phone call');
    rec.href = recordUrl(row.id);
    rec.target = '_top';
    rec.title = 'Open in NetSuite';
    sub.appendChild(rec);
    title.append(el('b', '', row.companyName || row.phone || 'Unknown caller'), sub);

    const more = el('div', 'sc-dmore');
    loading(more);
    const body = el('div', 'sc-dbody');
    body.append(title, more);

    const foot = el('div', 'sc-dfoot');
    if (row.phone) foot.appendChild(button('sc-btn go', 'Call back', () => h.onCallBack(row)));
    const open = el('a', 'sc-btn gh', 'Open in NetSuite');
    open.href = recordUrl(row.id);
    open.target = '_top';
    foot.append(open, el('span', 'mut', 'Esc to close'));
    dw.append(bar, body, foot);
    host.appendChild(dw);

    h.post<CallDetail>({ action: 'getCallDetail', callId: row.id })
        .then((d) => {
            if (!dw.isConnected) return;
            if (d.error || !d.call) { clear(more); more.appendChild(el('div', 'mut', 'Could not load this call')); return; }
            renderCallDetail(more, row, d, h);
        })
        .catch(() => { if (dw.isConnected) { clear(more); more.appendChild(el('div', 'mut', 'Could not load this call')); } });
    return dw;
};

export const closeCallDrawer = (host: HTMLElement): void => {
    const d = host.querySelector('.sc-calld');
    if (d) d.remove();
};
