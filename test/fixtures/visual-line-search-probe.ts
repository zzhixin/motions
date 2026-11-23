import type { App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { CmAdapter } from '../../src/types/vim-api';

export async function prepareVisualSearchProbe({ app }: { app: App }) {
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    window.CodeMirrorAdapter!.Vim.handleKey(view.cm, '<Esc>');
    editor.setValue('alpha selected line\nsecond other line\nthird tail');
    editor.setCursor({ line: 0, ch: 4 });
    editor.focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    if (!view.hasFocus) throw new Error('Search probe requires editor focus');
}

/** Reading the actual search UI never calls getSelection or seeds its cache. */
export async function readVisualSearchProbe({ app }: { app: App }) {
    await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const inputs = view.dom
        .closest('.workspace-leaf')
        ?.querySelectorAll<HTMLInputElement>(
            '.document-search-container input',
        );
    const input =
        inputs &&
        Array.from(inputs).find(
            (input) => input.getBoundingClientRect().height > 0,
        );
    return {
        query: input ? input.value : null,
        visual: view.cm.state.vim?.visualMode === true,
        nativeSelectionEmpty: view.state.selection.main.empty,
        source: editor.getValue(),
    };
}

/** Preserve the deferred replacement workflow while keeping reads current. */
export async function visualLineAsyncReplacementProbe(
    { app }: { app: App },
    command: boolean,
) {
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const vim = window.CodeMirrorAdapter!.Vim;
    vim.handleKey(view.cm, '<Esc>');
    editor.setValue('head\nalpha\nbeta\ntail');
    editor.setCursor({ line: 1, ch: 0 });
    editor.focus();
    vim.handleKey(view.cm, 'V');
    vim.handleKey(view.cm, 'j');
    const id = 'vim-motions-e2e-visual-search-async';
    let captured = '';
    const replace = async () => {
        captured = editor.getSelection();
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
        vim.handleKey(view.cm, '<Esc>');
        editor.replaceSelection('[[async]]');
    };
    try {
        if (command) {
            let work: Promise<void> | undefined;
            app.commands.addCommand({
                id,
                name: 'Test delayed visual replacement',
                callback: () => {
                    work = replace();
                },
            });
            app.commands.executeCommandById(id);
            if (!work) throw new Error('Replacement command did not run');
            await work;
        } else {
            await replace();
        }
        return {
            captured,
            source: editor.getValue(),
            selection: editor.getSelection(),
            selected: editor.somethingSelected(),
        };
    } finally {
        if (command) app.commands.removeCommand(id);
        vim.handleKey(view.cm, '<Esc>');
    }
}
