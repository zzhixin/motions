import { findClusterBreak } from '@codemirror/state';

export interface ConcealSpan {
    from: number;
    to: number;
}
export interface ConcealToken extends ConcealSpan {
    name: string;
}
export interface ConcealGroup extends ConcealSpan {
    hidden: ConcealSpan[];
}

/** One source line, using Obsidian's syntax tokens rather than a second Markdown parser. */
export function concealGroups(
    text: string,
    offset: number,
    tokens: readonly ConcealToken[],
): ConcealGroup[] {
    const result: ConcealGroup[] = [];
    const paired = new Map<string, ConcealToken>();
    let wiki: { token: ConcealToken; label: number } | null = null;
    let link: {
        token: ConcealToken;
        labelEnd?: number;
        destination?: boolean;
    } | null = null;
    const excluded = tokens
        .filter((t) => /(?:codeblock|math|frontmatter|table-row)/i.test(t.name))
        .sort((a, b) => a.from - b.from);
    let excludedIndex = 0,
        excludedEnd = -1;
    const read = (t: ConcealSpan) => text.slice(t.from - offset, t.to - offset);
    for (const token of tokens) {
        // Lezer visits tokens in source order. Scan excluded intervals once,
        // rather than rescanning all math/code nodes for every token.
        while (
            excludedIndex < excluded.length &&
            excluded[excludedIndex]!.from <= token.from
        )
            excludedEnd = Math.max(excludedEnd, excluded[excludedIndex++]!.to);
        if (token.to <= token.from || token.to <= excludedEnd) continue;
        const tags = token.name.split('_');
        if (tags.includes('formatting-header')) {
            result.push({
                from: offset,
                to: offset + text.length,
                hidden: [{ from: token.from, to: token.to }],
            });
        }
        if (tags.includes('formatting-link-start') && read(token) === '[[') {
            // Embeds have their own widgets and navigation context.
            if (text.charAt(token.from - offset - 1) !== '!')
                wiki = { token, label: token.to };
        } else if (wiki && tags.includes('link-alias-pipe'))
            wiki.label = token.to;
        else if (wiki && tags.includes('formatting-link-end')) {
            result.push({
                from: wiki.token.from,
                to: token.to,
                hidden: [
                    { from: wiki.token.from, to: wiki.label },
                    { from: token.from, to: token.to },
                ],
            });
            wiki = null;
        }
        if (
            tags.includes('formatting-link') &&
            !tags.includes('image') &&
            !token.name.includes('footnote')
        ) {
            if (read(token) === '[') link = { token };
            else if (link && read(token) === ']') link.labelEnd = token.from;
        } else if (
            link?.labelEnd !== undefined &&
            tags.includes('formatting-link-string')
        ) {
            if (read(token) === '(') link.destination = true;
            else if (link.destination && read(token) === ')') {
                result.push({
                    from: link.token.from,
                    to: token.to,
                    hidden: [
                        { from: link.token.from, to: link.token.to },
                        { from: link.labelEnd, to: token.to },
                    ],
                });
                link = null;
            } else if (read(token) === '[') link = null; // Reference links remain native.
        }
        const styles = [
            'strong',
            'em',
            'strikethrough',
            'highlight',
            'code',
        ].filter((style) => tags.includes('formatting-' + style));
        if (!styles.length) continue;
        const key = styles.join(':') + ':' + read(token);
        const open = paired.get(key);
        if (open) {
            if (open.to < token.from)
                result.push({
                    from: open.from,
                    to: token.to,
                    hidden: [
                        { from: open.from, to: open.to },
                        { from: token.from, to: token.to },
                    ],
                });
            paired.delete(key);
        } else paired.set(key, token);
    }
    return result;
}

export function hiddenSpans(groups: readonly ConcealGroup[]): ConcealSpan[] {
    const sorted = groups
        .flatMap((g) => g.hidden)
        .sort((a, b) => a.from - b.from || a.to - b.to);
    const merged: ConcealSpan[] = [];
    for (const span of sorted) {
        const previous = merged[merged.length - 1];
        if (previous && span.from <= previous.to)
            previous.to = Math.max(previous.to, span.to);
        else merged.push({ ...span });
    }
    return merged;
}

/** Hidden syntax has no cursor stop, including its opening boundary. */
export function snapVisible(
    text: string,
    offset: number,
    position: number,
    spans: readonly ConcealSpan[],
    forward: boolean,
    allowEnd = false,
): number {
    return new ConcealLine(text, offset, spans).snap(
        position,
        forward,
        allowEnd,
    );
}

export function stepVisible(
    text: string,
    offset: number,
    position: number,
    spans: readonly ConcealSpan[],
    forward: boolean,
    allowEnd = false,
): number {
    return new ConcealLine(text, offset, spans).step(
        position,
        forward,
        allowEnd,
    );
}

/** Visible UTF-16 text plus a monotone map back to unchanged source positions. */
export class ConcealLine {
    readonly text: string;
    private readonly positions: number[] | null;
    constructor(
        readonly source: string,
        readonly offset: number,
        readonly spans: readonly ConcealSpan[],
    ) {
        if (!spans.length) {
            this.text = source;
            this.positions = null;
            return;
        }
        const pieces: string[] = [],
            positions: number[] = [];
        let ch = 0;
        for (const span of spans) {
            const end = Math.max(
                ch,
                Math.min(source.length, span.from - offset),
            );
            pieces.push(source.slice(ch, end));
            for (; ch < end; ch++) positions.push(offset + ch);
            ch = Math.max(ch, Math.min(source.length, span.to - offset));
        }
        pieces.push(source.slice(ch));
        for (; ch < source.length; ch++) positions.push(offset + ch);
        this.text = pieces.join('');
        this.positions = positions;
    }
    toDisplay(position: number): number {
        if (!this.positions)
            return Math.max(
                0,
                Math.min(this.text.length, position - this.offset),
            );
        let lo = 0,
            hi = this.positions.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.positions[mid]! < position) lo = mid + 1;
            else hi = mid;
        }
        return lo;
    }
    toSource(position: number, allowEnd = false): number {
        position = Math.max(0, Math.min(this.text.length, position));
        if (!allowEnd && position === this.text.length && this.text.length)
            position = findClusterBreak(this.text, position, false);
        return (
            this.positions?.[position] ??
            (position === this.text.length
                ? this.offset + this.source.length
                : this.offset + position)
        );
    }
    step(position: number, forward: boolean, allowEnd = false): number {
        return this.toSource(
            findClusterBreak(this.text, this.toDisplay(position), forward),
            allowEnd,
        );
    }
    snap(position: number, forward: boolean, allowEnd = false): number {
        let projected = this.toDisplay(position);
        if (projected > 0 && projected < this.text.length) {
            const before = findClusterBreak(this.text, projected, false);
            const after = findClusterBreak(this.text, before, true);
            if (after !== projected) projected = forward ? after : before;
        }
        if (
            !forward &&
            this.toSource(projected, true) !== position &&
            projected > 0
        )
            projected = findClusterBreak(this.text, projected, false);
        return this.toSource(projected, allowEnd);
    }
    column(position: number): number {
        const end = this.toDisplay(position);
        let ch = 0,
            count = 0;
        while (ch < end) {
            ch = findClusterBreak(this.text, ch);
            count++;
        }
        return count;
    }
    atColumn(column: number, allowEnd = false): number {
        let ch = 0;
        for (let i = 0; i < column && ch < this.text.length; i++)
            ch = findClusterBreak(this.text, ch);
        return this.toSource(ch, allowEnd);
    }
}
