import { CodeMirror } from '@replit/codemirror-vim';
import type { CmAdapter, VimPos } from '../types/vim-api';
import { findSubwordBoundaries, findSubwordEnds } from '../util/subword';
import {
    ChineseWordBoundaries,
    codePointStart,
    isHan,
    type WordSpan,
} from '../util/chinese-word-boundaries';

interface Word extends WordSpan {
    line: number;
}

/** A per-command reader; the bounded segmentation cache is shared by commands. */
export class ChineseWordReader {
    usedChinese = false;

    constructor(
        private readonly cm: CmAdapter,
        private readonly boundaries: ChineseWordBoundaries,
        private readonly bigWord: boolean,
        private readonly subword = false,
    ) {}

    private kind(text: string, ch: number): number {
        if (isHan(text, ch)) {
            this.usedChinese = true;
            return 3;
        }
        const point = String.fromCodePoint(text.codePointAt(ch)!);
        if (
            /\s/.test(point) ||
            (this.subword && (point === '_' || point === '-'))
        )
            return 0;
        return this.bigWord || CodeMirror.isWordChar(point) ? 1 : 2;
    }

    span(text: string, ch: number): WordSpan {
        ch = codePointStart(text, ch);
        const chinese = this.boundaries.spanAt(text, ch);
        if (chinese) {
            this.usedChinese = true;
            return chinese;
        }
        const kind = this.kind(text, ch);
        let from = ch;
        let to = ch + String.fromCodePoint(text.codePointAt(ch)!).length;
        while (from > 0) {
            const previous = codePointStart(text, from - 1);
            if (this.kind(text, previous) !== kind) break;
            from = previous;
        }
        while (to < text.length && this.kind(text, to) === kind) {
            to += String.fromCodePoint(text.codePointAt(to)!).length;
        }
        if (this.subword && kind === 1) {
            const token = text.slice(from, to);
            const starts = findSubwordBoundaries(token);
            const ends = findSubwordEnds(token);
            const index = starts.findIndex(
                (start, i) => start <= ch - from && ch - from < ends[i]!,
            );
            if (index >= 0)
                return { from: from + starts[index]!, to: from + ends[index]! };
        }
        return { from, to };
    }

    private followingWord(line: number): Word | null {
        for (line++; line <= this.cm.lastLine(); line++) {
            const text = this.cm.getLine(line);
            if (!text) return { line, from: 0, to: 0 };
            const ch = text.search(/\S/);
            if (ch >= 0) return { line, ...this.span(text, ch) };
        }
        return null;
    }

    move(
        head: VimPos,
        repeat: number,
        forward: boolean,
        wordEnd: boolean,
    ): VimPos | null {
        const dir = forward ? 1 : -1;
        for (
            let line = head.line;
            line >= this.cm.firstLine() && line <= this.cm.lastLine();
            line += dir
        ) {
            const text = this.cm.getLine(line);
            if (
                !text &&
                line !== head.line &&
                !(forward && wordEnd) &&
                --repeat === 0
            ) {
                return { line, ch: 0 };
            }
            let ch =
                line === head.line
                    ? Math.min(head.ch, text.length - 1)
                    : forward
                      ? 0
                      : text.length - 1;
            while (ch >= 0 && ch < text.length) {
                const span = this.span(text, ch);
                const target = wordEnd
                    ? codePointStart(text, span.to - 1)
                    : span.from;
                const pastHead =
                    line !== head.line ||
                    (forward ? target > head.ch : target < head.ch);
                if (
                    !/\s/.test(text.charAt(span.from)) &&
                    pastHead &&
                    --repeat === 0
                ) {
                    return { line, ch: target };
                }
                ch = forward ? span.to : span.from - 1;
            }
        }
        const line = forward ? this.cm.lastLine() : this.cm.firstLine();
        return { line, ch: forward ? this.cm.getLine(line).length : 0 };
    }

    object(
        head: VimPos,
        repeat: number,
        inner: boolean,
    ): [VimPos, VimPos] | null {
        let start: VimPos | null = null;
        let end = head;
        for (let i = 0; i < repeat; i++) {
            const range = this.expand(end, inner);
            if (!range) break;
            start ??= range[0];
            end = range[1];
        }
        return start ? [start, end] : null;
    }

    private expand(cur: VimPos, inner: boolean): [VimPos, VimPos] | null {
        let line = cur.line;
        let text = this.cm.getLine(line);
        let ch = cur.ch;
        if (!inner) while (ch < text.length && /\s/.test(text.charAt(ch))) ch++;
        if (ch >= text.length) {
            const next = this.followingWord(cur.line);
            if (!next) return null;
            line = next.line;
            text = this.cm.getLine(line);
            ch = next.from;
            if (!text)
                return [
                    { line, ch: 0 },
                    { line: line + 1, ch: 0 },
                ];
        }
        const span = this.span(text, ch);
        let from = span.from;
        let to = span.to;
        if (!inner) {
            const leadingSpace =
                cur.line === line &&
                cur.ch <= from &&
                /\s/.test(text.charAt(cur.ch));
            if (!leadingSpace)
                while (to < text.length && /\s/.test(text.charAt(to))) to++;
            if (to === span.to || leadingSpace) {
                while (from > 0 && /\s/.test(text.charAt(from - 1))) from--;
                if (!from && !leadingSpace) from = span.from;
            }
        }
        // When invoked on whitespace before a word, aw includes that space.
        return [
            { line: cur.line, ch: line === cur.line ? from : cur.ch },
            { line, ch: to },
        ];
    }
}
