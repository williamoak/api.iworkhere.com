import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    generateAuthenticationOptions: vi.fn(),
    generateRegistrationOptions: vi.fn(),
    verifyAuthenticationResponse: vi.fn(),
    verifyRegistrationResponse: vi.fn(),
    createCeremony: vi.fn(),
    consumeCeremony: vi.fn(),
    getWebAuthnConfig: vi.fn(() => ({ rpName: 'iworkhere', ceremonyTtlSeconds: 300 })),
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
}));

vi.mock('@simplewebauthn/server', () => ({
    generateAuthenticationOptions: mocks.generateAuthenticationOptions,
    generateRegistrationOptions: mocks.generateRegistrationOptions,
    verifyAuthenticationResponse: mocks.verifyAuthenticationResponse,
    verifyRegistrationResponse: mocks.verifyRegistrationResponse,
}));

vi.mock('@services/auth/ceremonyService', () => ({
    createCeremony: mocks.createCeremony,
    consumeCeremony: mocks.consumeCeremony,
}));

vi.mock('@helpers/config', () => ({
    getWebAuthnConfig: mocks.getWebAuthnConfig,
}));

vi.mock('@services/dbService', () => ({
    db: {
        select: mocks.select,
        insert: mocks.insert,
        update: mocks.update,
    },
}));

vi.mock('@db/schema', () => ({
    applicationOrigins: { applicationId: 'application_id', origin: 'origin', isEnabled: 'is_enabled' },
    applications: { id: 'id', appKey: 'app_key' },
    passkeyCredentials: {
        id: 'id',
        userId: 'user_id',
        applicationId: 'application_id',
        credentialId: 'credential_id',
        publicKey: 'public_key',
        signCount: 'sign_count',
        transports: 'transports',
        displayName: 'display_name',
        lastUsedAt: 'last_used_at',
        createdAt: 'created_at',
        revokedAt: 'revoked_at',
        updatedAt: 'updated_at',
    },
    users: { id: 'id', username: 'username', email: 'email' },
}));

import {
    assertApplication,
    createAuthenticationOptions,
    createRegistrationOptions,
    listPasskeys,
    resolveWebAuthnOrigin,
    revokePasskey,
    verifyAuthentication,
    verifyRegistration,
} from '@services/auth/webauthnService';

function query(result: unknown) {
    const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve(result)),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)),
    };
    return chain;
}

function setupDb(...results: unknown[]) {
    const queue = [...results];
    mocks.select.mockImplementation(() => query(queue.shift() ?? []));
}

const ceremony = {
    token: 'ceremony-token',
    payload: {
        challenge: 'challenge',
        rpId: 'bill.iworkhere.com',
        origin: 'https://bill.iworkhere.com',
    },
};

