import type { App } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { CmAdapter, VimApi } from '../../src/types/vim-api';

/** Shared by WDIO and the local Windows CDP runner; reads actual rendered DOM. */
export async function previewConcealProbe(
    { app }: { app: App },
    enabled = true,
) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as {
        settings: Record<string, unknown>;
        reloadFeatures(): void;
    };
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const vim = window.CodeMirrorAdapter!.Vim as VimApi;
    const wait = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const text = () => {
        if (!view.hasFocus)
            throw new Error('Conceal probe requires editor focus');
        return view.contentDOM.textContent;
    };
    const keys = (value: string[]) => {
        for (const key of value) vim.handleKey(view.cm, key, 'user');
    };
    const previous = {
        previewConceal: plugin.settings.previewConceal,
        previewConcealReveal: plugin.settings.previewConcealReveal,
        previewConcealDelay: plugin.settings.previewConcealDelay,
    };
    const configure = (policy: string, delay = 200) => {
        Object.assign(plugin.settings, {
            previewConceal: enabled,
            previewConcealReveal: policy,
            previewConcealDelay: delay,
        });
        plugin.reloadFeatures();
    };
    try {
        keys(['<Esc>']);
        configure('insert');
        editor.setValue(
            '# Heading **bold**\n\n**á🙂中** and [label](url) [[Target|Alias]]\n\nplain end',
        );
        editor.setCursor({ line: 2, ch: 2 });
        editor.focus();
        await wait(120);
        const formatted = text();
        const positions: number[] = [];
        for (const key of ['l', 'l', 'l', 'w', 'w', 'w', 'h', '0', '$']) {
            keys([key]);
            await wait(35);
            positions.push(editor.getCursor().ch);
        }
        keys(['i']);
        await wait(35);
        const editing = text();
        keys(['<Esc>']);
        await wait(35);
        const resumed = text();
        // Native source coordinates and Vim's visual head must agree.
        editor.setCursor({ line: 2, ch: 2 });
        keys(['v', 'l', 'l']);
        await wait(50);
        const visual = {
            selection: [
                view.state.selection.main.anchor,
                view.state.selection.main.head,
            ],
            head: view.cm.state.vim!.sel!.head,
            text: text(),
        };
        keys(['<Esc>']);
        editor.setValue('**alpha beta**\n\n[link](url)');
        editor.setCursor({ line: 0, ch: 3 });
        configure('delay', 300);
        await wait(75);
        const before = text();
        await wait(275);
        const after = text();
        keys(['l']);
        await wait(40);
        const moving = text();
        await wait(140);
        keys(['l']);
        await wait(180);
        const restarted = text();
        await wait(150);
        const deadline = text();
        configure('insert');
        await wait(350);
        const insertPolicy = text();
        keys(['i']);
        await wait(35);
        const insert = text();
        keys(['<Esc>']);
        await wait(35);
        const normal = text();
        configure('delay', 0);
        await wait(35);
        const zero = text();
        configure('delay', 300);
        await wait(35);
        plugin.settings.previewConceal = false;
        plugin.reloadFeatures();
        await wait(350);
        const disabled = text();
        return {
            formatted,
            positions,
            editing,
            resumed,
            visual,
            before,
            after,
            moving,
            restarted,
            deadline,
            insertPolicy,
            insert,
            normal,
            zero,
            disabled,
        };
    } finally {
        keys(['<Esc>']);
        Object.assign(plugin.settings, previous);
        plugin.reloadFeatures();
    }
}

/** Regression: opening source must survive motion, editing and adjacent groups. */
export async function previewConcealRetentionProbe({ app }: { app: App }) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as {
        settings: Record<string, unknown>;
        reloadFeatures(): void;
    };
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const vim = window.CodeMirrorAdapter!.Vim as VimApi;
    const wait = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const keys = (...values: string[]) => {
        for (const key of values) vim.handleKey(view.cm, key, 'user');
    };
    const snapshot = () => {
        if (!view.hasFocus)
            throw new Error('Conceal retention probe requires focus');
        return { text: view.contentDOM.textContent, ch: editor.getCursor().ch };
    };
    const previous = {
        previewConceal: plugin.settings.previewConceal,
        previewConcealReveal: plugin.settings.previewConcealReveal,
        previewConcealDelay: plugin.settings.previewConcealDelay,
    };
    try {
        keys('<Esc>');
        Object.assign(plugin.settings, {
            previewConceal: true,
            previewConcealReveal: 'delay',
            previewConcealDelay: 200,
        });
        plugin.reloadFeatures();
        editor.setValue('[ab](one)[cd](two) X');
        editor.setCursor({ line: 0, ch: 1 });
        editor.focus();
        await wait(300);
        const revealed = snapshot();
        keys('l');
        await wait(35);
        const moved = snapshot();
        keys('3', 'l');
        await wait(35);
        const destination = snapshot();
        keys('0');
        await wait(35);
        const opening = snapshot();
        editor.setCursor({ line: 0, ch: 8 });
        keys('l');
        await wait(35);
        const enteredNeighbor = snapshot();
        await wait(260);
        const neighborRevealed = snapshot();
        keys('h');
        await wait(35);
        const neighborOpening = snapshot();
        keys('h');
        await wait(35);
        const returned = snapshot();
        await wait(260);
        const revealedAgain = snapshot();
        editor.setCursor({ line: 0, ch: 1 });
        keys('i');
        await wait(35);
        const insertAdjacent = snapshot().text;
        editor.replaceRange('Z', { line: 0, ch: 1 });
        editor.setCursor({ line: 0, ch: 2 });
        keys('<Esc>');
        await wait(35);
        keys('l');
        await wait(35);
        const edited = snapshot(),
            source = editor.getValue();
        editor.setCursor({ line: 0, ch: 9 });
        keys('v');
        await wait(35);
        const visualEditing = {
            text: snapshot().text,
            head: view.cm.state.vim!.sel!.head.ch,
            selection: [
                view.state.selection.main.anchor,
                view.state.selection.main.head,
            ],
        };
        keys('<Esc>');
        editor.setValue('# **ab** `cd` tail');
        editor.setCursor({ line: 0, ch: 4 });
        await wait(300);
        const headingFirst = snapshot().text;
        editor.setCursor({ line: 0, ch: 10 });
        await wait(35);
        const headingCrossed = snapshot().text;
        await wait(260);
        const headingSecond = snapshot().text;
        return {
            revealed,
            moved,
            destination,
            opening,
            enteredNeighbor,
            neighborRevealed,
            neighborOpening,
            returned,
            revealedAgain,
            edited,
            source,
            insertAdjacent,
            visualEditing,
            headingFirst,
            headingCrossed,
            headingSecond,
        };
    } finally {
        keys('<Esc>');
        Object.assign(plugin.settings, previous);
        plugin.reloadFeatures();
    }
}

