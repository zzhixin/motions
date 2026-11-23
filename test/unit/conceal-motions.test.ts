import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeMirror, Vim } from '@replit/codemirror-vim';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { VimApi } from '../../src/types/vim-api';
import { applyPreviewConcealMotions } from '../../src/vim/conceal/motions';
import { registerPreviewNavigator } from '../../src/vim/conceal/registry';
import { ConcealLine } from '../../src/vim/conceal/model';

const cleanups: (() => void)[] = [];
function editor(source: string, start: number, spans: [number, number][]) {
    const view = {
        state: EditorState.create({
            doc: source,
            selection: { anchor: start },
        }),
        dispatch(spec: Parameters<EditorState['update']>[0]) {
            this.state = this.state.update(spec).state;
        },
        scrollDOM: {
            scrollTop: 0,
            scrollLeft: 0,
            getBoundingClientRect: () => ({ top: 0 }),
        },
        dom: { getBoundingClientRect: () => ({ top: 0, bottom: 100 }) },
        contentDOM: { getBoundingClientRect: () => ({ top: 0, left: 0 }) },
        coordsAtPos: () => ({ top: 0, bottom: 20, left: 0, right: 8 }),
        focus() {},
    };
    const cm = new CodeMirror(view as unknown as EditorView);
    Vim.maybeInitVimState_(cm);
    let active = true;
    cleanups.push(
        registerPreviewNavigator(view as unknown as EditorView, {
            active: () => active,
            prepare() {},
            resetGoal() {},
            vertical: (_head, target) => target,
            line(position) {
                const line = view.state.doc.lineAt(position);
                return new ConcealLine(
                    line.text,
                    line.from,
                    spans.map(([from, to]) => ({ from, to })),
                );
            },
        }),
    );
    return {
        cm,
        keys(keys: string) {
            for (const key of keys) Vim.handleKey(cm, key, 'user');
        },
        deactivate() {
            active = false;
        },
    };
}
function install() {
    cleanups.push(applyPreviewConcealMotions(Vim as unknown as VimApi));
}
afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    Vim.resetVimGlobalState_();
    vi.restoreAllMocks();
});

describe('Conceal navigation through the installed Vim engine', () => {
    const source = '**á🙂中** and [label](url)';
    const spans: [number, number][] = [
        [0, 2],
        [7, 9],
        [14, 15],
        [20, 26],
    ];
    it.each([
        ['l', 2, 4],
        ['2l', 2, 6],
        ['h', 4, 2],
        ['h', 2, 2],
        ['0', 10, 2],
        ['$', 2, 19],
        ['w', 10, 15],
        ['2w', 9, 15],
        ['w', 2, 4],
        ['b', 15, 10],
        ['e', 15, 19],
    ] as const)('%s maps source %s to %s', (keys, start, target) => {
        install();
        const e = editor(source, start, spans);
        e.keys(keys);
        expect(e.cm.getCursor()).toEqual({ line: 0, ch: target });
    });
    it.each([
        { source: '  alpha beta', first: 2, active: true },
        { source: '  alpha beta', first: 2, active: false },
        { source: '  **alpha beta**', first: 2, active: true },
        { source: '  **alpha beta**', first: 2, active: false },
        { source: '    ', first: 4, active: true },
        { source: '    ', first: 4, active: false },
    ])(
        'I enters insert at $first with active=$active for "$source"',
        ({ source, first, active }) => {
            install();
            const e = editor(source, Math.min(9, source.length - 1), []);
            if (!active) e.deactivate();
            const modeChanged = vi.fn();
            e.cm.on('vim-mode-change', modeChanged);
            e.keys('I');
            expect.soft(e.cm.state.vim?.insertMode).toBe(true);
            expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch: first });
            expect.soft(e.cm.getOption('keyMap')).toBe('vim-insert');
            expect.soft(modeChanged).toHaveBeenCalledWith({ mode: 'insert' });
            expect(e.cm.getLine(0)).toBe(source);
        },
    );
    it.each(['args', 'state', 'both'] as const)(
        'preserves direct internal calls without %s',
        (missing) => {
            install();
            const e = editor('  alpha beta', 9, []);
            const motion = Vim.getMotion('moveToFirstNonWhiteSpaceCharacter')!;
            const target = Reflect.apply(motion, undefined, [
                e.cm,
                { line: 0, ch: 9 },
                missing === 'state' ? { repeat: 1 } : undefined,
                missing === 'args' ? e.cm.state.vim : undefined,
            ]);
            expect(target).toMatchObject({ line: 0, ch: 2 });
            expect(e.cm.getLine(0)).toBe('  alpha beta');
        },
    );
    it.each([
        {
            keys: '==',
            source: '**alpha beta**',
            expected: '**alpha beta**',
            ch: 0,
        },
        {
            keys: 'gUU',
            source: '  **alpha beta**',
            expected: '  **ALPHA BETA**',
            ch: 2,
        },
        {
            keys: 'g~~',
            source: '  **alpha beta**',
            expected: '  **ALPHA BETA**',
            ch: 2,
        },
        {
            keys: 'g??',
            source: '  **alpha beta**',
            expected: '  **nycun orgn**',
            ch: 2,
        },
    ])(
        'preserves the internal first-nonblank call from $keys',
        ({ keys, source, expected, ch }) => {
            install();
            const e = editor(source, 7, []);
            e.keys(keys);
            expect.soft(e.cm.getValue()).toBe(expected);
            expect.soft(e.cm.getCursor()).toMatchObject({ line: 0, ch });
            expect(e.cm.state.vim?.insertMode).toBe(false);
        },
    );
    it('keeps visual head and continuous source selection aligned', () => {
        install();
        const e = editor(source, 2, spans);
        e.keys('vll');
        expect.soft(e.cm.state.vim?.sel).toEqual({
            anchor: { line: 0, ch: 2 },
            head: { line: 0, ch: 6 },
        });
        expect(e.cm.listSelections()).toEqual([
            { anchor: { line: 0, ch: 2 }, head: { line: 0, ch: 7 } },
        ]);
    });
    it('passes operator ranges to the original engine', () => {
        install();
        const e = editor('**abc** rest', 4, [
            [0, 2],
            [5, 7],
        ]);
        e.keys('dl');
        expect(e.cm.getValue()).toBe('**ab** rest');
    });
    it('restores ordinary movement when the view is inactive', () => {
        install();
        const e = editor(source, 2, spans);
        e.deactivate();
        e.keys('0');
        expect(e.cm.getCursor()).toEqual({ line: 0, ch: 0 });
    });
    it('restores original motion functions on teardown', () => {
        const original = (Vim as unknown as VimApi).getMotion(
            'moveByCharacters',
        )!;
        const e = editor(source, 2, spans);
        const dispose = applyPreviewConcealMotions(Vim as unknown as VimApi);
        e.keys('l');
        expect(e.cm.getCursor()).toEqual({ line: 0, ch: 4 });
        dispose();
        // getMotion binds a fresh function on each call; compare behavior.
        const args = { repeat: 1, forward: true };
        expect(
            (Vim as unknown as VimApi).getMotion('moveByCharacters')!(
                e.cm as never,
                { line: 0, ch: 6 },
                args as never,
                e.cm.state.vim as never,
                {} as never,
            ),
        ).toEqual(
            original(
                e.cm as never,
                { line: 0, ch: 6 },
                args as never,
                e.cm.state.vim as never,
                {} as never,
            ),
        );
    });
});
