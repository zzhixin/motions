import { describe, expect, it } from 'vitest';
import {
    concealGroups,
    hiddenSpans,
    snapVisible,
    stepVisible,
    ConcealLine,
} from '../../src/vim/conceal/model';

function tokens(text: string, names: [string, number, number][]) {
    return names.map(([name, from, to]) => ({ name, from, to }));
}
const strong = (from: number, to: number) => ({
    name: 'formatting_formatting-strong_strong',
    from,
    to,
});

describe('Conceal model from measured Obsidian tokens', () => {
    it('pairs nested emphasis, code, highlight and heading syntax', () => {
        const text = '# **a *b*** `c` ==d==';
        const nodes = tokens(text, [
            ['formatting_formatting-header_header', 0, 2],
            ['formatting_formatting-strong_strong', 2, 4],
            ['em_formatting_formatting-em_strong', 6, 7],
            ['em_formatting_formatting-em_strong', 8, 9],
            ['formatting_formatting-strong_strong', 9, 11],
            ['formatting_formatting-code_inline-code', 12, 13],
            ['formatting_formatting-code_inline-code', 14, 15],
            ['formatting_formatting-highlight_highlight', 16, 18],
            ['formatting_formatting-highlight_highlight', 19, 21],
        ]);
        expect.soft(hiddenSpans(concealGroups(text, 0, nodes))).toEqual([
            { from: 0, to: 4 },
            { from: 6, to: 7 },
            { from: 8, to: 11 },
            { from: 12, to: 13 },
            { from: 14, to: 15 },
            { from: 16, to: 18 },
            { from: 19, to: 21 },
        ]);
    });
    it('hides a complete link destination, including nested parentheses and title', () => {
        const text = '[label](a(b)c "title")';
        const nodes = tokens(text, [
            ['formatting_formatting-link_link', 0, 1],
            ['formatting_formatting-link_link', 6, 7],
            ['formatting_formatting-link-string_string_url', 7, 8],
            ['string_url', 8, 21],
            ['formatting_formatting-link-string_string_url', 21, 22],
        ]);
        expect.soft(concealGroups(text, 0, nodes)).toEqual([
            {
                from: 0,
                to: 22,
                hidden: [
                    { from: 0, to: 1 },
                    { from: 6, to: 22 },
                ],
            },
        ]);
    });
    it('keeps the displayed alias at its original source coordinates', () => {
        const text = '[[Target|Alias]]';
        const nodes = tokens(text, [
            ['formatting-link_formatting-link-start', 0, 2],
            ['hmd-internal-link_link-has-alias', 2, 8],
            ['hmd-internal-link_link-alias-pipe', 8, 9],
            ['hmd-internal-link_link-alias', 9, 14],
            ['formatting-link_formatting-link-end', 14, 16],
        ]);
        expect.soft(hiddenSpans(concealGroups(text, 0, nodes))).toEqual([
            { from: 0, to: 9 },
            { from: 14, to: 16 },
        ]);
    });
    it('keeps ordinary wikilink text visible', () => {
        const nodes = tokens('[[Note]]', [
            ['formatting-link_formatting-link-start', 0, 2],
            ['hmd-internal-link', 2, 6],
            ['formatting-link_formatting-link-end', 6, 8],
        ]);
        expect.soft(hiddenSpans(concealGroups('[[Note]]', 0, nodes))).toEqual([
            { from: 0, to: 2 },
            { from: 6, to: 8 },
        ]);
    });
    it('does not invent formatting in code, math, escaped text or unmatched markers', () => {
        expect
            .soft(
                concealGroups('**raw**', 0, [
                    { name: 'hmd-codeblock', from: 0, to: 7 },
                    strong(0, 2),
                    strong(5, 7),
                ]),
            )
            .toEqual([]);
        expect.soft(concealGroups('\\*literal* $x$', 0, [])).toEqual([]);
    });
    it('offsets complete groups inside a document', () => {
        expect
            .soft(
                hiddenSpans(
                    concealGroups('**ab**', 10, [
                        strong(10, 12),
                        strong(14, 16),
                    ]),
                ),
            )
            .toEqual([
                { from: 10, to: 12 },
                { from: 14, to: 16 },
            ]);
    });
});

describe('Visible line projection', () => {
    it('maps visible UTF-16 positions and grapheme columns to unchanged source', () => {
        const line = new ConcealLine('**á🙂中**', 10, [
            { from: 10, to: 12 },
            { from: 17, to: 19 },
        ]);
        expect.soft(line.text).toBe('á🙂中');
        expect
            .soft([12, 14, 16, 18].map((pos) => line.toDisplay(pos)))
            .toEqual([0, 2, 4, 5]);
        expect
            .soft([0, 2, 4, 5].map((pos) => line.toSource(pos)))
            .toEqual([12, 14, 16, 16]);
        expect
            .soft([12, 14, 16].map((pos) => line.column(pos)))
            .toEqual([0, 1, 2]);
        expect
            .soft([0, 1, 2, 9].map((col) => line.atColumn(col)))
            .toEqual([12, 14, 16, 16]);
        expect.soft(line.snap(13, true)).toBe(14);
        expect.soft(line.snap(13, false)).toBe(12);
    });
});

describe('Visible grapheme coordinates', () => {
    const text = '**á🙂中**';
    const spans = [
        { from: 0, to: 2 },
        { from: 7, to: 9 },
    ];
    it.each([
        [2, 4],
        [4, 6],
        [6, 6],
    ] as const)('moves forward from %s to %s', (start, end) => {
        expect.soft(stepVisible(text, 0, start, spans, true)).toBe(end);
    });
    it.each([
        [6, 4],
        [4, 2],
        [2, 2],
    ] as const)('moves backward from %s to %s', (start, end) => {
        expect.soft(stepVisible(text, 0, start, spans, false)).toBe(end);
    });
    it.each([
        [0, true, 2],
        [1, true, 2],
        [7, true, 6],
        [8, false, 6],
    ] as const)(
        'maps hidden position %s to a visible stop',
        (pos, forward, target) => {
            expect.soft(snapVisible(text, 0, pos, spans, forward)).toBe(target);
        },
    );
    it('keeps the newline stop for visual selection only', () => {
        expect.soft(stepVisible(text, 0, 6, spans, true, true)).toBe(9);
    });
    it('counts a hidden link target as zero navigation steps', () => {
        const source = 'x [中](url) y',
            hidden = [
                { from: 2, to: 3 },
                { from: 4, to: 10 },
            ];
        let pos = 1;
        for (let i = 0; i < 3; i++)
            pos = stepVisible(source, 0, pos, hidden, true);
        expect.soft(pos).toBe(11);
        expect.soft(stepVisible(source, 0, 10, hidden, false)).toBe(3);
    });
});
