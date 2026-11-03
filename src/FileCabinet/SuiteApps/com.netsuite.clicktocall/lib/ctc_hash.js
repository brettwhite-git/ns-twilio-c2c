// @ts-check
/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Small, fast, non-cryptographic string hash (cyrb53) for change
 * detection: "is what Twilio runs still what NetSuite would publish now?"
 * Not for secrets or signatures. Same algorithm and output format as
 * hashString in lib/ctc_outbound_function.js (14 hex characters).
 * No N/ modules, no governance units.
 */
define([], () => {

    /**
     * cyrb53 of a string, as 14 lower-case hex characters.
     * @param {string} str
     * @returns {string}
     */
    const hashString = (str) => {
        const s = String(str == null ? '' : str);
        let h1 = 0xdeadbeef;
        let h2 = 0x41c6ce57;
        for (let i = 0; i < s.length; i++) {
            const ch = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
        return ('00000000000000' + n.toString(16)).slice(-14);
    };

    return { hashString };
});
