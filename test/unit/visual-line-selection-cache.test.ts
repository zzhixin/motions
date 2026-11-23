import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, type TransactionSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { App } from 'obsidian';
import type { CmAdapter, VimApi } from '../../src/types/vim-api';
import {
    getCmAdapter,
    getCmAdapterFromEditorView,
    getVimApi,
} from '../../src/vim/vim-api';
import {
    installVisualLineCommandFix,
    visualLineSelectionSyncExtension,
} from '../../src/vim/visual-line-command-fix';

vi.mock('obsidian', async () => ({
    ...(await vi.importActual<object>('obsidian')),
    editorInfoField: Symbol('editor-info'),
}));
vi.mock('../../src/vim/vim-api', () => ({
    getCmAdapter: vi.fn(),
    getCmAdapterFromEditorView: vi.fn(),
    getVimApi: vi.fn(),
}));
const cleanups: (() => void)[] = [];

function editor() {
    let state = EditorState.create({
        doc: 'head\nalpha\nbeta\ntail',
        selection: { anchor: 11 },
    });
    const vim = {
        visualMode: true,
        visualLine: true,
        sel: { anchor: { line: 1, ch: 0 }, head: { line: 2, ch: 0 } },
    };
    const pos = (offset: number) => {
        const line = state.doc.lineAt(offset);
        return { line: line.number - 1, ch: offset - line.from };
    };
    const api = {
        cm: null as unknown as EditorView,
        somethingSelected: () => !state.selection.main.empty,
        getSelection: () =>
            state.sliceDoc(state.selection.main.from, state.selection.main.to),
        replaceSelection(text: string) {
            const selection = state.selection.main;
            state = state.update({
                changes: {
                    from: selection.from,
                    to: selection.to,
                    insert: text,
                },
                selection: { anchor: selection.from + text.length },
            }).state;
        },
        getCursor: () => pos(state.selection.main.head),
        listSelections: () => [
            {
                anchor: pos(state.selection.main.anchor),
                head: pos(state.selection.main.head),
            },
        ],
    };
    const view = {
        get state() {
            return {
                doc: state.doc,
                sliceDoc: state.sliceDoc.bind(state),
                field: () => ({ editor: api }),
            };
        },
        dispatch(spec: TransactionSpec) {
            state = state.update(spec).state;
        },
    } as unknown as EditorView;
    api.cm = view;
    const cm = {
        cm6: view,
        state: { vim },
        curOp: { isVimOp: false },
        operation(fn: () => void) {
            fn();
        },
        setCursor(line: number, ch: number) {
            view.dispatch({
                selection: { anchor: state.doc.line(line + 1).from + ch },
            });
        },
    } as unknown as CmAdapter;
    vi.mocked(getCmAdapterFromEditorView).mockReturnValue(cm);
    vi.mocked(getCmAdapter).mockReturnValue(cm);
    vi.mocked(getVimApi).mockReturnValue({
        handleKey: () => {
            vim.visualMode = vim.visualLine = false;
            return true;
        },
    } as unknown as VimApi);
    const extension = visualLineSelectionSyncExtension() as unknown as {
        create(view: EditorView): { destroy(): void };
    };
    const patch = extension.create(view);
    cleanups.push(() => patch.destroy());
    const commands = {
        commands: {},
        executeCommand(command: { callback: () => unknown }) {
            return command.callback();
        },
        addCommand() {},
    };
    const app = {
        workspace: { getActiveViewOfType: () => ({ editor: api }) },
        commands,
    } as unknown as App;
    cleanups.push(installVisualLineCommandFix(app));
    return {
        api,
        vim,
        view,
        patch,
        value: () => state.doc.toString(),
        exit() {
            vim.visualMode = vim.visualLine = false;
            cm.setCursor(3, 1);
        },
        run(callback: () => unknown) {
            return commands.executeCommand({ callback });
        },
    };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('live visual-line selection versus deferred replacement snapshots', () => {
    it('stops reporting a getSelection snapshot as selected after visual exit', () => {
        const e = editor();
        expect(e.api.getSelection()).toBe('alpha\nbeta');
        e.exit();
        expect.soft(e.api.somethingSelected()).toBe(false);
        expect(e.api.getSelection()).toBe('');
    });
    it('does not expose the expanded command snapshot to a later search', () => {
        const e = editor();
        const captured = e.run(() => e.api.getSelection());
        expect(captured).toBe('alpha\nbeta');
        e.exit();
        expect.soft(e.api.somethingSelected()).toBe(false);
        expect(e.api.getSelection()).toBe('');
    });
    it('still replaces the saved lines asynchronously after a direct read', async () => {
        const e = editor();
        expect(e.api.getSelection()).toBe('alpha\nbeta');
        e.exit();
        await Promise.resolve();
        e.api.replaceSelection('[[link]]');
        expect(e.value()).toBe('head\n[[link]]\ntail');
        expect.soft(e.api.somethingSelected()).toBe(false);
        expect(e.api.getSelection()).toBe('');
        e.api.replaceSelection('X');
        expect(e.value()).toBe('head\n[[link]]X\ntail');
    });
    it('retains the expanded-command snapshot for an awaited replacement', async () => {
        const e = editor();
        const work = e.run(async () => {
            expect(e.api.getSelection()).toBe('alpha\nbeta');
            await Promise.resolve();
            e.exit();
            e.api.replaceSelection('[[async]]');
        });
        await work;
        expect(e.value()).toBe('head\n[[async]]\ntail');
        expect(e.api.getSelection()).toBe('');
    });
    it('prefers a new native selection over an earlier replacement snapshot', () => {
        const e = editor();
        expect(e.api.getSelection()).toBe('alpha\nbeta');
        e.exit();
        e.view.dispatch({ selection: { anchor: 16, head: 20 } });
        expect(e.api.getSelection()).toBe('tail');
        e.api.replaceSelection('NEW');
        expect(e.value()).toBe('head\nalpha\nbeta\nNEW');
    });
    it('expires a direct-read replacement snapshot after 30 seconds', () => {
        const e = editor();
        expect(e.api.getSelection()).toBe('alpha\nbeta');
        e.exit();
        vi.advanceTimersByTime(30_001);
        e.api.replaceSelection('X');
        expect(e.value()).toBe('head\nalpha\nbeta\ntXail');
    });
    it('clears the snapshot timer when its view is destroyed', () => {
        const e = editor();
        e.run(() => e.api.getSelection());
        expect(vi.getTimerCount()).toBe(1);
        e.patch.destroy();
        expect(vi.getTimerCount()).toBe(0);
    });
});
