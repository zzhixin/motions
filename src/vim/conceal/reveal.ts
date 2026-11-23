import type { ChangeDesc } from '@codemirror/state';
import type { ConcealGroup, ConcealSpan } from './model';

const key = (span: ConcealSpan) => `${span.from}:${span.to}`;
const contains = (span: ConcealSpan, head: number) =>
    span.from <= head && head < span.to;

/** Open source belongs to a syntax group, never to a merged decoration span. */
export class RevealedRegions {
    private opened: ConcealSpan[] = [];
    private keys = new Set<string>();
    version = 0;

    sync(head: number, changes?: ChangeDesc): void {
        const next: ConcealSpan[] = [];
        const replaced: ConcealSpan[] = [];
        changes?.iterChangedRanges((from, to) => {
            if (from < to) replaced.push({ from, to });
        });
        for (const span of this.opened) {
            if (
                replaced.some(
                    (change) =>
                        change.from <= span.from && span.to <= change.to,
                )
            )
                continue;
            const mapped = changes
                ? {
                      from: changes.mapPos(span.from, -1),
                      to: changes.mapPos(span.to, 1),
                  }
                : span;
            if (contains(mapped, head)) next.push(mapped);
        }
        if (
            next.length === this.opened.length &&
            next.every((span, i) => key(span) === key(this.opened[i]!))
        )
            return;
        this.opened = next;
        this.keys = new Set(next.map(key));
        this.version++;
    }

    reveal(groups: readonly ConcealGroup[], head: number): void {
        for (const group of groups) {
            if (!contains(group, head) || this.keys.has(key(group))) continue;
            this.opened.push({ from: group.from, to: group.to });
            this.keys.add(key(group));
            this.version++;
        }
    }

    concealed(groups: readonly ConcealGroup[]): readonly ConcealGroup[] {
        return this.keys.size
            ? groups.filter((group) => !this.keys.has(key(group)))
            : groups;
    }

    clear(): void {
        if (!this.opened.length) return;
        this.opened = [];
        this.keys.clear();
        this.version++;
    }
}
