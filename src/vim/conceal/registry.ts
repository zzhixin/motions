import type { EditorView } from '@codemirror/view';
import type { ConcealLine } from './model';
export interface PreviewNavigator {
    active(): boolean;
    prepare(): void;
    line(position: number): ConcealLine;
    vertical(head: number, target: number, allowEnd: boolean): number;
    resetGoal(): void;
}
const navigators = new WeakMap<EditorView, PreviewNavigator>();
export function previewNavigator(
    view: EditorView,
): PreviewNavigator | undefined {
    return navigators.get(view);
}
export function registerPreviewNavigator(
    view: EditorView,
    navigator: PreviewNavigator,
): () => void {
    navigators.set(view, navigator);
    return () => {
        if (navigators.get(view) === navigator) navigators.delete(view);
    };
}
