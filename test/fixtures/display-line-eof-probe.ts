import type { App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { CmAdapter, VimApi } from '../../src/types/vim-api';

/** Runs unchanged in WDIO and the isolated desktop CDP renderer. */
export async function displayLineEofProbe(
    { app }: { app: App },
    concealed: boolean,
) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as {
        settings: Record<string, unknown>;
        reloadFeatures(): void;
    };
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const vim = window.CodeMirrorAdapter!.Vim as VimApi;
    const previous = {
        previewConceal: plugin.settings.previewConceal,
        previewConcealReveal: plugin.settings.previewConcealReveal,
    };
    const wait = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));
    const keys = (...keys: string[]) =>
        keys.forEach((key) => vim.handleKey(view.cm, key));
    const snapshot = () => {
        if (!view.hasFocus)
            throw new Error('Display-line probe requires focus');
        const ch = editor.getCursor().ch;
        const coords = view.coordsAtPos(ch)!;
        return { ch, top: coords.top, goal: view.cm.state.vim!.lastHSPos };
    };
    try {
        keys('<Esc>');
        Object.assign(plugin.settings, {
            previewConceal: concealed,
            previewConcealReveal: 'insert',
        });
        plugin.reloadFeatures();
        const body = 'word '.repeat(28) + 'Z';
        const source = concealed ? `**${body}**` : body;
        editor.setValue(source);
        editor.focus();
        await wait(120);
        const last = source.lastIndexOf('Z');
        const rows: { top: number; positions: number[] }[] = [];
        for (let pos = concealed ? 2 : 0; pos <= last; pos++) {
            const top = view.coordsAtPos(pos)!.top;
            let row = rows.find((row) => Math.abs(row.top - top) < 2);
            if (!row) rows.push((row = { top, positions: [] }));
            row.positions.push(pos);
        }
        if (rows.length < 2) throw new Error('Fixture did not wrap');
        const penultimate = rows.at(-2)!;
        const final = view.coordsAtPos(last)!;
        const candidates = penultimate.positions.filter(
            (pos) => view.coordsAtPos(pos)!.left > final.left + 30,
        );
        if (!candidates.length)
            throw new Error('Final row is not short enough');
        const start = candidates[Math.floor(candidates.length / 2)]!;
        editor.setCursor({ line: 0, ch: start });
        // A horizontal motion makes Vim capture the initial screen-column goal.
        keys('l', 'h');
        await wait(30);
        keys('g', 'j');
        await wait(30);
        const down = snapshot();
        keys('g', 'j');
        const edge = snapshot();
        keys('g', 'k');
        const back = snapshot();
        keys('9', 'g', 'j');
        const counted = snapshot();
        keys('g', 'k');
        const backAgain = snapshot();
        return {
            start,
            last,
            previousTop: penultimate.top,
            finalTop: final.top,
            down,
            edge,
            back,
            counted,
            backAgain,
        };
    } finally {
        Object.assign(plugin.settings, previous);
        plugin.reloadFeatures();
    }
}
