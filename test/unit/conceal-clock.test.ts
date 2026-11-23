import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevealClock } from '../../src/vim/conceal/clock';
import { concealDelay } from '../../src/vim/conceal/options';

afterEach(() => vi.useRealTimers());

describe('Conceal reveal deadline', () => {
    it('uses the configured milliseconds and restarts after movement', () => {
        vi.useFakeTimers();
        const clock = new RevealClock(),
            reveal = vi.fn();
        clock.schedule(200, reveal);
        vi.advanceTimersByTime(199);
        expect.soft(reveal).toHaveBeenCalledTimes(0);
        clock.schedule(350, reveal);
        vi.advanceTimersByTime(349);
        expect.soft(reveal).toHaveBeenCalledTimes(0);
        vi.advanceTimersByTime(1);
        expect.soft(reveal).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(1000);
        expect.soft(reveal).toHaveBeenCalledTimes(1);
    });
    it('cancels pending work on mode change or disposal', () => {
        vi.useFakeTimers();
        const clock = new RevealClock(),
            reveal = vi.fn();
        clock.schedule(200, reveal);
        clock.cancel();
        expect.soft(vi.getTimerCount()).toBe(0);
        vi.advanceTimersByTime(1000);
        expect(reveal).toHaveBeenCalledTimes(0);
    });
    it.each([
        [0, 0],
        [41.8, 42],
        [-9, 0],
        [20000, 10000],
        [NaN, 200],
        ['200', 200],
    ] as const)('normalizes delay %s to %s ms', (input, expected) => {
        expect(concealDelay(input)).toBe(expected);
    });
});
