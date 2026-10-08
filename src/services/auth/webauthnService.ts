import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
    AuthenticationResponseJSON,
    RegistrationResponseJSON,
    WebAuthnCredential,
} from '@simplewebauthn/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@services/dbService';
import { applicationOrigins, applications, passkeyCredentials, users } from '@db/schema';
import { getWebAuthnConfig } from '@helpers/config';
import { AuthError } from '@services/auth/authContext';
import { createCeremony, consumeCeremony } from '@services/auth/ceremonyService';

function invalidPasskey(): never {
    throw new AuthError('INVALID_PASSKEY', 'Passkey authentication failed', 400);
}

export async function resolveWebAuthnOrigin(applicationId: string, origin: unknown): Promise<{ origin: string; rpId: string }> {
    let normalizedOrigin: string | undefined;
    if (typeof origin === 'string') {
        try {
            const parsed = new URL(origin);
            if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error('insecure origin');
            normalizedOrigin = parsed.origin.toLowerCase();
        } catch {
            throw new AuthError('PASSKEY_ORIGIN_NOT_ALLOWED', 'Passkey origin is not allowed', 400);
        }
    }

    const conditions = [
        eq(applicationOrigins.applicationId, applicationId),
        eq(applicationOrigins.isEnabled, true),
    ];
    if (normalizedOrigin) conditions.push(eq(applicationOrigins.origin, normalizedOrigin));

    const rows = await db.select({ origin: applicationOrigins.origin })
        .from(applicationOrigins)
        .where(and(...conditions))
        .limit(normalizedOrigin ? 1 : 2);

    if (rows.length === 0 || (!normalizedOrigin && rows.length !== 1)) {
        throw new AuthError('PASSKEY_ORIGIN_NOT_ALLOWED', 'Passkey origin is not allowed', 400);
    }

    const trustedOrigin = normalizedOrigin ?? rows[0].origin;
    try {
        const trustedUrl = new URL(trustedOrigin);
        if (trustedUrl.protocol !== 'https:' && trustedUrl.hostname !== 'localhost') throw new Error('insecure origin');
        return { origin: trustedUrl.origin.toLowerCase(), rpId: trustedUrl.hostname.toLowerCase() };
    } catch {
        throw new AuthError('PASSKEY_ORIGIN_NOT_ALLOWED', 'Passkey origin is not allowed', 400);
    }
}

export async function createRegistrationOptions(input: {
    userId: string;
    applicationId: string;
    applicationKey: string;
    username: string;
    displayName?: string;
    origin: string;
    rpId: string;
}) {
    const config = getWebAuthnConfig();
    const existing = await db
        .select({ credentialId: passkeyCredentials.credentialId, transports: passkeyCredentials.transports })
        .from(passkeyCredentials)
        .where(and(
            eq(passkeyCredentials.userId, input.userId),
            eq(passkeyCredentials.applicationId, input.applicationId),
            isNull(passkeyCredentials.revokedAt),
        ));

    const ceremony = createCeremony({
        operation: 'registration',
        applicationId: input.applicationId,
        applicationKey: input.applicationKey,
        rpId: input.rpId,
        userId: input.userId,
        origin: input.origin,
    });
    const publicKey = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: ceremony.payload.rpId,
        userName: input.username,
        userDisplayName: input.displayName || input.username,
        userID: Buffer.from(input.userId),
        challenge: ceremony.payload.challenge,
        attestationType: 'none',
        excludeCredentials: existing.map((credential) => ({
            id: credential.credentialId,
            transports: credential.transports ?? undefined,
        })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    return { ceremonyToken: ceremony.token, publicKey };
}

export async function verifyRegistration(input: {
    ceremonyToken: string;
    response: RegistrationResponseJSON;
    userId: string;
    applicationId: string;
    displayName?: string;
}) {
    const ceremony = await consumeCeremony(input.ceremonyToken, {
        operation: 'registration',
        applicationId: input.applicationId,
        userId: input.userId,
    });
    const result = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: ceremony.challenge,
        expectedOrigin: ceremony.origin,
        expectedRPID: ceremony.rpId,
    });
    if (!result.verified || !result.registrationInfo) invalidPasskey();

    const credential = result.registrationInfo.credential;
    const duplicate = await db
        .select({ id: passkeyCredentials.id })
        .from(passkeyCredentials)
        .where(eq(passkeyCredentials.credentialId, credential.id))
        .limit(1);
    if (duplicate.length > 0) {
        throw new AuthError('PASSKEY_ALREADY_REGISTERED', 'Passkey is already registered', 409);
    }

    const inserted = await db.insert(passkeyCredentials).values({
        userId: input.userId,
        applicationId: input.applicationId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString('base64url'),
        signCount: credential.counter,
        transports: input.response.response.transports ?? null,
        displayName: input.displayName ?? null,
    }).returning({ id: passkeyCredentials.id, displayName: passkeyCredentials.displayName });

    return inserted[0];
}

