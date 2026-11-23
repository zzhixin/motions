import type { CmAdapter, MotionFn, VimApi, VimPos } from '../../types/vim-api';
import { previewNavigator } from './registry';

const motions = [
    'moveByCharacters',
    'moveByLines',
    'moveByDisplayLines',
    'moveByWords',
    'moveByPage',
    'moveByScroll',
    'moveToStartOfLine',
    'moveToFirstNonWhiteSpaceCharacter',
    'moveToEol',
    'moveToColumn',
    'moveToLineOrEdgeOfDocument',
    'moveToTopLine',
    'moveToMiddleLine',
    'moveToBottomLine',
    'subwordForward',
    'subwordBackward',
    'subwordEndForward',
    'subwordEndBackward',
];

/** Calculate word motions on visible text; only the returned positions reach Vim. */
function projectedAdapter(cm: CmAdapter): CmAdapter {
    const navigator = previewNavigator(cm.cm6)!;
    const proxy = Object.create(cm) as CmAdapter;
    proxy.getLine = (line) =>
        line < cm.firstLine() || line > cm.lastLine()
            ? ''
            : navigator.line(cm.cm6.state.doc.line(line + 1).from).text;
    return proxy;
}

export function applyPreviewConcealMotions(vim: VimApi): () => void {
    const originals = new Map<string, MotionFn>();
    let depth = 0;
    for (const name of motions) {
        const original = vim.getMotion(name);
        if (!original) continue;
        originals.set(name, original);
        vim.defineMotion(name, (cm, head, args, state, input) => {
            // Actions such as I call a motion directly with just cm/head.
            // Only full navigation calls belong to the conceal adapter.
            if (!args || !state) return original(cm, head, args, state, input);
            const call = (adapter = cm, start = head, repeat = args.repeat) => {
                depth++;
                try {
                    return original(
                        adapter,
                        start,
                        { ...args, repeat },
                        state,
                        input,
                    );
                } finally {
                    depth--;
                }
            };
            const navigator = previewNavigator(cm.cm6);
            if (
                depth ||
                !navigator?.active() ||
                (input as { operator?: string } | undefined)?.operator ||
                state.insertMode ||
                state.visualLine ||
                state.visualBlock
            )
                return call();
            navigator.prepare();
            const allowEnd =
                !!state.visualMode ||
                ['all', 'onemore'].includes(
                    String(vim.getOption('virtualedit')),
                );
            if (name !== 'moveByLines') navigator.resetGoal();
            if (name === 'moveByCharacters') {
                let offset = cm.indexFromPos(head);
                const forward = !!args.forward;
                const option = vim.getOption('whichwrap');
                const whichwrap = typeof option === 'string' ? option : '';
                for (let i = 0; i < args.repeat; i++) {
                    const line = navigator.line(offset);
                    let next = line.step(offset, forward, allowEnd);
                    if (
                        next === offset &&
                        whichwrap.includes(forward ? 'l' : 'h')
                    ) {
                        const row =
                            cm.cm6.state.doc.lineAt(offset).number +
                            (forward ? 1 : -1);
                        if (row >= 1 && row <= cm.cm6.state.doc.lines) {
                            const target = cm.cm6.state.doc.line(row);
                            next = navigator
                                .line(target.from)
                                .snap(
                                    forward ? target.from : target.to,
                                    forward,
                                    allowEnd,
                                );
                        }
                    }
                    if (next === offset) break;
                    offset = next;
                }
                return cm.posFromIndex(offset);
            }
            const word = name === 'moveByWords' || name.startsWith('subword');
            let result;
            if (word) {
                const projection = navigator.line(cm.indexFromPos(head));
                const start: VimPos = {
                    line: head.line,
                    ch: projection.toDisplay(cm.indexFromPos(head)),
                };
                result = call(projectedAdapter(cm), start);
                if (result && !Array.isArray(result) && 'line' in result) {
                    const line = cm.cm6.state.doc.line(
                        Math.max(
                            1,
                            Math.min(cm.cm6.state.doc.lines, result.line + 1),
                        ),
                    );
                    const projection = navigator.line(line.from);
                    return cm.posFromIndex(
                        projection.snap(
                            projection.toSource(result.ch, allowEnd),
                            !args.wordEnd &&
                                (args.forward ?? name.endsWith('Forward')),
                            allowEnd,
                        ),
                    );
                }
                return result;
            }
            result = call();
            if (!result || Array.isArray(result) || !('line' in result))
                return result;
            const target = cm.indexFromPos(result),
                start = cm.indexFromPos(head);
            const next =
                name === 'moveByLines'
                    ? navigator.vertical(start, target, allowEnd)
                    : navigator
                          .line(target)
                          .snap(
                              target,
                              args.forward ?? target >= start,
                              allowEnd,
                          );
            return cm.posFromIndex(next);
        });
    }
    return () => {
        for (const [name, original] of originals)
            vim.defineMotion(name, original);
        originals.clear();
    };
}
