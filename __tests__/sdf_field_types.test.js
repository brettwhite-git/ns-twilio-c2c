/**
 * SDF XML field-type regression guard.
 *
 * NetSuite SELECT field <selectrecordtype> values must reference the correct
 * built-in record type code. We've hit two bugs this session caused by the
 * wrong negative ID:
 *   - -30 → invalid (caught at deploy time)
 *   - -10 → silently broken because -10 is `Item`, not `Task`. Approve
 *     created Tasks successfully but the proposed_task save rejected the
 *     Task ID at the field-validation step, producing duplicate orphan Tasks.
 *
 * This test parses the SDF XML and locks in the correct codes so a future
 * edit can't reintroduce the mismatch without a failing unit test.
 *
 * Reference (NetSuite built-in record type codes):
 *   -4   Employee
 *   -10  Item       (NOT Task)
 *   -16  Lead
 *   -20  Calendar Event
 *   -21  Task       ← the real Task
 *   -22  Phone Call
 */
const fs = require('fs');
const path = require('path');

const SDF_XML = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'Objects', 'Records', 'customrecord_ctc_proposed_task.xml'),
    'utf8'
);

/**
 * Extract the <selectrecordtype> value for a given <customrecordcustomfield scriptid=…> block.
 * Returns null if the field has no selectrecordtype (e.g., CHECKBOX/CLOBTEXT fields).
 */
const getSelectRecordType = (xml, scriptid) => {
    const fieldBlock = xml.match(new RegExp(
        '<customrecordcustomfield\\s+scriptid="' + scriptid + '">[\\s\\S]*?</customrecordcustomfield>'
    ));
    if (!fieldBlock) throw new Error('Field not found: ' + scriptid);
    const match = fieldBlock[0].match(/<selectrecordtype>([^<]+)<\/selectrecordtype>/);
    return match ? match[1] : null;
};

describe('customrecord_ctc_proposed_task SDF field types', () => {
    it('custrecord_ctc_pt_phone_call references PHONECALL (-22)', () => {
        expect(getSelectRecordType(SDF_XML, 'custrecord_ctc_pt_phone_call')).toBe('-22');
    });

    it('custrecord_ctc_pt_created_task references TASK (-21) — NOT -10 (Item) or -30 (invalid)', () => {
        // This is the bug we just fixed. -10 is Item; native Task IDs fail validation
        // when written into an Item-typed SELECT field. -21 is the real Task type code.
        expect(getSelectRecordType(SDF_XML, 'custrecord_ctc_pt_created_task')).toBe('-21');
    });

    it('custrecord_ctc_pt_proposed_assignee references EMPLOYEE (-4)', () => {
        expect(getSelectRecordType(SDF_XML, 'custrecord_ctc_pt_proposed_assignee')).toBe('-4');
    });

    it('custrecord_ctc_pt_reviewer references EMPLOYEE (-4)', () => {
        expect(getSelectRecordType(SDF_XML, 'custrecord_ctc_pt_reviewer')).toBe('-4');
    });

    it('custrecord_ctc_pt_status references the customlist via [scriptid=…]', () => {
        const rt = getSelectRecordType(SDF_XML, 'custrecord_ctc_pt_status');
        expect(rt).toBe('[scriptid=customlist_ctc_pt_status]');
    });
});
