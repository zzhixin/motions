export interface ConcealOptions {
    policy: 'delay' | 'insert';
    delay: number;
}
export function concealDelay(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(10_000, Math.round(value)))
        : 200;
}
