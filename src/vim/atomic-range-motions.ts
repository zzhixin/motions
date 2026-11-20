import { EditorView } from '@codemirror/view';
import type { RangeSet, RangeValue } from '@codemirror/state';
import type { CmAdapter, MotionFn, VimApi, VimPos } from '../types/vim-api';

const navigationMotions = [
    'moveByCharacters',
    'moveByLines',
    'moveByDisplayLines',
    'moveByWords',
    'moveByPage',
    'moveByScroll',
];

/** Resolve before dispatch: a later correction has already exposed the source. */
function skipAtoms(
    cm: CmAdapter,
    pos: VimPos,
    atoms: readonly RangeSet<RangeValue>[],
    direction: number,
    allowLineEnd: boolean,
): VimPos {
    const doc = cm.cm6.state.doc;
    const legalOffset = (offset: number): number => {
        offset = Math.max(0, Math.min(doc.length, offset));
        const line = doc.lineAt(offset);
        return allowLineEnd
            ? offset
            : Math.min(offset, Math.max(line.from, line.to - 1));
    };
    let offset = legalOffset(cm.indexFromPos(pos));
    for (;;) {
        let next = offset;
        for (const ranges of atoms) {
            ranges.between(offset, offset, (from, to) => {
                if (offset <= from || offset >= to) return;
                if (direction > 0 && legalOffset(to) === to) {
                    next = Math.max(next, to);
                } else {
                    // At EOL the engine clips back one character. Use the
                    // start instead of letting that clip re-enter the atom.
                    if (direction > 0) next = offset;
                    direction = -1;
                    next = Math.min(next, from);
                }
            });
        }
        if (next === offset) return cm.posFromIndex(offset);
        offset = next;
    }
}

/** Installed outside the table motion wrappers; disposed before them. */
export function applyAtomicRangeMotions(vim: VimApi): () => void {
    const originals = new Map<string, MotionFn>();
    // Scroll and other motions call sibling motions internally. Only adapt
    // the outer navigation, whose input snapshot still identifies operators.
    let depth = 0;
    for (const name of navigationMotions) {
        const original = vim.getMotion(name);
        if (!original) continue;
        originals.set(name, original);
        vim.defineMotion(name, (cm, head, args, state, input) => {
            const callOriginal = (start = head, motionArgs = args) => {
                depth++;
                try {
                    return original(cm, start, motionArgs, state, input);
                } finally {
                    depth--;
                }
            };
            const operator = (input as { operator?: string } | undefined)
                ?.operator;
            if (depth || operator || state.insertMode || state.visualLine) {
                return callOriginal();
            }
            const atoms = cm.cm6.state
                .facet(EditorView.atomicRanges)
                .map((getRanges) => getRanges(cm.cm6))
                .filter((ranges) => ranges.size > 0);
            if (!atoms.length) return callOriginal();
            const virtualedit = vim.getOption('virtualedit');
            const allowLineEnd =
                !!state.visualMode ||
                virtualedit === 'all' ||
                virtualedit === 'onemore';
            const run = (start: VimPos, repeat: number) => {
                const result = callOriginal(start, { ...args, repeat });
                // Custom replacements can return ranges, null or a Promise.
                if (!result || Array.isArray(result) || !('line' in result))
                    return result;
                const direction =
                    args.forward === undefined
                        ? Math.sign(
                              cm.indexFromPos(result) - cm.indexFromPos(start),
                          )
                        : args.forward
                          ? 1
                          : -1;
                return skipAtoms(cm, result, atoms, direction, allowLineEnd);
            };
            if (name !== 'moveByCharacters') return run(head, args.repeat);
            // Count visible steps, rather than snapping a raw 3l only once.
            let pos = head;
            for (let i = 0; i < args.repeat; i++) {
                const next = run(pos, 1);
                if (!next || Array.isArray(next) || !('line' in next))
                    return next;
                if (next.line === pos.line && next.ch === pos.ch) break;
                pos = next;
            }
            return pos;
        });
    }
    return () => {
        for (const [name, original] of originals)
            vim.defineMotion(name, original);
        originals.clear();
    };
}