export async function createAuthenticationOptions(input: {
    applicationId: string;
    applicationKey: string;
    origin: string;
    rpId: string;
}) {
    const ceremony = createCeremony({
        operation: 'authentication',
        applicationId: input.applicationId,
        applicationKey: input.applicationKey,
        rpId: input.rpId,
        origin: input.origin,
    });
    const publicKey = await generateAuthenticationOptions({
        rpID: ceremony.payload.rpId,
        challenge: ceremony.payload.challenge,
        timeout: 60000,
        userVerification: 'preferred',
    });
    return { ceremonyToken: ceremony.token, publicKey };
}

export async function verifyAuthentication(input: {
    ceremonyToken: string;
    response: AuthenticationResponseJSON;
    applicationId: string;
}) {
    const ceremony = await consumeCeremony(input.ceremonyToken, {
        operation: 'authentication',
        applicationId: input.applicationId,
    });
    const rows = await db
        .select({
            id: passkeyCredentials.id,
            userId: passkeyCredentials.userId,
            credentialId: passkeyCredentials.credentialId,
            publicKey: passkeyCredentials.publicKey,
            signCount: passkeyCredentials.signCount,
            transports: passkeyCredentials.transports,
        })
        .from(passkeyCredentials)
        .where(and(
            eq(passkeyCredentials.applicationId, input.applicationId),
            eq(passkeyCredentials.credentialId, input.response.id),
            isNull(passkeyCredentials.revokedAt),
        ))
        .limit(1);
    if (rows.length === 0) invalidPasskey();
    const credential = rows[0];

    const result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: ceremony.challenge,
        expectedOrigin: ceremony.origin,
        expectedRPID: ceremony.rpId,
        credential: {
            id: credential.credentialId,
            publicKey: Uint8Array.from(Buffer.from(credential.publicKey, 'base64url')),
            counter: credential.signCount,
            transports: credential.transports ?? undefined,
        } satisfies WebAuthnCredential,
    });
    if (!result.verified) invalidPasskey();

    const newCounter = result.authenticationInfo.newCounter;
    if (credential.signCount !== 0 && newCounter !== 0 && newCounter <= credential.signCount) invalidPasskey();
    const updated = await db.update(passkeyCredentials)
        .set({ signCount: newCounter, lastUsedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(passkeyCredentials.id, credential.id),
            eq(passkeyCredentials.signCount, credential.signCount),
        ))
        .returning({ id: passkeyCredentials.id });
    if (updated.length === 0) invalidPasskey();

    const user = await db.select({ id: users.id, username: users.username, email: users.email })
        .from(users)
        .where(eq(users.id, credential.userId))
        .limit(1);
    if (user.length === 0) invalidPasskey();
    return { user: user[0], applicationId: input.applicationId };
}

export async function assertApplication(applicationId: string, applicationKey: string): Promise<void> {
    const row = await db.select({ id: applications.id }).from(applications)
        .where(and(eq(applications.id, applicationId), eq(applications.appKey, applicationKey)))
        .limit(1);
    if (row.length === 0) invalidPasskey();
}

export async function listPasskeys(userId: string, applicationId: string) {
    return db.select({
        id: passkeyCredentials.id,
        credentialId: passkeyCredentials.credentialId,
        displayName: passkeyCredentials.displayName,
        transports: passkeyCredentials.transports,
        lastUsedAt: passkeyCredentials.lastUsedAt,
        createdAt: passkeyCredentials.createdAt,
        revokedAt: passkeyCredentials.revokedAt,
    }).from(passkeyCredentials).where(and(
        eq(passkeyCredentials.userId, userId),
        eq(passkeyCredentials.applicationId, applicationId),
    ));
}

export async function revokePasskey(userId: string, applicationId: string, credentialId: string) {
    return db.update(passkeyCredentials).set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(passkeyCredentials.id, credentialId),
            eq(passkeyCredentials.userId, userId),
            eq(passkeyCredentials.applicationId, applicationId),
            isNull(passkeyCredentials.revokedAt),
        )).returning({ id: passkeyCredentials.id });
}
