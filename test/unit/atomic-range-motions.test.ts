import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeMirror, Vim } from '@replit/codemirror-vim';
import {
    EditorSelection,
    EditorState,
    RangeSet,
    RangeValue,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { VimApi } from '../../src/types/vim-api';
import { applyAtomicRangeMotions } from '../../src/vim/atomic-range-motions';

const value = new (class extends RangeValue {})();
const disposers: (() => void)[] = [];

function editor(doc = '$\\alpha + x$', start = 1, spans = [[1, 7]]) {
    let atoms = RangeSet.of(
        spans.map(([from, to]) => value.range(from!, to!)),
        true,
    );
    const submitted: number[] = [];
    const view = {
        state: EditorState.create({
            doc,
            selection: { anchor: start },
            extensions: [EditorView.atomicRanges.of(() => atoms)],
        }),
        dispatch(spec: Parameters<EditorState['update']>[0]) {
            const tr = this.state.update(spec);
            this.state = tr.state;
            if (tr.selection) submitted.push(tr.selection.main.head);
        },
        scrollDOM: { scrollTop: 0, scrollLeft: 0 },
        dom: { getBoundingClientRect: () => ({ top: 0, bottom: 100 }) },
        coordsAtPos: () => ({ top: 0, bottom: 20, left: 0, right: 8 }),
        focus() {},
    };
    const cm = new CodeMirror(view as unknown as EditorView);
    Vim.maybeInitVimState_(cm);
    return {
        cm,
        view,
        submitted,
        keys(keys: string[]) {
            for (const key of keys) Vim.handleKey(cm, key, 'user');
        },
        reveal() {
            atoms = RangeSet.empty;
        },
    };
}

function install() {
    disposers.push(applyAtomicRangeMotions(Vim as unknown as VimApi));
}

afterEach(() => {
    for (const dispose of disposers.splice(0).reverse()) dispose();
    Vim.resetVimGlobalState_();
});

describe('atomic range navigation with the installed Vim engine', () => {
    it.each([
        { name: 'forward', start: 1, keys: ['l'], head: 7 },
        { name: 'backward', start: 7, keys: ['h'], head: 1 },
        { name: 'counted forward', start: 1, keys: ['3', 'l'], head: 9 },
        { name: 'counted backward', start: 9, keys: ['3', 'h'], head: 1 },
    ])('skips the hidden source $name', ({ start, keys, head }) => {
        install();
        const e = editor(undefined, start);
        e.keys(keys);
        expect(e.cm.getCursor().ch).toBe(head);
        expect(e.submitted.some((pos) => pos > 1 && pos < 7)).toBe(false);
    });

    it.each([
        { start: 1, keys: ['v', 'l'], anchor: 1, head: 7, range: [1, 8] },
        { start: 7, keys: ['v', 'h'], anchor: 7, head: 1, range: [8, 1] },
    ])(
        'keeps visual selection and Vim state aligned from $start',
        ({ start, keys, anchor, head, range }) => {
            install();
            const e = editor(undefined, start);
            e.keys(keys);
            expect(e.cm.state.vim?.sel).toEqual({
                anchor: { line: 0, ch: anchor },
                head: { line: 0, ch: head },
            });
            expect([
                e.view.state.selection.main.anchor,
                e.view.state.selection.main.head,
            ]).toEqual(range);
        },
    );

    it('uses the latest atomic ranges after a delayed reveal', () => {
        install();
        const e = editor();
        e.keys(['l', 'h']);
        expect(e.cm.getCursor().ch).toBe(1);
        e.reveal();
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(2);
    });

    it.each([
        { keys: ['d', 'l'], text: '$alpha + x$' },
        { keys: ['x'], text: '$alpha + x$' },
        { keys: ['d', 'w'], text: '$alpha + x$' },
    ])('preserves source-based edit ranges for $keys', ({ keys, text }) => {
        install();
        const e = editor();
        e.keys(keys);
        expect(e.cm.getValue()).toBe(text);
    });

    it("does not apply one editor's ranges to another editor", () => {
        install();
        const concealed = editor();
        const plain = editor(undefined, 1, []);
        concealed.keys(['l']);
        plain.keys(['l']);
        expect([concealed.cm.getCursor().ch, plain.cm.getCursor().ch]).toEqual([
            7, 2,
        ]);
    });

    it('restores source movement on teardown and can be installed again', () => {
        const dispose = applyAtomicRangeMotions(Vim as unknown as VimApi);
        const e = editor();
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(7);
        dispose();
        e.view.state = e.view.state.update({
            selection: EditorSelection.cursor(1),
        }).state;
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(2);
        install();
        e.view.state = e.view.state.update({
            selection: EditorSelection.cursor(1),
        }).state;
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(7);
    });

    it.each([
        { key: 'w', start: 1, head: 7 },
        { key: 'e', start: 1, head: 7 },
        { key: 'b', start: 7, head: 1 },
    ])(
        'keeps word motion $key out of a hidden command',
        ({ key, start, head }) => {
            install();
            const e = editor(undefined, start);
            e.keys([key]);
            expect(e.cm.getCursor().ch).toBe(head);
        },
    );

    it.each(['j', 'gj', 'k', 'gk'])(
        'keeps vertical motion %s outside hidden source',
        (key) => {
            install();
            const backwards = key.endsWith('k');
            const e = editor(
                'abcdefg\n\\alpha rest\nabcdefg',
                backwards ? 23 : 3,
                [[8, 14]],
            );
            vi.spyOn(e.cm, 'findPosV').mockImplementation((start, amount) => ({
                line: start.line + Math.sign(amount),
                ch: start.ch,
            }));
            vi.spyOn(e.cm, 'charCoords').mockReturnValue({
                left: 3,
                top: 0,
                bottom: 20,
            });
            e.keys([...key]);
            expect(e.cm.getCursor()).toEqual({
                line: 1,
                ch: backwards ? 0 : 6,
            });
        },
    );

    it('preserves the vertical goal column after skipping an atom', () => {
        install();
        const e = editor('abcdefg\n\\alpha rest\nabcdefg', 3, [[8, 14]]);
        vi.spyOn(e.cm, 'findPosV').mockImplementation((start, amount) => ({
            line: start.line + Math.sign(amount),
            ch: start.ch,
        }));
        vi.spyOn(e.cm, 'charCoords').mockReturnValue({
            left: 3,
            top: 0,
            bottom: 20,
        });
        e.keys(['j', 'j']);
        expect(e.cm.getCursor()).toEqual({ line: 2, ch: 3 });
    });

    it('resolves overlapping atomic ranges until the position is outside both', () => {
        install();
        const e = editor('0123456789', 1, [
            [1, 5],
            [3, 7],
        ]);
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(7);
    });

    it('does not let normal-mode EOL clipping re-enter a hidden range', () => {
        install();
        const e = editor('x\\alpha', 1, [[1, 7]]);
        e.keys(['l']);
        expect(e.cm.getCursor().ch).toBe(1);
    });
});
