import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { ConcealLines } from '../../src/vim/conceal/lines';
const { tree } = vi.hoisted(() => ({ tree: { iterate: vi.fn() } }));
vi.mock('@codemirror/language', () => ({ syntaxTree: () => tree }));
afterEach(() => vi.clearAllMocks());

describe('Bounded per-editor conceal cache', () => {
    it('reuses one parsed projection until text changes', () => {
        const lines = new ConcealLines();
        const state = EditorState.create({ doc: 'plain text' });
        lines.get(state, 1);
        lines.get(state, 4);
        expect.soft(tree.iterate).toHaveBeenCalledTimes(1);
        const changed = state.update({
            changes: { from: 0, to: 5, insert: 'new' },
        }).state;
        lines.get(changed, 1);
        expect.soft(tree.iterate).toHaveBeenCalledTimes(2);
        lines.clear();
        lines.get(changed, 1);
        expect.soft(tree.iterate).toHaveBeenCalledTimes(3);
    });
    it('bounds empty-line entries as well as cached text', () => {
        const lines = new ConcealLines();
        const state = EditorState.create({ doc: '\n'.repeat(300) });
        for (let i = 0; i < 300; i++) lines.get(state, i);
        const count = tree.iterate.mock.calls.length;
        lines.get(state, 0);
        expect(tree.iterate.mock.calls.length).toBe(count + 1);
    });
    it('leaves pathological long lines native without parsing them', () => {
        const lines = new ConcealLines();
        lines.get(EditorState.create({ doc: '*'.repeat(20001) }), 0);
        expect(tree.iterate).toHaveBeenCalledTimes(0);
    });
});