/** Measures the painted cursor, without sending keys after source reveal. */
export async function previewConcealCursorProbe(
    { app }: { app: App },
    animated: boolean,
) {
    const plugin = app.plugins.plugins['vim-motions'] as unknown as {
        settings: Record<string, unknown>;
        reloadFeatures(): void;
    };
    const editor = app.workspace.activeEditor!.editor!;
    const view = editor.cm as EditorView & { cm: CmAdapter };
    const vim = window.CodeMirrorAdapter!.Vim as VimApi;
    const wait = (ms: number) =>
        new Promise<void>((resolve) => window.setTimeout(resolve, ms));
    const previous = Object.fromEntries(
        [
            'previewConceal',
            'previewConcealReveal',
            'previewConcealDelay',
            'animatedCursor',
            'smoothCursor',
            'smearTrail',
        ].map((key) => [key, plugin.settings[key]]),
    );
    const snapshot = () => {
        if (!view.hasFocus) throw new Error('Cursor probe requires focus');
        const head = view.state.selection.main.head;
        const expected = view.coordsAtPos(head)!;
        let left: number;
        if (animated) {
            const canvas = document.querySelector<HTMLCanvasElement>(
                '.vim-motions-animated-cursor-canvas',
            );
            if (!canvas) throw new Error('Animated cursor canvas missing');
            const ctx = canvas.getContext('2d')!;
            const scale = canvas.width / parseFloat(canvas.style.width);
            const pane = view.scrollDOM.getBoundingClientRect();
            const x0 = Math.max(0, Math.floor(pane.left * scale));
            const y0 = Math.max(0, Math.floor(expected.top * scale));
            const width = Math.min(
                canvas.width - x0,
                Math.ceil(pane.width * scale),
            );
            const height = Math.min(
                canvas.height - y0,
                Math.ceil((expected.bottom - expected.top) * scale),
            );
            const pixels = ctx.getImageData(x0, y0, width, height).data;
            let minX = Infinity;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (pixels[(y * width + x) * 4 + 3]! > 8)
                        minX = Math.min(minX, x);
                }
            }
            if (!Number.isFinite(minX))
                throw new Error('Animated cursor has no painted pixels');
            left = (x0 + minX) / scale;
        } else {
            const cursor = view.scrollDOM.querySelector(
                '.cm-vimCursorLayer .cm-cursor-primary',
            );
            if (!cursor) throw new Error('Vim cursor missing');
            left = cursor.getBoundingClientRect().left;
        }
        return {
            text: view.contentDOM.textContent,
            head,
            left,
            expected: expected.left,
            error: Math.abs(left - expected.left),
        };
    };
    try {
        vim.handleKey(view.cm, '<Esc>', 'user');
        Object.assign(plugin.settings, {
            previewConceal: true,
            previewConcealReveal: 'delay',
            previewConcealDelay: 250,
            animatedCursor: animated,
            smoothCursor: false,
            smearTrail: false,
        });
        plugin.reloadFeatures();
        editor.setValue('**alpha beta** tail');
        editor.setCursor({ line: 0, ch: 4 });
        editor.focus();
        await wait(100);
        const before = snapshot();
        const deadline = performance.now() + 1500;
        while (view.contentDOM.textContent !== '**alpha beta** tail') {
            if (performance.now() > deadline)
                throw new Error('Source did not reveal');
            await wait(10);
        }
        // Allow the queued CM measurement and canvas paint, without movement.
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        const after = snapshot();
        return { before, after, shift: after.expected - before.expected };
    } finally {
        Object.assign(plugin.settings, previous);
        plugin.reloadFeatures();
    }
}
