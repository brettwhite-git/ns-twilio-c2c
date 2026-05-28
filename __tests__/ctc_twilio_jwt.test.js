import jwtModule from 'SuiteScripts/lib/ctc_twilio_jwt';
import crypto from 'N/crypto';
import encode from 'N/encode';

jest.mock('N/crypto');
jest.mock('N/encode');

describe('ctc_twilio_jwt', () => {
    const mockOptions = {
        accountSid: 'AC1234567890abcdef1234567890abcdef',
        apiKeySid: 'SK1234567890abcdef1234567890abcdef',
        apiSecretId: 'custsecret_ctc_api_key_secret',
        twimlAppSid: 'AP1234567890abcdef1234567890abcdef',
        identity: 'emp_42'
    };

    let mockHmac;
    let mockKey;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock encode.convert to simulate base64url encoding
        encode.convert.mockImplementation(({ string }) => {
            // Return a deterministic base64url-ish value based on input
            return Buffer.from(string).toString('base64')
                .replace(/\+/g, '-').replace(/\//g, '_');
        });

        // Mock crypto chain: createSecretKey -> createHmac -> update -> digest
        mockKey = { type: 'secret' };
        mockHmac = {
            update: jest.fn(),
            digest: jest.fn().mockReturnValue('mocked-signature-base64url')
        };

        crypto.createSecretKey.mockReturnValue(mockKey);
        crypto.createHmac.mockReturnValue(mockHmac);
    });

    describe('generateAccessToken', () => {
        it('returns a JWT with three dot-separated parts', () => {
            const token = jwtModule.generateAccessToken(mockOptions);
            const parts = token.split('.');
            expect(parts).toHaveLength(3);
        });

        it('encodes the header with correct fields', () => {
            jwtModule.generateAccessToken(mockOptions);

            // First call to encode.convert is the header
            const headerCall = encode.convert.mock.calls[0][0];
            const header = JSON.parse(headerCall.string);

            expect(header).toEqual({
                typ: 'JWT',
                alg: 'HS256',
                cty: 'twilio-fpa;v=1'
            });
        });

        it('encodes the payload with correct structure', () => {
            const now = Math.floor(Date.now() / 1000);
            jwtModule.generateAccessToken(mockOptions);

            // Second call to encode.convert is the payload
            const payloadCall = encode.convert.mock.calls[1][0];
            const payload = JSON.parse(payloadCall.string);

            expect(payload.iss).toBe(mockOptions.apiKeySid);
            expect(payload.sub).toBe(mockOptions.accountSid);
            expect(payload.jti).toMatch(new RegExp('^' + mockOptions.apiKeySid + '-\\d+$'));
            expect(payload.iat).toBeGreaterThanOrEqual(now - 1);
            expect(payload.iat).toBeLessThanOrEqual(now + 1);
            expect(payload.exp).toBe(payload.iat + 3600);
            expect(payload).not.toHaveProperty('nbf');
        });

        it('sets correct grants for outbound voice', () => {
            jwtModule.generateAccessToken(mockOptions);

            const payloadCall = encode.convert.mock.calls[1][0];
            const payload = JSON.parse(payloadCall.string);

            expect(payload.grants).toEqual({
                identity: 'emp_42',
                voice: {
                    outgoing: { application_sid: mockOptions.twimlAppSid },
                    incoming: { allow: false }
                }
            });
        });

        it('uses BASE_64_URL_SAFE encoding for header and payload', () => {
            jwtModule.generateAccessToken(mockOptions);

            for (const call of encode.convert.mock.calls) {
                expect(call[0].inputEncoding).toBe(encode.Encoding.UTF_8);
                expect(call[0].outputEncoding).toBe(encode.Encoding.BASE_64_URL_SAFE);
            }
        });

        it('creates secret key with the API secret ID', () => {
            jwtModule.generateAccessToken(mockOptions);

            expect(crypto.createSecretKey).toHaveBeenCalledWith({
                secret: 'custsecret_ctc_api_key_secret',
                encoding: encode.Encoding.UTF_8
            });
        });

        it('creates HMAC with SHA256 and the secret key', () => {
            jwtModule.generateAccessToken(mockOptions);

            expect(crypto.createHmac).toHaveBeenCalledWith({
                algorithm: crypto.HashAlg.SHA256,
                key: mockKey
            });
        });

        it('signs the header.payload string', () => {
            jwtModule.generateAccessToken(mockOptions);

            const updateCall = mockHmac.update.mock.calls[0][0];
            expect(updateCall.input).toContain('.');
            expect(updateCall.inputEncoding).toBe(encode.Encoding.UTF_8);

            // The signing input should be headerB64.payloadB64
            const parts = updateCall.input.split('.');
            expect(parts).toHaveLength(2);
        });

        it('digests with BASE_64_URL_SAFE encoding', () => {
            jwtModule.generateAccessToken(mockOptions);

            expect(mockHmac.digest).toHaveBeenCalledWith({
                outputEncoding: encode.Encoding.BASE_64_URL_SAFE
            });
        });

        it('defaults TTL to 3600 seconds', () => {
            jwtModule.generateAccessToken(mockOptions);

            const payloadCall = encode.convert.mock.calls[1][0];
            const payload = JSON.parse(payloadCall.string);

            expect(payload.exp - payload.iat).toBe(3600);
        });

        it('respects custom TTL', () => {
            jwtModule.generateAccessToken({ ...mockOptions, ttl: 7200 });

            const payloadCall = encode.convert.mock.calls[1][0];
            const payload = JSON.parse(payloadCall.string);

            expect(payload.exp - payload.iat).toBe(7200);
        });

        it('strips padding characters from base64url output', () => {
            encode.convert.mockReturnValue('abc=def==');
            mockHmac.digest.mockReturnValue('sig==');

            const token = jwtModule.generateAccessToken(mockOptions);

            expect(token).not.toContain('=');
        });

        it('strips newlines from base64url output', () => {
            encode.convert.mockReturnValue('abc\ndef\r\n');
            mockHmac.digest.mockReturnValue('sig\n');

            const token = jwtModule.generateAccessToken(mockOptions);

            expect(token).not.toMatch(/[\n\r]/);
        });
    });
});
