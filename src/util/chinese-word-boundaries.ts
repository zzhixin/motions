export interface WordSpan {
    from: number;
    to: number;
}

interface WordSegmenter {
    segment(text: string): Iterable<{ index: number; segment: string }>;
}

// Keep the ES2021 target and allow older WebViews without Intl.Segmenter.
type SegmenterConstructor = new (
    locale: string,
    options: { granularity: 'word' },
) => WordSegmenter;

const HAN = /[\p{Script=Han}\u3007]/u;
const HAN_RUN = /[\p{Script=Han}\u3007]+/gu;
const CHUNK_SIZE = 256;
const CACHE_SIZE = 64;

/** UTF-16 offset of the complete code point containing ch. */
export function codePointStart(text: string, ch: number): number {
    const code = text.charCodeAt(ch);
    return code >= 0xdc00 && code <= 0xdfff && ch > 0 ? ch - 1 : ch;
}

export function isHan(text: string, ch: number): boolean {
    const code = text.codePointAt(codePointStart(text, ch));
    return code !== undefined && HAN.test(String.fromCodePoint(code));
}

/**
 * Lazy, synchronous Han-only segmentation. Cache keys are immutable text, so
 * edits, undo and separate editors cannot reuse stale offsets. Both retained
 * input (64 × at most 257 UTF-16 units) and each native segmentation call are bounded.
 * Fixed windows trade dictionary context at a window edge for bounded latency.
 */
export class ChineseWordBoundaries {
    private segmenter: WordSegmenter | null | undefined;
    private readonly cache = new Map<string, readonly WordSpan[]>();

    spanAt(text: string, ch: number): WordSpan | null {
        if (!isHan(text, ch)) return null;
        ch = codePointStart(text, ch);
        const base = Math.floor(ch / CHUNK_SIZE) * CHUNK_SIZE;
        const from = codePointStart(text, base) < base ? base + 1 : base;
        let to = Math.min(base + CHUNK_SIZE, text.length);
        if (codePointStart(text, to) < to) to++;
        const chunk = text.slice(from, to);
        let spans = this.cache.get(chunk);
        if (spans) this.cache.delete(chunk);
        else spans = this.split(chunk);
        this.cache.set(chunk, spans);
        if (this.cache.size > CACHE_SIZE) {
            this.cache.delete(this.cache.keys().next().value!);
        }
        const offset = ch - from;
        const span = spans.find(
            (span) => span.from <= offset && offset < span.to,
        );
        return span ? { from: from + span.from, to: from + span.to } : null;
    }

    private split(text: string): readonly WordSpan[] {
        if (this.segmenter === undefined) {
            const Constructor = (
                Intl as typeof Intl & {
                    Segmenter?: SegmenterConstructor;
                }
            ).Segmenter;
            this.segmenter = Constructor
                ? new Constructor('zh', { granularity: 'word' })
                : null;
        }
        const spans: WordSpan[] = [];
        for (const match of text.matchAll(HAN_RUN)) {
            if (this.segmenter) {
                for (const part of this.segmenter.segment(match[0])) {
                    const from = match.index + part.index;
                    spans.push({ from, to: from + part.segment.length });
                }
            } else {
                let from = match.index;
                for (const point of match[0]) {
                    spans.push({ from, to: from + point.length });
                    from += point.length;
                }
            }
        }
        return spans;
    }
}