describe('webauthnService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.createCeremony.mockReturnValue(ceremony);
        mocks.consumeCeremony.mockResolvedValue(ceremony.payload);
        mocks.generateRegistrationOptions.mockResolvedValue({ challenge: 'registration-options' });
        mocks.generateAuthenticationOptions.mockResolvedValue({ challenge: 'authentication-options' });
        mocks.insert.mockReturnValue({
            values: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue([{ id: 'credential-row', displayName: 'Laptop' }]),
            })),
        });
        mocks.update.mockReturnValue({
            set: vi.fn(() => ({
                where: vi.fn(() => ({
                    returning: vi.fn().mockResolvedValue([{ id: 'credential-row' }]),
                })),
            })),
        });
    });

    it('creates registration options and excludes active credentials', async () => {
        setupDb([{ credentialId: 'existing', transports: ['usb'] }]);

        await expect(createRegistrationOptions({
            userId: 'user-id',
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
            username: 'bill@example.com',
            origin: ceremony.payload.origin,
            rpId: ceremony.payload.rpId,
        })).resolves.toEqual({ ceremonyToken: 'ceremony-token', publicKey: { challenge: 'registration-options' } });

        expect(mocks.createCeremony).toHaveBeenCalledWith(expect.objectContaining({
            operation: 'registration',
            userId: 'user-id',
            rpId: 'bill.iworkhere.com',
        }));
        expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
            userName: 'bill@example.com',
            userDisplayName: 'bill@example.com',
            excludeCredentials: [{ id: 'existing', transports: ['usb'] }],
        }));
    });

    it('uses a supplied display name and handles credentials without transports', async () => {
        setupDb([{ credentialId: 'existing', transports: null }]);

        await createRegistrationOptions({
            userId: 'user-id',
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
            username: 'bill@example.com',
            displayName: 'Bill phone',
            origin: ceremony.payload.origin,
            rpId: ceremony.payload.rpId,
        });

        expect(mocks.generateRegistrationOptions).toHaveBeenCalledWith(expect.objectContaining({
            userDisplayName: 'Bill phone',
            excludeCredentials: [{ id: 'existing', transports: undefined }],
        }));
    });

    it('creates authentication options bound to the application origin', async () => {
        await expect(createAuthenticationOptions({
            applicationId: 'app-id',
            applicationKey: 'bill.iworkhere.com',
            origin: ceremony.payload.origin,
            rpId: ceremony.payload.rpId,
        })).resolves.toEqual({ ceremonyToken: 'ceremony-token', publicKey: { challenge: 'authentication-options' } });

        expect(mocks.createCeremony).toHaveBeenCalledWith(expect.objectContaining({ operation: 'authentication' }));
        expect(mocks.generateAuthenticationOptions).toHaveBeenCalledWith({
            rpID: ceremony.payload.rpId,
            challenge: ceremony.payload.challenge,
            timeout: 60000,
            userVerification: 'preferred',
        });
    });

    it('registers a verified credential', async () => {
        setupDb([],);
        mocks.verifyRegistrationResponse.mockResolvedValue({
            verified: true,
            registrationInfo: {
                credential: { id: 'new-credential', publicKey: Uint8Array.from([1, 2, 3]), counter: 4 },
            },
        });

        await expect(verifyRegistration({
            ceremonyToken: 'ceremony-token',
            response: { id: 'response-id', response: {} } as any,
            userId: 'user-id',
            applicationId: 'app-id',
        })).resolves.toEqual({ id: 'credential-row', displayName: 'Laptop' });

        expect(mocks.consumeCeremony).toHaveBeenCalledWith('ceremony-token', {
            operation: 'registration', applicationId: 'app-id', userId: 'user-id',
        });
        expect(mocks.insert).toHaveBeenCalled();
    });

    it('rejects failed registration verification and duplicate credentials', async () => {
        mocks.verifyRegistrationResponse.mockResolvedValue({ verified: false });
        await expect(verifyRegistration({
            ceremonyToken: 'token', response: {} as any, userId: 'user', applicationId: 'app',
        })).rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        mocks.verifyRegistrationResponse.mockResolvedValue({
            verified: true,
            registrationInfo: { credential: { id: 'duplicate', publicKey: Uint8Array.from([1]), counter: 1 } },
        });
        setupDb([{ id: 'existing' }]);
        await expect(verifyRegistration({
            ceremonyToken: 'token', response: {} as any, userId: 'user', applicationId: 'app',
        })).rejects.toMatchObject({ code: 'PASSKEY_ALREADY_REGISTERED' });
    });

    it('authenticates a credential, updates its counter, and returns its user', async () => {
        setupDb(
            [{ id: 'row', userId: 'user-id', credentialId: 'credential', publicKey: Buffer.from([1]).toString('base64url'), signCount: 2, transports: null }],
            [{ id: 'user-id', username: 'Bill', email: 'bill@example.com' }],
        );
        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 3 } });

        await expect(verifyAuthentication({
            ceremonyToken: 'token',
            response: { id: 'credential' } as any,
            applicationId: 'app-id',
        })).resolves.toEqual({ user: { id: 'user-id', username: 'Bill', email: 'bill@example.com' }, applicationId: 'app-id' });

        expect(mocks.verifyAuthenticationResponse).toHaveBeenCalledWith(expect.objectContaining({
            expectedChallenge: 'challenge',
            expectedOrigin: ceremony.payload.origin,
            expectedRPID: ceremony.payload.rpId,
            credential: expect.objectContaining({ counter: 2, transports: undefined }),
        }));
    });

    it('rejects missing, unverified, rolled-back, concurrently updated, or unknown credentials', async () => {
        setupDb([]);
        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'missing' } as any, applicationId: 'app' }))
            .rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        const credential = { id: 'row', userId: 'user', credentialId: 'credential', publicKey: Buffer.from([1]).toString('base64url'), signCount: 2, transports: [] };
        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: false, authenticationInfo: { newCounter: 3 } });
        setupDb([credential]);
        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'credential' } as any, applicationId: 'app' }))
            .rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 2 } });
        setupDb([credential]);
        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'credential' } as any, applicationId: 'app' }))
            .rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 3 } });
        setupDb([credential]);
        mocks.update.mockReturnValue({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) });
        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'credential' } as any, applicationId: 'app' }))
            .rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        setupDb([credential], []);
        mocks.update.mockReturnValue({
            set: vi.fn(() => ({
                where: vi.fn(() => ({
                    returning: vi.fn().mockResolvedValue([{ id: 'credential-row' }]),
                })),
            })),
        });
        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'credential' } as any, applicationId: 'app' }))
            .rejects.toMatchObject({ code: 'INVALID_PASSKEY' });
    });

    it('allows a zero counter credential to remain at zero', async () => {
        const credential = { id: 'row', userId: 'user', credentialId: 'credential', publicKey: Buffer.from([1]).toString('base64url'), signCount: 0, transports: [] };
        setupDb([credential], [{ id: 'user', username: 'Bill', email: 'bill@example.com' }]);
        mocks.verifyAuthenticationResponse.mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 0 } });

        await expect(verifyAuthentication({ ceremonyToken: 'token', response: { id: 'credential' } as any, applicationId: 'app' }))
            .resolves.toMatchObject({ applicationId: 'app' });
    });

    it('asserts application ownership and exposes list/revoke operations', async () => {
        setupDb([{ id: 'app-id' }]);
        await expect(assertApplication('app-id', 'bill.iworkhere.com')).resolves.toBeUndefined();

        setupDb([]);
        await expect(assertApplication('other', 'bill.iworkhere.com')).rejects.toMatchObject({ code: 'INVALID_PASSKEY' });

        const passkeys = [{ id: 'credential', displayName: 'Laptop', revokedAt: null }];
        setupDb(passkeys);
        await expect(listPasskeys('user-id', 'app-id')).resolves.toEqual(passkeys);

        const revoked = await revokePasskey('user-id', 'app-id', 'credential');
        expect(revoked).toEqual([{ id: 'credential-row' }]);
        expect(mocks.update).toHaveBeenCalled();
    });

    it('resolves valid application origins and rejects invalid registrations', async () => {
        setupDb([{ origin: 'https://bill.iworkhere.com' }]);
        await expect(resolveWebAuthnOrigin('app-id', undefined)).resolves.toEqual({
            origin: 'https://bill.iworkhere.com', rpId: 'bill.iworkhere.com',
        });

        await expect(resolveWebAuthnOrigin('app-id', 'not-an-origin'))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });
        await expect(resolveWebAuthnOrigin('app-id', 'http://bill.iworkhere.com'))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });

        setupDb([]);
        await expect(resolveWebAuthnOrigin('app-id', undefined))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });

        setupDb([{ origin: 'https://bill.iworkhere.com' }, { origin: 'https://admin.bill.iworkhere.com' }]);
        await expect(resolveWebAuthnOrigin('app-id', undefined))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });

        setupDb([{ origin: 'http://localhost:3000' }]);
        await expect(resolveWebAuthnOrigin('app-id', 'http://localhost:3000/path')).resolves.toEqual({
            origin: 'http://localhost:3000', rpId: 'localhost',
        });

        setupDb([{ origin: 'http://bill.iworkhere.com' }]);
        await expect(resolveWebAuthnOrigin('app-id', undefined)).rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });
    });
});