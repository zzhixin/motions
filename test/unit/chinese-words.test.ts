import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { applyTableCellMotions } from '../../src/vim/table-cell-motions';
import { subwordForward } from '../../src/motions/subword';
import { CodeMirror, Vim } from '@replit/codemirror-vim';
import { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { VimApi } from '../../src/types/vim-api';
import { ChineseWordBoundaries } from '../../src/util/chinese-word-boundaries';
import { applyChineseWordMotions } from '../../src/vim/chinese-words';

let dispose = () => {};
function editor(doc: string, start = 0) {
    vi.stubGlobal('document', {
        createElement: () => ({
            style: {},
            setAttribute() {},
            appendChild() {},
        }),
        createTextNode: (text: string) => ({ textContent: text }),
    });
    const view = {
        state: EditorState.create({ doc, selection: { anchor: start } }),
        dispatch(spec: Parameters<EditorState['update']>[0]) {
            this.state = this.state.update(spec).state;
        },
        scrollDOM: { scrollTop: 0, scrollLeft: 0 },
        dom: { getBoundingClientRect: () => ({ top: 0, bottom: 100 }) },
        coordsAtPos: () => ({ top: 0, bottom: 20, left: 0, right: 8 }),
        contentDOM: { addEventListener() {}, removeEventListener() {} },
        focus() {},
    };
    const cm = new CodeMirror(view as unknown as EditorView);
    cm.openNotification = () => () => {};
    Vim.maybeInitVimState_(cm);
    return {
        cm,
        keys(keys: string[]) {
            for (const key of keys) Vim.handleKey(cm, key, 'user');
        },
        result() {
            return {
                text: cm.getValue(),
                cursor: cm.getCursor(),
                register: Vim.getRegisterController()
                    .getRegister('"')
                    .toString(),
                insert: cm.state.vim?.insertMode ?? false,
            };
        },
    };
}
function install() {
    dispose = applyChineseWordMotions(Vim as unknown as VimApi);
}
afterEach(() => {
    dispose();
    Vim.resetVimGlobalState_();
    Vim.resetKeymap();
    vi.unstubAllGlobals();
});

describe('Chinese words through the installed Vim engine', () => {
    it.each(['w', 'W'])('%s moves to the next Chinese word', (key) => {
        install();
        const e = editor('我们学习中文');
        e.keys([key]);
        expect(e.cm.getCursor()).toEqual({ line: 0, ch: 2 });
    });

    it.each([
        ['dw', 0, '学习中文', '我们', false],
        ['cw', 0, '学习中文', '我们', true],
        ['yw', 0, '我们学习中文', '我们', false],
        ['diw', 1, '学习中文', '我们', false],
        ['daw', 1, '学习中文', '我们', false],
        ['ciw', 1, '学习中文', '我们', true],
        ['caw', 1, '学习中文', '我们', true],
        ['yiw', 1, '我们学习中文', '我们', false],
        ['yaw', 1, '我们学习中文', '我们', false],
    ] as const)(
        '%s operates on one word',
        (keys, start, text, register, insert) => {
            install();
            const e = editor('我们学习中文', start);
            e.keys([...keys]);
            expect(e.result()).toMatchObject({ text, register, insert });
        },
    );

    it.each([
        ['dw', '学习中文'],
        ['cw', '  学习中文'],
        ['diw', '  学习中文'],
        ['daw', '学习中文'],
    ])('%s preserves Vim whitespace rules', (keys, text) => {
        install();
        const e = editor('我们  学习中文');
        e.keys([...keys!]);
        expect(e.cm.getValue()).toBe(text);
    });

    it.each([
        ['2w', 4],
        ['2W', 4],
        ['b', 0],
        ['e', 1],
        ['ge', 1],
    ] as const)('%s supports related/count motions', (keys, ch) => {
        install();
        const e = editor('我们学习中文', keys === 'b' || keys === 'ge' ? 2 : 0);
        e.keys([...keys]);
        expect(e.cm.getCursor()).toEqual({ line: 0, ch });
    });

    it.each([
        ['d2w', '中文', '我们学习'],
        ['d2iw', '中文', '我们学习'],
        ['d2aw', '中文', '我们学习'],
        ['diW', '学习中文', '我们'],
    ])('%s shares the same boundaries', (keys, text, register) => {
        install();
        const e = editor('我们学习中文');
        e.keys([...keys!]);
        expect(e.result()).toMatchObject({ text, register });
    });

    it('recomputes dot-repeat after document edits', () => {
        install();
        const e = editor('我们学习中文');
        e.keys(['d', 'w', '.']);
        expect(e.cm.getValue()).toBe('中文');
        e.cm.replaceRange('我们学习', { line: 0, ch: 0 });
        e.cm.setCursor(0, 0);
        e.keys(['.']);
        expect(e.cm.getValue()).toBe('学习中文');
    });

    it.each(['iw', 'aw'])('v%s selects exactly one Chinese word', (keys) => {
        install();
        const e = editor('我们学习中文', 1);
        e.keys(['v', ...keys]);
        expect(e.cm.getSelection()).toBe('我们');
    });
});

describe('mixed text and lifecycle', () => {
    it.each([
        ['foo_bar我们学习', 0, 'w', 7],
        ['foo.bar我们学习', 0, 'w', 3],
        ['foo.bar我们学习', 0, 'W', 7],
        ['我们，学习中文', 0, '2w', 3],
        ['🙂我们学习中文', 0, 'w', 2],
        ['我們學習中文', 0, 'w', 2],
    ] as const)('moves in %s with %s', (doc, start, keys, ch) => {
        install();
        const e = editor(doc, start);
        e.keys([...keys]);
        expect(e.cm.getCursor()).toEqual({ line: 0, ch });
    });

    it.each([
        ['我们\n学习中文', 0, 'dw', '\n学习中文', '我们'],
        ['我们学习', 1, 'cw', '我学习', '们'],
        ['我们  学习中文', 0, 'd2iw', '学习中文', '我们  '],
        ['我们  学习', 5, 'daw', '我们', '  学习'],
        ['  我们', 2, 'daw', '  ', '我们'],
        ['我们  学习', 2, 'daw', '我们', '  学习'],
        ['我们，学习', 2, 'diw', '我们学习', '，'],
    ] as const)('edits %s using %s', (doc, start, keys, text, register) => {
        install();
        const e = editor(doc, start);
        e.keys([...keys]);
        expect(e.result()).toMatchObject({ text, register });
    });

    it.each([
        ['我们\n\n学习中文', 0, 'w', { line: 1, ch: 0 }],
        ['我们\n\n学习中文', 0, '2w', { line: 2, ch: 0 }],
        ['我们\n\n学习中文', 1, 'e', { line: 2, ch: 1 }],
        ['我们学习', 3, 'w', { line: 0, ch: 3 }],
        ['我们学习', 0, 'b', { line: 0, ch: 0 }],
    ] as const)(
        'handles line and document edges in %s',
        (doc, start, keys, cursor) => {
            install();
            const e = editor(doc, start);
            e.keys([...keys]);
            expect(e.cm.getCursor()).toEqual(cursor);
        },
    );

    it.each([
        'w',
        'W',
        '2w',
        'dw',
        'cw',
        'yw',
        'diw',
        'daw',
        'ciw',
        'caw',
        'yiw',
        'yaw',
        'viw',
        'di(',
        'b',
        'ge',
    ])('preserves native %s on non-Chinese text', (keys) => {
        const before = editor('one_two... three\n\n(four five) six', 2);
        before.keys([...keys]);
        const expected = before.result();
        Vim.resetVimGlobalState_();
        install();
        const after = editor('one_two... three\n\n(four five) six', 2);
        after.keys([...keys]);
        expect(after.result()).toEqual(expected);
    });

    it('restores both native callbacks and reinstalls without stacking', () => {
        install();
        dispose();
        const native = editor('我们学习中文');
        native.keys(['d', 'i', 'w']);
        expect(native.cm.getValue()).toBe('');
        install();
        const patched = editor('我们学习中文');
        patched.keys(['d', 'i', 'w']);
        expect(patched.cm.getValue()).toBe('学习中文');
        dispose();
        const movement = editor('我们学习中文');
        movement.keys(['w']);
        expect(movement.cm.getCursor().ch).toBe(5);
    });
});

describe('bounded native Chinese segmentation', () => {
    it('initializes lazily and caches immutable text across commands and editors', () => {
        const Native = Reflect.get(Intl, 'Segmenter') as new (
            ...args: unknown[]
        ) => {
            segment: (
                text: string,
            ) => Iterable<{ index: number; segment: string }>;
        };
        const segment = vi.fn((text: string) =>
            new Native('zh', { granularity: 'word' }).segment(text),
        );
        const construct = vi.fn();
        vi.stubGlobal('Intl', {
            Segmenter: class {
                constructor() {
                    construct();
                }
                segment = segment;
            },
        });
        install();
        const ascii = editor('one two');
        ascii.keys(['w']);
        expect(construct).toHaveBeenCalledTimes(0);
        const first = editor('我们学习中文');
        first.keys(['w', 'w', 'b', 'e']);
        const second = editor('我们学习中文');
        second.keys(['d', 'i', 'w']);
        expect([
            construct.mock.calls.length,
            segment.mock.calls.length,
        ]).toEqual([1, 1]);
        second.keys(['d', 'i', 'w']);
        expect(segment).toHaveBeenCalledTimes(2);
    });

    it('bounds long-line work and keeps surrogate pairs at window edges intact', () => {
        const sizes: number[] = [];
        vi.stubGlobal('Intl', {
            Segmenter: class {
                segment(text: string) {
                    sizes.push(text.length);
                    let index = 0;
                    return [...text].map((segment) => {
                        const part = { index, segment };
                        index += segment.length;
                        return part;
                    });
                }
            },
        });
        const boundaries = new ChineseWordBoundaries();
        const text = '我'.repeat(255) + '𠀀' + '们'.repeat(100_000);
        expect(boundaries.spanAt(text, 255)).toEqual({ from: 255, to: 257 });
        expect(boundaries.spanAt(text, 256)).toEqual({ from: 255, to: 257 });
        expect(boundaries.spanAt(text, 90_000)).toEqual({
            from: 90_000,
            to: 90_001,
        });
        expect(sizes).toEqual([257, 256]);
    });

    it('evicts old chunks and recomputes them', () => {
        const segment = vi.fn((text: string) => [{ index: 0, segment: text }]);
        vi.stubGlobal('Intl', {
            Segmenter: class {
                segment = segment;
            },
        });
        const boundaries = new ChineseWordBoundaries();
        for (let i = 0; i < 65; i++) boundaries.spanAt('我' + String(i), 0);
        boundaries.spanAt('我0', 0);
        expect(segment).toHaveBeenCalledTimes(66);
    });

    it('falls back to complete Han characters without Intl.Segmenter', () => {
        vi.stubGlobal('Intl', {});
        install();
        const e = editor('𠀀我们学习');
        e.keys(['w']);
        expect(e.cm.getCursor().ch).toBe(2);
        e.keys(['d', 'i', 'w']);
        expect(e.cm.getValue()).toBe('𠀀们学习');
    });
});

describe('composition with existing motion extensions', () => {
    it.each([
        ['我们学习中文', 0, 'dw', '学习中文'],
        ['我们  学习中文', 0, 'cw', '  学习中文'],
        ['camelCase我们学习', 0, 'dw', 'Case我们学习'],
        ['camelCase我们学习', 5, 'dw', 'camel我们学习'],
        ['camelCase我们学习', 9, 'dw', 'camelCase学习'],
    ] as const)(
        'keeps subword and Chinese boundaries in %s',
        (doc, start, keys, text) => {
            const api = Vim as unknown as VimApi;
            api.defineMotion('subwordForward', subwordForward);
            api.mapCommand('w', 'motion', 'subwordForward', { forward: true });
            install();
            const e = editor(doc, start);
            e.keys([...keys]);
            expect(e.cm.getValue()).toBe(text);
        },
    );

    it('table wrappers capture the fresh Chinese reader on every reload', () => {
        const Native = Reflect.get(Intl, 'Segmenter') as new (
            ...args: unknown[]
        ) => {
            segment: (
                text: string,
            ) => Iterable<{ index: number; segment: string }>;
        };
        const segment = vi.fn((text: string) =>
            new Native('zh', { granularity: 'word' }).segment(text),
        );
        vi.stubGlobal('Intl', {
            Segmenter: class {
                segment = segment;
            },
        });
        const app = {
            workspace: { getActiveViewOfType: () => null },
        } as unknown as App;
        const api = Vim as unknown as VimApi;
        install();
        const table1 = applyTableCellMotions(app, api)!;
        const e1 = editor('我们学习中文');
        e1.keys(['w']);
        table1();
        dispose();
        install();
        const table2 = applyTableCellMotions(app, api)!;
        try {
            const e2 = editor('我们学习中文');
            e2.keys(['w']);
            expect([
                e1.cm.getCursor().ch,
                e2.cm.getCursor().ch,
                segment.mock.calls.length,
            ]).toEqual([2, 2, 2]);
        } finally {
            table2();
        }
    });
});

describe('visual word selection expansion', () => {
    it.each([
        [1, ['v', 'w', 'i', 'w'], '们学习'],
        [4, ['v', 'b', 'i', 'w'], '学习中'],
    ] as const)(
        'retains the existing visual anchor from %s',
        (start, keys, selected) => {
            install();
            const e = editor('我们学习中文', start);
            e.keys([...keys]);
            expect(e.cm.getSelection()).toBe(selected);
        },
    );
});
