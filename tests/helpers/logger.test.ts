import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger } from '@helpers/logger';

describe('logger helper', () => {
    let consoleLogSpy: any;

    beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
    });

    it('emits log text when forceLog is true', () => {
        logger.log('this isx a test', true);
        expect(consoleLogSpy).toHaveBeenCalledWith('this isx a test');
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
});
