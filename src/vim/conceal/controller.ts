import { editorLivePreviewField } from 'obsidian';
import {
    Prec,
    EditorState,
    Transaction,
    type ChangeDesc,
    type Extension,
    type Range,
} from '@codemirror/state';
import {
    Decoration,
    EditorView,
    ViewPlugin,
    type DecorationSet,
    type ViewUpdate,
} from '@codemirror/view';
import type { CmAdapter } from '../../types/vim-api';
import { classifySurface } from '../../util/surface-gate';
import { getCmAdapterFromEditorView } from '../vim-api';
import { isExternalBackendActive, onExternalVimMode } from '../external-mode';
import { ConcealLines } from './lines';
import { hiddenSpans, ConcealLine } from './model';
import { concealDelay, type ConcealOptions } from './options';
import { registerPreviewNavigator } from './registry';
import { RevealClock } from './clock';
import { RevealedRegions } from './reveal';
import { cursorLayoutChanged, refreshCursorLayout } from '../cursor-layout';

const hidden = Decoration.replace({ inclusive: false, previewConceal: true });

class PreviewConceal {
    decorations: DecorationSet = Decoration.none;
    private readonly lines = new ConcealLines();
    private adapter: CmAdapter | null = null;
    private readonly clock: RevealClock;
    private readonly revealed = new RevealedRegions();
    private policy: ConcealOptions['policy'] | null = null;
    private projection: {
        source: ConcealLine;
        version: number;
        line: ConcealLine;
    } | null = null;
    private mouse = false;
    private composing = false;
    private destroyed = false;
    private queued = false;
    private resetQueued = false;
    private initialized = false;
    private signature = '';
    private goal: number | null = null;
    private verticalTarget = -1;
    private readonly unregister: () => void;
    private readonly unsubscribe: () => void;
    private readonly modeChanged = () => this.request(true);

