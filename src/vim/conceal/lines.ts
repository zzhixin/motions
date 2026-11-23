import { syntaxTree } from '@codemirror/language';
import type { EditorState, Text } from '@codemirror/state';
import {
    ConcealLine,
    concealGroups,
    hiddenSpans,
    type ConcealGroup,
    type ConcealToken,
} from './model';

interface LineModel {
    groups: ConcealGroup[];
    projection: ConcealLine;
}
const MAX_LINE_LENGTH = 20_000;
const MAX_CACHE_UNITS = 100_000;
const MAX_CACHE_LINES = 256;

/** View-owned, bounded cache; parser trees and source text remain immutable. */
export class ConcealLines {
    private doc: Text | null = null;
    private tree: ReturnType<typeof syntaxTree> | null = null;
    private readonly cache = new Map<number, LineModel>();
    private units = 0;

    get(state: EditorState, position: number): LineModel {
        const tree = syntaxTree(state);
        if (state.doc !== this.doc || tree !== this.tree) {
            this.cache.clear();
            this.units = 0;
            this.doc = state.doc;
            this.tree = tree;
        }
        const line = state.doc.lineAt(
            Math.max(0, Math.min(state.doc.length, position)),
        );
        const cached = this.cache.get(line.number);
        if (cached) return cached;
        const tokens: ConcealToken[] = [];
        if (line.length <= MAX_LINE_LENGTH)
            tree.iterate({
                from: line.from,
                to: line.to,
                enter(node) {
                    if (
                        node.name !== 'Document' &&
                        node.from >= line.from &&
                        node.to <= line.to
                    )
                        tokens.push({
                            name: node.name,
                            from: node.from,
                            to: node.to,
                        });
                },
            });
        const groups = concealGroups(line.text, line.from, tokens);
        const model = {
            groups,
            projection: new ConcealLine(
                line.text,
                line.from,
                hiddenSpans(groups),
            ),
        };
        while (
            this.cache.size &&
            (this.units + line.length > MAX_CACHE_UNITS ||
                this.cache.size >= MAX_CACHE_LINES)
        ) {
            const key = this.cache.keys().next().value!;
            this.units -= this.cache.get(key)!.projection.source.length;
            this.cache.delete(key);
        }
        if (line.length <= MAX_CACHE_UNITS) {
            this.cache.set(line.number, model);
            this.units += line.length;
        }
        return model;
    }
    clear(): void {
        this.cache.clear();
        this.doc = null;
        this.tree = null;
        this.units = 0;
    }
}
