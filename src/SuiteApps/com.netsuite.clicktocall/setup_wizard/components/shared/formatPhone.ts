/**
 * formatPhone — display form of an E.164 number.
 * North American numbers (+1 and 10 digits) read as "+1 (855) 557-5596";
 * every other value is returned unchanged.
 */
export const formatPhone = (e164: string | undefined | null): string => {
    const raw = String(e164 || '');
    const m = /^\+1([0-9]{3})([0-9]{3})([0-9]{4})$/.exec(raw);
    return m ? '+1 (' + m[1] + ') ' + m[2] + '-' + m[3] : raw;
};

export default formatPhone;