    constructor(
        private readonly view: EditorView,
        private readonly options: () => ConcealOptions,
        private readonly owners: WeakMap<EditorState, PreviewConceal>,
    ) {
        this.clock = new RevealClock(
            view.dom.ownerDocument.defaultView ?? window,
        );
        owners.set(view.state, this);
        this.unregister = registerPreviewNavigator(view, this);
        this.unsubscribe = onExternalVimMode(() => this.request(true));
        this.bind();
        this.rebuild();
        this.request(true);
    }
    private bind(): void {
        const adapter = getCmAdapterFromEditorView(this.view);
        if (adapter === this.adapter) return;
        this.adapter?.off('vim-mode-change', this.modeChanged);
        this.adapter = adapter;
        this.adapter?.on('vim-mode-change', this.modeChanged);
    }
    active(): boolean {
        return this.renderable() && !this.adapter?.state.vim?.insertMode;
    }
    /** Editing opens its own group while neighboring groups stay concealed. */
    private renderable(): boolean {
        const vim = this.adapter?.state.vim;
        return (
            !!vim &&
            !vim.selectMode &&
            !vim.visualLine &&
            !vim.visualBlock &&
            !this.composing &&
            !this.view.composing &&
            !isExternalBackendActive() &&
            this.view.dom.isConnected &&
            this.view.dom.closest('.markdown-source-view') !== null &&
            classifySurface(this.view) === 'document' &&
            this.view.state.field(editorLivePreviewField, false) === true
        );
    }
    line(position: number): ConcealLine {
        const model = this.lines.get(this.view.state, position);
        const version = this.revealed.version;
        if (
            this.projection?.source === model.projection &&
            this.projection.version === version
        )
            return this.projection.line;
        const groups = this.revealed.concealed(model.groups);
        const line =
            groups.length === model.groups.length
                ? model.projection
                : new ConcealLine(
                      model.projection.source,
                      model.projection.offset,
                      hiddenSpans(groups),
                  );
        this.projection = { source: model.projection, version, line };
        return line;
    }
    private head(): number {
        const vim = this.adapter?.state.vim;
        return vim?.visualMode && vim.sel && this.adapter
            ? this.adapter.indexFromPos(vim.sel.head)
            : this.view.state.selection.main.head;
    }
    private syncReveals(changes?: ChangeDesc): void {
        const policy = this.options().policy;
        if (
            this.policy !== policy ||
            this.view.state.field(editorLivePreviewField, false) !== true ||
            isExternalBackendActive()
        )
            this.revealed.clear();
        this.policy = policy;
        this.revealed.sync(this.head(), changes);
    }
    private revealHere(): void {
        const head = this.head();
        this.revealed.reveal(
            this.lines.get(this.view.state, head).groups,
            head,
        );
    }
    resetGoal(): void {
        this.goal = null;
        this.verticalTarget = -1;
    }
    vertical(head: number, target: number, allowEnd: boolean): number {
        if (this.goal === null || head !== this.verticalTarget)
            this.goal = this.line(head).column(head);
        this.verticalTarget = this.line(target).atColumn(this.goal, allowEnd);
        return this.verticalTarget;
    }
    prepare(): void {
        if (this.mouse) {
            this.mouse = false;
            this.revealHere();
            this.cancel();
            this.arm();
            this.request(false);
        }
    }
    revealForMouse(): void {
        this.mouse = true;
        this.cancel();
        this.request(false);
    }
    composition(active: boolean): void {
        this.composing = active;
        this.request(true);
    }
    private cancel(): void {
        this.clock.cancel();
    }
    private getSignature(): string {
        const options = this.options(),
            vim = this.adapter?.state.vim;
        return `${options.policy}:${concealDelay(options.delay)}:${!!vim?.insertMode}:${!!vim?.visualMode}:${!!vim?.visualLine}:${!!vim?.visualBlock}:${this.active()}`;
    }
    private arm(): void {
        if (
            !this.active() ||
            this.mouse ||
            !this.view.hasFocus ||
            this.options().policy === 'insert'
        )
            return;
        const delay = concealDelay(this.options().delay);
        const head = this.head();
        if (
            !this.revealed
                .concealed(this.lines.get(this.view.state, head).groups)
                .some((group) => group.from <= head && head < group.to)
        )
            return;
        if (!delay) {
            this.revealHere();
            return;
        }
        const doc = this.view.state.doc;
        this.clock.schedule(delay, () => {
            if (
                this.destroyed ||
                !this.active() ||
                !this.view.hasFocus ||
                doc !== this.view.state.doc ||
                head !== this.head() ||
                this.signature !== this.getSignature()
            )
                return;
            this.revealHere();
            refreshCursorLayout(this.view);
        });
    }
    update(update: ViewUpdate): void {
        this.owners.set(update.state, this);
        this.bind();
        this.syncReveals(update.docChanged ? update.changes : undefined);
        const signature = this.getSignature();
        if (
            update.docChanged ||
            update.selectionSet ||
            signature !== this.signature ||
            update.focusChanged
        ) {
            this.signature = signature;
            this.cancel();
            if (!this.mouse) this.arm();
        }
        this.rebuild();
    }
    /** Obsidian's previous decorations can queue a selection back onto '['
     * or '**', even collapsing a visual range over the formatted body.
     * Reject that rewrite into a concealed boundary before dispatch;
     * edits, pointer selections and moves to another visible position pass.
     */
    filter(transaction: Transaction): Transaction | readonly Transaction[] {
        const before = transaction.startState.selection;
        const after = transaction.selection;
        if (
            this.destroyed ||
            !this.active() ||
            this.mouse ||
            transaction.docChanged ||
            transaction.effects.length ||
            !after ||
            transaction.isUserEvent('select') ||
            before.ranges.length !== after.ranges.length ||
            this.adapter?.state.vim?.inputState?.operator
        )
            return transaction;
        let changed = false;
        for (let i = 0; i < after.ranges.length; i++) {
            for (const edge of ['anchor', 'head'] as const) {
                const old = before.ranges[i]![edge],
                    next = after.ranges[i]![edge];
                if (old === next) continue;
                const groups = this.revealed.concealed(
                    this.lines.get(this.view.state, old).groups,
                );
                if (
                    !groups.some(
                        (group) =>
                            next < old &&
                            old <= group.to &&
                            group.hidden.some((span) => span.from === next),
                    )
                )
                    return transaction;
                changed = true;
            }
        }
        return changed ? [] : transaction;
    }
    private rebuild(): void {
        if (!this.renderable() || this.mouse) {
            this.decorations = Decoration.none;
            return;
        }
        const state = this.view.state,
            head = this.head();
        const numbers = new Set<number>([state.doc.lineAt(head).number]);
        for (const range of this.view.visibleRanges) {
            const first = state.doc.lineAt(range.from).number,
                last = state.doc.lineAt(range.to).number;
            for (let n = first; n <= last; n++) numbers.add(n);
        }
        const ranges: Range<Decoration>[] = [];
        for (const n of numbers) {
            const line = state.doc.line(n);
            const groups = this.lines.get(state, line.from).groups;
            const retained = this.revealed.concealed(groups);
            const concealed = this.adapter?.state.vim?.insertMode
                ? retained.filter(
                      (group) => head < group.from || head >= group.to,
                  )
                : retained;
            for (const span of hiddenSpans(concealed))
                ranges.push(hidden.range(span.from, span.to));
        }
        this.decorations = Decoration.set(ranges, true);
    }
    private request(reset: boolean): void {
        this.resetQueued ||= reset;
        if (this.queued) return;
        this.queued = true;
        queueMicrotask(() => {
            this.queued = false;
            if (this.destroyed) return;
            this.bind();
            if (this.resetQueued) {
                this.resetQueued = false;
                this.mouse = false;
                this.cancel();
                this.syncReveals();
                this.signature = this.getSignature();
                this.arm();
            }
            // Only the first activation needs a starting position: a note can
            // open at column zero, occupied by a hidden heading/link prefix.
            const vim = this.adapter?.state.vim;
            const head = this.view.state.selection.main.head;
            if (
                !this.initialized &&
                this.active() &&
                !vim?.visualMode &&
                this.view.state.selection.main.empty
            ) {
                this.initialized = true;
                const next = this.line(head).snap(head, true);
                if (next !== head && this.adapter) {
                    const pos = this.adapter.posFromIndex(next);
                    if (vim) vim.sel = { anchor: pos, head: pos };
                    this.view.dispatch({
                        selection: { anchor: next },
                        effects: cursorLayoutChanged.of(null),
                        annotations: Transaction.addToHistory.of(false),
                    });
                    return;
                }
            }
            refreshCursorLayout(this.view);
        });
    }
    destroy(): void {
        this.destroyed = true;
        this.cancel();
        this.unregister();
        this.unsubscribe();
        this.adapter?.off('vim-mode-change', this.modeChanged);
        this.adapter = null;
        this.lines.clear();
        this.revealed.clear();
        this.projection = null;
    }
}

export function createPreviewConceal(options: () => ConcealOptions): Extension {
    const owners = new WeakMap<EditorState, PreviewConceal>();
    const plugin = ViewPlugin.define(
        (view) => new PreviewConceal(view, options, owners),
        {
            decorations: (value) => value.decorations,
            provide: (plugin) =>
                EditorView.atomicRanges.of(
                    (view) =>
                        view.plugin(plugin)?.decorations ?? Decoration.none,
                ),
            eventObservers: {
                mousedown(_event, view) {
                    view.plugin(plugin)?.revealForMouse();
                },
                compositionstart(_event, view) {
                    view.plugin(plugin)?.composition(true);
                },
                compositionend(_event, view) {
                    view.plugin(plugin)?.composition(false);
                },
            },
        },
    );
    return [
        Prec.highest(plugin),
        EditorState.transactionFilter.of(
            (transaction) =>
                owners.get(transaction.startState)?.filter(transaction) ??
                transaction,
        ),
    ];
}
