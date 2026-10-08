import crypto from 'node:crypto';
import { cacheStore } from '@cache/cacheStore';
import { getWebAuthnConfig } from '@helpers/config';
import { AuthError } from '@services/auth/authContext';

export type CeremonyOperation = 'registration' | 'authentication';

export type CeremonyPayload = {
    jti: string;
    operation: CeremonyOperation;
    applicationId: string;
    applicationKey: string;
    rpId: string;
    origin: string;
    userId?: string;
    challenge: string;
    issuedAt: number;
    expiresAt: number;
};

function encode(value: string): string {
    return Buffer.from(value).toString('base64url');
}

function sign(body: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(body).digest('base64url');
}

function constantTimeEqual(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function invalidCeremony(): never {
    throw new AuthError('INVALID_PASSKEY_CEREMONY', 'Passkey ceremony is invalid or expired', 400);
}

export function createCeremony(input: {
    operation: CeremonyOperation;
    applicationId: string;
    applicationKey: string;
    rpId?: string;
    userId?: string;
    origin: string;
}): { token: string; payload: CeremonyPayload } {
    const config = getWebAuthnConfig();
    const rpId = input.rpId ?? config.rpId;
  if (!rpId) throw new AuthError('PASSKEY_RP_ID_MISSING', 'Passkey RP ID is not configured', 500);

    const issuedAt = Math.floor(Date.now() / 1000);
    const payload: CeremonyPayload = {
        jti: crypto.randomUUID(),
        operation: input.operation,
        applicationId: input.applicationId,
        applicationKey: input.applicationKey,
        rpId,
        origin: input.origin,
        userId: input.userId,
        challenge: crypto.randomBytes(32).toString('base64url'),
        issuedAt,
        expiresAt: issuedAt + config.ceremonyTtlSeconds,
    };

    const body = encode(JSON.stringify(payload));
    return { token: `${body}.${sign(body, config.signingSecret)}`, payload };
}

export async function consumeCeremony(
    token: unknown,
    expected: Partial<Pick<CeremonyPayload, 'operation' | 'applicationId' | 'applicationKey' | 'userId'>> = {},
): Promise<CeremonyPayload> {
    if (typeof token !== 'string') invalidCeremony();
    const [body, signature, ...extra] = token.split('.');
    if (!body || !signature || extra.length > 0) invalidCeremony();

    const config = getWebAuthnConfig();
    const signatures = [config.signingSecret, config.previousSigningSecret].filter(Boolean) as string[];
    if (!signatures.some((secret) => constantTimeEqual(signature, sign(body, secret)))) invalidCeremony();

    let payload: CeremonyPayload;
    try {
        payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CeremonyPayload;
    } catch {
        invalidCeremony();
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.jti || !payload.challenge || payload.expiresAt <= now || payload.issuedAt > now + 30) invalidCeremony();
    if (!payload.rpId || !payload.origin) invalidCeremony();
    for (const [key, value] of Object.entries(expected)) {
        if (value !== undefined && payload[key as keyof CeremonyPayload] !== value) invalidCeremony();
    }

    const claimed = await cacheStore.consumeOnce(
        `webauthn:ceremony:${payload.jti}`,
        Math.max(1, payload.expiresAt - now) * 1000,
    );
    if (!claimed) invalidCeremony();

    return payload;
}
