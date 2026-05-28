import wizardState from 'SuiteScripts/lib/ctc_wizard_state';

describe('ctc_wizard_state', () => {
    describe('snapshotFromConfig', () => {
        // Phase 2 U10: Auth Token removed entirely. Snapshot no longer
        // includes hasAuthCredential — API Key Secret is the only credential.
        const fullyConfigured = {
            accountSid: 'AC' + 'a'.repeat(32),
            apiKeySid: 'SK' + 'b'.repeat(32),
            apiSecretId: 'custsecret_ctc_api_key_secret',
            twimlAppSid: 'AP' + 'c'.repeat(32),
            phoneNumber: '+15551234567',
            intelServiceSid: '',
            active: true
        };

        it('returns all-false flags for a missing / empty config (fresh install)', () => {
            const snap = wizardState.snapshotFromConfig(null);
            expect(snap.hasPublicIds).toBe(false);
            expect(snap.hasApiKeySecret).toBe(false);
            expect(snap.hasCredentials).toBe(false);
            expect(snap.hasVoiceConfig).toBe(false);
            expect(snap.isActive).toBe(false);
        });

        it('flags all stages true for a fully-configured install', () => {
            const snap = wizardState.snapshotFromConfig(fullyConfigured);
            expect(snap.hasPublicIds).toBe(true);
            expect(snap.hasApiKeySecret).toBe(true);
            expect(snap.hasCredentials).toBe(true);
            expect(snap.hasVoiceConfig).toBe(true);
            expect(snap.isActive).toBe(true);
        });

        it('no longer exposes hasAuthCredential (U10: Auth Token field removed)', () => {
            const snap = wizardState.snapshotFromConfig(fullyConfigured);
            expect(snap.hasAuthCredential).toBeUndefined();
        });

        it('hasCredentials requires both public IDs and the API Key Secret pointer', () => {
            const noSecret = Object.assign({}, fullyConfigured, { apiSecretId: '' });
            expect(wizardState.snapshotFromConfig(noSecret).hasCredentials).toBe(false);

            const noPublicIds = Object.assign({}, fullyConfigured, { accountSid: '' });
            expect(wizardState.snapshotFromConfig(noPublicIds).hasCredentials).toBe(false);
        });

        it('treats whitespace-only field values as unset', () => {
            const noisy = Object.assign({}, fullyConfigured, {
                accountSid: '   ',
                apiKeySid: '\t\t'
            });
            const snap = wizardState.snapshotFromConfig(noisy);
            expect(snap.hasPublicIds).toBe(false);
        });

        it('requires BOTH twimlAppSid AND phoneNumber for hasVoiceConfig', () => {
            const onlyTwiml = Object.assign({}, fullyConfigured, { phoneNumber: '' });
            expect(wizardState.snapshotFromConfig(onlyTwiml).hasVoiceConfig).toBe(false);

            const onlyPhone = Object.assign({}, fullyConfigured, { twimlAppSid: '' });
            expect(wizardState.snapshotFromConfig(onlyPhone).hasVoiceConfig).toBe(false);
        });

        it('only treats `active === true` strict-boolean as active (defends against undefined coercion)', () => {
            expect(wizardState.snapshotFromConfig({ active: true }).isActive).toBe(true);
            expect(wizardState.snapshotFromConfig({ active: 'T' }).isActive).toBe(false);
            expect(wizardState.snapshotFromConfig({ active: 1 }).isActive).toBe(false);
            expect(wizardState.snapshotFromConfig({ active: undefined }).isActive).toBe(false);
            // (ctc_config.loadConfig is responsible for the "T"/"F" → true/false
            // coercion; this lib trusts the input shape.)
        });
    });

    describe('determineCurrentStep', () => {
        it('lands on Step 2 for a fresh install (nothing configured)', () => {
            const snap = wizardState.snapshotFromConfig(null);
            expect(wizardState.determineCurrentStep(snap)).toBe(2);
        });

        it('lands on Step 3 when credentials are saved but voice config is missing', () => {
            const snap = {
                hasPublicIds: true, hasAuthCredential: true, hasApiKeySecret: true,
                hasCredentials: true, hasVoiceConfig: false, isActive: false
            };
            expect(wizardState.determineCurrentStep(snap)).toBe(3);
        });

        it('returns "console" sentinel when voice config is set, regardless of active state (U13d)', () => {
            // Once voice config is saved, the admin should land on the
            // console — both for the post-activation case AND for the
            // refresh-after-deactivate case (where Reactivate lives in
            // the paused banner). The active flag gates rep call
            // placement, not admin console access.
            const snapActive = {
                hasPublicIds: true, hasApiKeySecret: true,
                hasCredentials: true, hasVoiceConfig: true, isActive: true
            };
            expect(wizardState.determineCurrentStep(snapActive)).toBe('console');

            const snapPaused = {
                hasPublicIds: true, hasApiKeySecret: true,
                hasCredentials: true, hasVoiceConfig: true, isActive: false
            };
            expect(wizardState.determineCurrentStep(snapPaused)).toBe('console');
        });

        it('handles missing snapshot gracefully (defaults to Step 2)', () => {
            expect(wizardState.determineCurrentStep(null)).toBe(2);
            expect(wizardState.determineCurrentStep(undefined)).toBe(2);
            expect(wizardState.determineCurrentStep({})).toBe(2);
        });
    });

    describe('STEPS catalog', () => {
        it('exposes 5 steps with num/label/sub fields', () => {
            // Original plan had 6 steps; "Reps & roles" collapsed into
            // "Test & activate" because Step 4's phone-number-to-rep
            // assignments + the `<allroles>T</allroles>` deployment
            // audience already establish the rep set.
            expect(wizardState.STEPS).toHaveLength(5);
            wizardState.STEPS.forEach((step, idx) => {
                expect(step.num).toBe(idx + 1);
                expect(typeof step.label).toBe('string');
                expect(typeof step.sub).toBe('string');
                expect(step.label.length).toBeGreaterThan(0);
            });
        });

        it('lists the 5 step names from the v2 wizard wireframe', () => {
            const labels = wizardState.STEPS.map((s) => s.label);
            expect(labels).toEqual([
                'Prerequisites', 'Connect Twilio', 'Voice config',
                'Phone numbers', 'Test & activate'
            ]);
        });
    });
});
