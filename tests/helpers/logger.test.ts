import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@helpers/logger';

describe('logger helper', () => {
    let consoleLogSpy: any;
    let consoleErrorSpy: any;
    let consoleWarnSpy: any;
    let consoleDirSpy: any;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        consoleDirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
        consoleDirSpy.mockRestore();
    });

    it('emits log text when forceLog is true', () => {
        logger.log('this isx a test', true);
        expect(consoleLogSpy).toHaveBeenCalledWith('this isx a test');
    });

    it('emits empty console.log when message is undefined and forceLog is true', () => {
        logger.log(undefined, true);
        expect(consoleLogSpy).toHaveBeenCalledWith();
    });

    it('passes additional params when forceLog is true', () => {
        logger.log('this is a test', true, 'extra param');
        expect(consoleLogSpy).toHaveBeenCalledWith('this is a test', 'extra param');
    });

    it('does not emit log text when forceLog is false and DEBUG is false', () => {
        logger.log('this is a test', false);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('defaults forceLog to false when omitted', () => {
        logger.log('this is a test');
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('handles multiple non-boolean arguments when forceLog is omitted', () => {
        logger.log('message:', { foo: 'bar' }, 123);
        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('delegates to console.error', () => {
        logger.error('an error occurred', { code: 500 });
        expect(consoleErrorSpy).toHaveBeenCalledWith('an error occurred', { code: 500 });
    });

    it('delegates to console.warn', () => {
        logger.warn('a warning', { code: 400 });
        expect(consoleWarnSpy).toHaveBeenCalledWith('a warning', { code: 400 });
    });

    it('does not log console.dir when DEBUG is false', () => {
        logger.dir({ key: 'val' });
        expect(consoleDirSpy).not.toHaveBeenCalled();
    });

    it('logs when DEBUG is configured to true', async () => {
        vi.resetModules();
        vi.doMock('@helpers/config', () => ({
            configGet: (key: string) => (key === 'DEBUG' ? 'true' : ''),
            config: { DEBUG: 'true' },
        }));

        const { logger: debugLogger } = await import('@helpers/logger');

        debugLogger.log('debug message');
        expect(consoleLogSpy).toHaveBeenCalledWith('debug message');

        debugLogger.log('debug multi', 'non-boolean-param', 42);
        expect(consoleLogSpy).toHaveBeenCalledWith('debug multi', 'non-boolean-param', 42);

        debugLogger.dir({ debug: true });
        expect(consoleDirSpy).toHaveBeenCalledWith({ debug: true });
    });
});
