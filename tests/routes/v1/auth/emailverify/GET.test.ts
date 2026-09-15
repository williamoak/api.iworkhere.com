import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { AuthError } from '@services/auth/authContext';

vi.mock('@services/auth/emailVerificationService', () => ({
    verifyEmailToken: vi.fn(),
}));

vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        if (key === 'APP_URL') return 'https://app.iworkhere.com';
        return '';
    }),
}));

import GET, { schema } from '@routes/v1/auth/emailverify/GET';
import { verifyEmailToken } from '@services/auth/emailVerificationService';

function createMockReq(query: Record<string, unknown> = {}): Request {
    return {
        query,
        validated: { query },
    } as unknown as Request;
}

function createMockRes(): Response & { redirectedUrl?: string } {
    const res: any = {
        locals: {},
        redirect: vi.fn((url: string) => {
            res.redirectedUrl = url;
        }),
    };
    return res;
}

describe('GET /v1/auth/emailverify', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('verifies token successfully and redirects to success URL', async () => {
        vi.mocked(verifyEmailToken).mockResolvedValueOnce({ id: 'user-123' } as any);

        const req = createMockReq({ token: 'valid-token' });
        const res = createMockRes();

        await GET(req, res);

        expect(verifyEmailToken).toHaveBeenCalledWith('valid-token');
        expect(res.locals.visitUserId).toBe('user-123');
        expect(res.redirect).toHaveBeenCalledWith('https://app.iworkhere.com/verification-success?status=verified');
    });

    it('redirects to error URL with AuthError code when verification fails with AuthError', async () => {
        vi.mocked(verifyEmailToken).mockRejectedValueOnce(
            new AuthError('TOKEN_EXPIRED', 'Token expired', 400)
        );

        const req = createMockReq({ token: 'expired-token' });
        const res = createMockRes();

        await GET(req, res);

        expect(res.redirect).toHaveBeenCalledWith('https://app.iworkhere.com/verification-error?error=TOKEN_EXPIRED');
    });

    it('redirects to error URL with default VERIFICATION_FAILED code when unexpected error occurs', async () => {
        vi.mocked(verifyEmailToken).mockRejectedValueOnce(new Error('Generic database error'));

        const req = createMockReq({ token: 'bad-token' });
        const res = createMockRes();

        await GET(req, res);

        expect(res.redirect).toHaveBeenCalledWith('https://app.iworkhere.com/verification-error?error=VERIFICATION_FAILED');
    });
});
