import { StateEffect, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { refreshVimCursors } from '@replit/codemirror-vim';

/** A display change moved glyphs without changing document or selection. */
export const cursorLayoutChanged = StateEffect.define<null>();

export function refreshCursorLayout(view: EditorView): void {
    view.dispatch({
        effects: cursorLayoutChanged.of(null),
        annotations: Transaction.addToHistory.of(false),
    });
    // The fork queues reads in CM's next measurement pass, after decorations
    // reach the DOM. No command events, selection rewrites or synchronous reads.
    refreshVimCursors();
}
