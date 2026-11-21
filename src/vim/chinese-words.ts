import type {
    CmAdapter,
    MotionFn,
    VimApi,
    VimPos,
    VimState,
} from '../types/vim-api';
import { ChineseWordBoundaries } from '../util/chinese-word-boundaries';
import { ChineseWordReader } from './chinese-word-range';

/** Host-language customization through the shipped motion API; no key remaps. */
export function applyChineseWordMotions(vim: VimApi): () => void {
    if (typeof vim.getMotion !== 'function') return () => {};
    const boundaries = new ChineseWordBoundaries();
    const originals = new Map<string, MotionFn>();
    for (const name of [
        'moveByWords',
        'textObjectManipulation',
        'subwordForward',
        'subwordBackward',
        'subwordEndForward',
        'subwordEndBackward',
    ]) {
        const original = vim.getMotion(name);
        if (!original) continue;
        originals.set(name, original);
        vim.defineMotion(name, (cm, head, args, state, input) => {
            const object = name === 'textObjectManipulation';
            const subword = name.startsWith('subword');
            const forward = subword ? name.endsWith('Forward') : !!args.forward;
            const wordEnd = subword ? name.includes('End') : !!args.wordEnd;
            if (
                object &&
                args.selectedCharacter !== 'w' &&
                args.selectedCharacter !== 'W'
            ) {
                return original(cm, head, args, state, input);
            }
            const reader = new ChineseWordReader(
                cm,
                boundaries,
                object ? args.selectedCharacter === 'W' : !!args.bigWord,
                subword,
            );
            const result = object
                ? reader.object(head, args.repeat || 1, !!args.textObjectInner)
                : reader.move(head, args.repeat || 1, forward, wordEnd);
            // Preserve the engine's exact semantics outside Chinese ranges.
            if (!reader.usedChinese)
                return original(cm, head, args, state, input);
            // The engine trims cw's trailing spaces by the built-in motion
            // name. Subword mappings use a different name, so keep that rule
            // here for their Chinese ranges as well.
            if (
                subword &&
                forward &&
                !wordEnd &&
                result &&
                !Array.isArray(result) &&
                (input as { operator?: string } | undefined)?.operator ===
                    'change'
            ) {
                const text = cm.getRange(head, result);
                const spaces = /\s+$/.exec(text);
                if (/\S/.test(text) && spaces) {
                    return cm.posFromIndex(
                        cm.indexFromPos(result) - spaces[0].length,
                    );
                }
            }
            return object && result && Array.isArray(result)
                ? visualWordRange(cm, result, state)
                : result;
        });
    }
    return () => {
        for (const [name, original] of originals)
            vim.defineMotion(name, original);
        originals.clear();
    };
}

/** Preserve an existing visual selection while expanding its word at the head. */
function visualWordRange(
    cm: CmAdapter,
    range: [VimPos, VimPos],
    state: VimState,
): [VimPos, VimPos] {
    if (!state.visualMode || !state.sel) return range;
    const anchor = cm.indexFromPos(state.sel.anchor);
    const head = cm.indexFromPos(state.sel.head);
    const start = Math.min(anchor, head, cm.indexFromPos(range[0]));
    const end = Math.max(anchor, head, cm.indexFromPos(range[1]) - 1);
    return head < anchor
        ? [cm.posFromIndex(end), cm.posFromIndex(start)]
        : [cm.posFromIndex(start), cm.posFromIndex(end)];
}
