import { beforeEach, describe, expect, it, vi } from 'vitest';

const { select } = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@services/dbService', () => ({
    db: { select },
}));

vi.mock('@db/schema', () => ({
    applicationOrigins: {
        applicationId: 'application_id',
        origin: 'origin',
        isEnabled: 'is_enabled',
    },
}));

vi.mock('@helpers/config', () => ({
    configGet: vi.fn(),
    getWebAuthnConfig: vi.fn(() => ({
        rpName: 'iworkhere',
        ceremonyTtlSeconds: 300,
        signingSecret: 'test-signing-secret',
    })),
}));

import { resolveWebAuthnOrigin } from '@services/auth/webauthnService';

function mockOriginRows(rows: Array<{ origin: string }>) {
    select.mockReturnValue({
        from: () => ({
            where: () => ({
                limit: () => Promise.resolve(rows),
            }),
        }),
    });
}

describe('resolveWebAuthnOrigin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('resolves the RP ID from the selected application origin', async () => {
        mockOriginRows([{ origin: 'https://bill.iworkhere.com' }]);

        await expect(resolveWebAuthnOrigin('bill-app-id', 'https://BILL.iworkhere.com/path'))
            .resolves.toEqual({
                origin: 'https://bill.iworkhere.com',
                rpId: 'bill.iworkhere.com',
            });
    });

    it('rejects an origin that is not registered for the selected application', async () => {
        mockOriginRows([]);

        await expect(resolveWebAuthnOrigin('michael-app-id', 'https://bill.iworkhere.com'))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });
    });

    it('uses the only enabled application origin for native requests without an Origin header', async () => {
        mockOriginRows([{ origin: 'https://michael.iworkhere.com' }]);

        await expect(resolveWebAuthnOrigin('michael-app-id', undefined))
            .resolves.toEqual({
                origin: 'https://michael.iworkhere.com',
                rpId: 'michael.iworkhere.com',
            });
    });

    it('rejects headerless applications with multiple enabled origins', async () => {
        mockOriginRows([
            { origin: 'https://bill.iworkhere.com' },
            { origin: 'https://admin.bill.iworkhere.com' },
        ]);

        await expect(resolveWebAuthnOrigin('bill-app-id', undefined))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });
    });

    it('rejects non-HTTPS origins except localhost development origins', async () => {
        await expect(resolveWebAuthnOrigin('bill-app-id', 'http://bill.iworkhere.com'))
            .rejects.toMatchObject({ code: 'PASSKEY_ORIGIN_NOT_ALLOWED' });
        expect(select).not.toHaveBeenCalled();
    });
});