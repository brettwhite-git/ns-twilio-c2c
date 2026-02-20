/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Injects a rich "Call Intelligence" panel on Phone Call records
 * when transcript data has been processed (custevent_ctc_processed = true).
 * Read-only presentation layer — data stays in existing CRM event fields.
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    const beforeLoad = (context) => {
        const type = context.type;
        if (type !== context.UserEventType.VIEW && type !== context.UserEventType.EDIT) return;

        const rec = context.newRecord;
        const processed = rec.getValue({ fieldId: 'custevent_ctc_processed' });
        if (!processed) return;

        const customTab = context.form.getTab({ id: 'custom' });
        if (customTab) customTab.label = 'Call Intel';

        const data = {
            summary:      rec.getValue({ fieldId: 'custevent_ctc_ai_summary' }) || '',
            satisfaction: rec.getValue({ fieldId: 'custevent_ctc_satisfaction' }),
            duration:     rec.getValue({ fieldId: 'custevent_ctc_duration' }),
            toneKeywords: rec.getValue({ fieldId: 'custevent_ctc_tone_keywords' }) || '',
            actionItems:  rec.getValue({ fieldId: 'custevent_ctc_action_items' }) || '',
            transcript:   rec.getValue({ fieldId: 'custevent_ctc_transcript' }) || '',
            recordingUrl: rec.getValue({ fieldId: 'custevent_ctc_recording_url' }) || ''
        };

        const html = buildViewerHtml(data);
        const field = context.form.addField({
            id: 'custpage_ctc_viewer',
            type: 'INLINEHTML',
            label: ' '
        });
        field.defaultValue = html;

        field.updateLayoutType({ layoutType: serverWidget.FieldLayoutType.OUTSIDEABOVE });
        field.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTROW });
    };

    const escapeHtml = (str) => {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    const splitLines = (text) => text.split(/\n|<br\s*\/?>/).filter(Boolean);

    const buildViewerHtml = (data) => {
        const safeSummary = escapeHtml(data.summary);
        const score = parseInt(data.satisfaction, 10) || 0;
        const duration = parseInt(data.duration, 10) || 0;
        const safeRecordingUrl = escapeHtml(data.recordingUrl);

        const scoreColor = score <= 3 ? '#dc3545' : score <= 6 ? '#f0ad4e' : '#28a745';
        const scoreLabel = score <= 3 ? 'Low' : score <= 6 ? 'Moderate' : 'High';

        const mins = Math.floor(duration / 60);
        const secs = duration % 60;
        const durationStr = mins > 0 ? mins + 'm ' + secs + 's' : secs + 's';

        const keywords = data.toneKeywords
            ? data.toneKeywords.split(', ').filter(Boolean).map((kw) =>
                '<span class="ctc-pill">' + escapeHtml(kw) + '</span>'
            ).join(' ')
            : '<span class="ctc-muted">None</span>';

        const actionItems = data.actionItems
            ? splitLines(data.actionItems).map((item) =>
                '<li>' + escapeHtml(item) + '</li>'
            ).join('')
            : '<li class="ctc-muted">No action items</li>';

        const transcriptLines = data.transcript ? splitLines(data.transcript) : [];

        let transcriptHtml = '';
        transcriptLines.forEach((line) => {
            const escaped = escapeHtml(line);
            if (line.startsWith('[REP]')) {
                transcriptHtml += '<div class="ctc-line ctc-rep">' + escaped + '</div>';
            } else if (line.startsWith('[CUSTOMER]')) {
                transcriptHtml += '<div class="ctc-line ctc-cust">' + escaped + '</div>';
            } else {
                transcriptHtml += '<div class="ctc-line">' + escaped + '</div>';
            }
        });

        const transcriptSection = transcriptLines.length
            ? '<div class="ctc-section"><div class="ctc-section-title">Transcript (' + transcriptLines.length + ' lines)</div><div id="ctc-transcript">' + transcriptHtml + '</div></div>'
            : '';

        const recordingHtml = safeRecordingUrl
            ? '<a href="' + safeRecordingUrl + '" target="_blank" class="ctc-link">Download recording (MP3)</a>'
            : '';

        const bottomRow = (data.actionItems || safeRecordingUrl)
            ? '<div class="ctc-bottom-row">'
                + '<div class="ctc-section"><div class="ctc-section-title">Action Items</div><ul class="ctc-actions">' + actionItems + '</ul></div>'
                + (safeRecordingUrl ? '<div class="ctc-section"><div class="ctc-section-title">Recording</div>' + recordingHtml + '</div>' : '')
                + '</div>'
            : '';

        return `<div id="ctc-viewer">
<style>
#ctc-viewer { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 13px; color: #333; margin: 16px 0; }
#ctc-viewer .ctc-header { font-size: 16px; font-weight: 600; color: #1a1a2e; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e8e8e8; }
#ctc-viewer .ctc-section { margin-bottom: 14px; }
#ctc-viewer .ctc-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 6px; }
#ctc-viewer .ctc-summary { background: #f8f9fa; border-left: 3px solid #4a90d9; padding: 10px 14px; border-radius: 0 6px 6px 0; line-height: 1.5; }
#ctc-viewer .ctc-metrics-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 14px; }
#ctc-viewer .ctc-metric { display: flex; align-items: center; gap: 6px; }
#ctc-viewer .ctc-score { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 14px; }
#ctc-viewer .ctc-score-label { font-size: 12px; color: #666; }
#ctc-viewer .ctc-pill { display: inline-block; background: #e8edf3; color: #4a5568; padding: 2px 10px; border-radius: 12px; font-size: 12px; margin: 2px 2px; }
#ctc-viewer #ctc-transcript { max-height: 300px; overflow-y: auto; border: 1px solid #e8e8e8; border-radius: 6px; padding: 8px 12px; background: #fafafa; }
#ctc-viewer .ctc-line { padding: 3px 0; line-height: 1.4; font-size: 12px; }
#ctc-viewer .ctc-rep { color: #2c5ea0; }
#ctc-viewer .ctc-cust { color: #6b4c8a; }
#ctc-viewer .ctc-bottom-row { display: flex; gap: 32px; align-items: flex-start; }
#ctc-viewer .ctc-bottom-row > .ctc-section:first-child { flex: 1; }
#ctc-viewer .ctc-actions { list-style: none; padding: 0; margin: 0; }
#ctc-viewer .ctc-actions li { padding: 4px 0 4px 18px; position: relative; line-height: 1.4; }
#ctc-viewer .ctc-actions li::before { content: "\\2022"; position: absolute; left: 4px; color: #4a90d9; font-weight: 700; }
#ctc-viewer .ctc-actions li.ctc-muted::before { display: none; }
#ctc-viewer .ctc-link { color: #4a90d9; text-decoration: none; font-size: 12px; }
#ctc-viewer .ctc-link:hover { text-decoration: underline; }
#ctc-viewer .ctc-muted { color: #aaa; font-style: italic; }
</style>
<div class="ctc-header">Call Intelligence</div>
<div class="ctc-section">
<div class="ctc-section-title">AI Summary</div>
<div class="ctc-summary">${safeSummary || '<span class="ctc-muted">No summary available</span>'}</div>
</div>
<div class="ctc-metrics-row">
<div class="ctc-metric"><span class="ctc-score" style="background:${scoreColor}">${score || '—'}</span><span class="ctc-score-label">${score ? scoreLabel + ' satisfaction' : 'Not scored'}</span></div>
<div class="ctc-metric"><strong>${durationStr}</strong>&nbsp;<span class="ctc-score-label">duration</span></div>
<div>${keywords}</div>
</div>
${transcriptSection}
${bottomRow}
<script>(function(){var el=document.getElementById('ctc-viewer');if(!el)return;var tr=el.closest('tr');if(!tr)return;var tbody=tr.parentElement;if(tbody)tbody.insertBefore(tr,tbody.firstChild);})()</script>
</div>`;
    };

    return { beforeLoad, buildViewerHtml, escapeHtml, splitLines };
});
