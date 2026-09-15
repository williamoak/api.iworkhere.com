import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

vi.mock('@services/dbService', () => ({
    verifyConnection: vi.fn().mockResolvedValue(true),
}));

vi.mock('@src/appFactory', () => ({
    createBaseApp: vi.fn().mockResolvedValue({}),
}));

vi.mock('@loaders/swagger', () => ({
    loadSwagger: vi.fn(),
}));

vi.mock('@jobs/cleanupExpiredTokens', () => ({
    startCleanupJob: vi.fn(),
}));

vi.mock('@helpers/config', () => ({
    configGet: vi.fn((key: string) => {
        if (key === 'HOST_IP') return '127.0.0.1';
        return '';
    }),
}));

describe('Server Bootstrap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('bootstraps server in development environment', async () => {
        process.env.NODE_ENV = 'development';
        process.env.CLEANUP_JOB_INTERVAL_MS = '60000';

        const mockServer: any = {
            listen: vi.fn((port, host, callback) => {
                if (callback) callback();
                return mockServer;
            }),
        };
        const createServerSpy = vi.spyOn(http, 'createServer').mockReturnValue(mockServer);

        const { bootstrap } = await import('@src/server');
        const { verifyConnection } = await import('@services/dbService');
        const { startCleanupJob } = await import('@jobs/cleanupExpiredTokens');
        const { loadSwagger } = await import('@loaders/swagger');

        await bootstrap();

        expect(verifyConnection).toHaveBeenCalled();
        expect(startCleanupJob).toHaveBeenCalledWith(60000);
        expect(loadSwagger).toHaveBeenCalled();
        expect(createServerSpy).toHaveBeenCalled();
        expect(mockServer.listen).toHaveBeenCalledWith(4300, '127.0.0.1', expect.any(Function));

        createServerSpy.mockRestore();
    });

    it('bootstraps server in production environment without loading swagger', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.CLEANUP_JOB_INTERVAL_MS;

        const mockServer: any = {
            listen: vi.fn((port, host, callback) => {
                if (callback) callback();
                return mockServer;
            }),
        };
        const createServerSpy = vi.spyOn(http, 'createServer').mockReturnValue(mockServer);

        const { bootstrap } = await import('@src/server');
        const { startCleanupJob } = await import('@jobs/cleanupExpiredTokens');
        const { loadSwagger } = await import('@loaders/swagger');

        await bootstrap();

        expect(startCleanupJob).toHaveBeenCalledWith(3600000);
        expect(loadSwagger).not.toHaveBeenCalled();

        createServerSpy.mockRestore();
    });
});
