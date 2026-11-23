import { describe, expect, it } from 'vitest';
import { ChangeSet } from '@codemirror/state';
import { RevealedRegions } from '../../src/vim/conceal/reveal';
import {
    ConcealLine,
    hiddenSpans,
    type ConcealGroup,
} from '../../src/vim/conceal/model';

const a: ConcealGroup = {
    from: 0,
    to: 9,
    hidden: [
        { from: 0, to: 1 },
        { from: 3, to: 9 },
    ],
};
const b: ConcealGroup = {
    from: 9,
    to: 18,
    hidden: [
        { from: 9, to: 10 },
        { from: 12, to: 18 },
    ],
};
const groups = [a, b];

describe('Revealed source regions', () => {
    it('retains source while moving over the body and its syntax', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        for (const head of [2, 5, 0, 8]) {
            state.sync(head);
            expect.soft(state.concealed(groups)).toEqual([b]);
        }
    });
    it('keeps adjacent regions independent at their shared boundary', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        state.sync(9);
        expect.soft(state.concealed(groups)).toEqual(groups);
        state.reveal(groups, 9);
        expect.soft(state.concealed(groups)).toEqual([a]);
        state.sync(18);
        expect.soft(state.concealed(groups)).toEqual(groups);
    });
    it('makes delimiters navigable only in the opened region', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        const line = new ConcealLine(
            '[ab](one)[cd](two)',
            0,
            hiddenSpans(state.concealed(groups)),
        );
        expect.soft(line.text).toBe('[ab](one)cd');
        expect.soft(line.step(2, true)).toBe(3);
        expect.soft(line.step(8, true)).toBe(10);
        expect.soft(line.snap(0, true)).toBe(0);
    });
    it('does not reveal sibling formats just because their heading is open', () => {
        const heading: ConcealGroup = {
            from: 0,
            to: 18,
            hidden: [{ from: 0, to: 2 }],
        };
        const bold: ConcealGroup = {
            from: 2,
            to: 8,
            hidden: [
                { from: 2, to: 4 },
                { from: 6, to: 8 },
            ],
        };
        const code: ConcealGroup = {
            from: 9,
            to: 13,
            hidden: [
                { from: 9, to: 10 },
                { from: 12, to: 13 },
            ],
        };
        const all = [heading, bold, code],
            state = new RevealedRegions();
        state.reveal(all, 4);
        expect.soft(state.concealed(all)).toEqual([code]);
        state.sync(10);
        expect.soft(state.concealed(all)).toEqual([bold, code]);
        state.reveal(all, 10);
        expect.soft(state.concealed(all)).toEqual([bold]);
    });
    it('maps an opened region through edits without opening its neighbor', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        const changes = ChangeSet.of({ from: 1, insert: 'Z' }, 18);
        state.sync(2, changes);
        const edited = groups.map((g) => ({
            from: changes.mapPos(g.from, -1),
            to: changes.mapPos(g.to, 1),
            hidden: [],
        }));
        expect.soft(state.concealed(edited)).toEqual([edited[1]]);
        state.sync(10);
        expect.soft(state.concealed(edited)).toEqual(edited);
    });
    it('drops opened ownership when a whole region is replaced', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        state.sync(
            1,
            ChangeSet.of({ from: 0, to: 9, insert: '[xy](new)' }, 18),
        );
        expect(state.concealed(groups)).toEqual(groups);
    });
    it('clears opened regions when the policy or editor is disposed', () => {
        const state = new RevealedRegions();
        state.reveal(groups, 1);
        state.clear();
        expect(state.concealed(groups)).toEqual(groups);
    });
});
