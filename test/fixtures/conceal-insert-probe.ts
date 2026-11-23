import type { App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { CmAdapter } from '../../src/types/vim-api';

type Plugin = {
    settings: { previewConceal: boolean; previewConcealReveal: string };
    reloadFeatures(): void;
};

/** Set up source and focus; the caller sends a physical Shift+I next. */
export async function prepareConcealInsertProbe(
    { app }: { app: App },
    source: string,
    enabled = true,
) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as Plugin;
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & {
        cm: CmAdapter & { getOption(name: string): unknown };
    };
    window.CodeMirrorAdapter!.Vim.handleKey(view.cm, '<Esc>');
    const previous = {
        previewConceal: plugin.settings.previewConceal,
        previewConcealReveal: plugin.settings.previewConcealReveal,
    };
    Object.assign(plugin.settings, {
        previewConceal: enabled,
        previewConcealReveal: 'insert',
    });
    plugin.reloadFeatures();
    editor.setValue(source);
    editor.setCursor({ line: 0, ch: Math.min(9, source.length - 1) });
    editor.focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 120));
    if (!view.hasFocus) throw new Error('Insert probe requires editor focus');
    if (view.cm.state.vim?.insertMode)
        throw new Error('Insert probe must start in normal mode');
    return previous;
}

export async function readConcealInsertProbe({ app }: { app: App }) {
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & {
        cm: CmAdapter & { getOption(name: string): unknown };
    };
    if (!view.hasFocus) throw new Error('Insert probe lost editor focus');
    return {
        source: editor.getValue(),
        cursor: editor.getCursor(),
        insert: view.cm.state.vim?.insertMode === true,
        keyMap: view.cm.getOption('keyMap'),
    };
}

export function restoreConcealInsertProbe(
    { app }: { app: App },
    previous: { previewConceal: boolean; previewConcealReveal: string },
) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as Plugin;
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & {
        cm: CmAdapter & { getOption(name: string): unknown };
    };
    window.CodeMirrorAdapter!.Vim.handleKey(view.cm, '<Esc>');
    Object.assign(plugin.settings, previous);
    plugin.reloadFeatures();
}
