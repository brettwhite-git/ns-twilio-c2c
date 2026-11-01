// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Call times. A call's start is stored as ISO-8601 UTC in the Phone Call
 * field custevent_ctc_call_started. These helpers turn an instant into the
 * wall-clock date and time a user sees: the current user's time zone
 * (N/config USER_PREFERENCES TIMEZONE), else the company time zone
 * (COMPANY_INFORMATION timezone), formatted by N/format in the user's own
 * date and time formats.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/format', 'N/config', 'N/log'], (format, config, log) => {

    const ISO_UTC = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,3})?)?Z$/;

    // Read once per script execution (a script runs as one user).
    /** @type {string|null} */
    let cachedTimezone = null;

    /**
     * The current user's time zone, else the company's; '' when neither is
     * readable (N/format then uses its default). Cost: config.load, 10
     * units (20 with the company fallback), once per execution.
     * @returns {string} e.g. 'America/Los_Angeles'
     */
    const userTimezone = () => {
        if (cachedTimezone !== null) return cachedTimezone;
        let tz = '';
        try {
            tz = String(config.load({ type: config.Type.USER_PREFERENCES }).getValue({ fieldId: 'TIMEZONE' }) || '');
        } catch (e) {
            tz = '';
        }
        if (!tz) {
            try {
                tz = String(config.load({ type: config.Type.COMPANY_INFORMATION }).getValue({ fieldId: 'timezone' }) || '');
            } catch (e) {
                tz = '';
            }
        }
        if (!tz) log.error({ title: 'CTC time zone unreadable', details: 'Call times use the N/format default.' });
        cachedTimezone = tz;
        return tz;
    };

    /** Forget the cached time zone (tests). */
    const clearTimezoneCache = () => { cachedTimezone = null; };

    /**
     * Wall-clock date and time of an instant in `tz`, as N/format writes
     * them in the user's formats: { date: '10/31/2026', time: '5:02 am' }.
     * Seconds are dropped. null when the text has no trailing time.
     * @param {number} ms - epoch ms
     * @param {string} tz - time zone id, or '' for the N/format default
     * @returns {{date: string, time: string}|null}
     */
    const localParts = (ms, tz) => {
        /** @type {Object} */
        const opts = { value: new Date(ms), type: format.Type.DATETIME };
        if (tz) opts.timezone = tz;
        const text = String(format.format(opts) || '').trim();
        const m = text.match(/^(.*\S)\s+([0-9]{1,2}:[0-9]{2})(?::[0-9]{2})?(\s*[AaPp][Mm])?$/);
        return m ? { date: m[1], time: m[2] + (m[3] || '') } : null;
    };

    /** epoch ms → ISO-8601 UTC ('2026-10-31T11:29:15.000Z'). */
    const isoUtc = (ms) => new Date(ms).toISOString();

    /**
     * ISO-8601 UTC text (as stored in custevent_ctc_call_started) → epoch
     * ms, or null when blank or not ISO UTC.
     * @param {*} value
     * @returns {number|null}
     */
    const parseIsoUtc = (value) => {
        const s = String(value || '').trim();
        if (!ISO_UTC.test(s)) return null;
        const ms = Date.parse(s);
        return isNaN(ms) ? null : ms;
    };

    /**
     * The user's wall-clock time of a stored ISO start, e.g. '5:02 am'
     * (user format), or '' when it cannot be read or formatted.
     * @param {*} iso
     * @returns {string}
     */
    const localTimeOfIso = (iso) => {
        const ms = parseIsoUtc(iso);
        if (ms === null) return '';
        try {
            const parts = localParts(ms, userTimezone());
            return parts ? parts.time : '';
        } catch (e) {
            return '';
        }
    };

    return { userTimezone, clearTimezoneCache, localParts, isoUtc, parseIsoUtc, localTimeOfIso };
});
