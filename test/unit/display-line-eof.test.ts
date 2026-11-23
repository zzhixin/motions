import { afterEach, describe, expect, it } from 'vitest';
import { CodeMirror, Vim } from '@replit/codemirror-vim';
import {
    EditorSelection,
    EditorState,
    type SelectionRange,
} from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

// Three display rows of six, six and three characters in one source line.
// The real adapter returns hitSide on the first move into the final row.
function editor(start = 10) {
    const view = {
        state: EditorState.create({
            doc: 'abcdefghijklmno',
            selection: { anchor: start },
        }),
        defaultLineHeight: 20,
        dispatch(spec: Parameters<EditorState['update']>[0]) {
            this.state = this.state.update(spec).state;
        },
        coordsAtPos(pos: number) {
            return {
                left: (pos % 6) * 8,
                right: (pos % 6) * 8,
                top: Math.floor(pos / 6) * 20,
                bottom: Math.floor(pos / 6) * 20 + 20,
            };
        },
        moveVertically(range: SelectionRange, forward: boolean) {
            const row = Math.floor(range.head / 6);
            const target = Math.max(0, Math.min(2, row + (forward ? 1 : -1)));
            const goal = range.goalColumn ?? (range.head % 6) * 8;
            if (forward && row === 2)
                return EditorSelection.cursor(15, 1, undefined, goal);
            if (!forward && row === 0)
                return EditorSelection.cursor(0, 1, undefined, goal);
            return EditorSelection.cursor(
                Math.min(15, target * 6 + goal / 8),
                1,
                undefined,
                goal,
            );
        },
        contentDOM: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
        scrollDOM: {
            scrollTop: 0,
            scrollLeft: 0,
            getBoundingClientRect: () => ({ left: 0, top: 0 }),
        },
        dom: { getBoundingClientRect: () => ({ top: 0, bottom: 100 }) },
        focus() {},
    };
    const cm = new CodeMirror(view as unknown as EditorView);
    Vim.maybeInitVimState_(cm);
    return {
        cm,
        keys: (...keys: string[]) =>
            keys.forEach((key) => Vim.handleKey(cm, key, 'user')),
    };
}

afterEach(() => Vim.resetVimGlobalState_());

describe('display-line navigation at EOF with the installed Vim engine', () => {
    it('enters a short final row and keeps the goal for gk', () => {
        const e = editor();
        e.keys('g', 'j');
        expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: 14 });
        expect.soft(e.cm.state.vim?.lastHSPos).toBe(32);
        e.keys('g', 'k');
        expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: 10 });
        expect.soft(e.cm.state.vim?.lastHSPos).toBe(32);
    });

    it('clamps counted gj at the last row without losing the original goal', () => {
        const e = editor();
        e.keys('9', 'g', 'j');
        expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: 14 });
        e.keys('g', 'j');
        expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: 14 });
        e.keys('g', 'k');
        expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: 10 });
        expect.soft(e.cm.state.vim?.lastHSPos).toBe(32);
    });
    it.each([
        { start: 13, keys: ['g', 'j'] },
        { start: 4, keys: ['g', 'k'] },
    ])(
        'keeps column $start when already on the terminal display row',
        ({ start, keys }) => {
            const e = editor(start);
            e.keys(...keys);
            expect(e.cm.getCursor()).toMatchObject({ line: 0, ch: start });
        },
    );
});
