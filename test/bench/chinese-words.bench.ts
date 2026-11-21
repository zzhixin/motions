import { bench, describe } from 'vitest';
import { ChineseWordBoundaries } from '../../src/util/chinese-word-boundaries';

const text = '我们学习中文。中文分词需要保持输入流畅。'.repeat(5_000);
const warm = new ChineseWordBoundaries();
warm.spanAt(text, 50_000);

describe('Chinese dictionary boundaries in a long line', () => {
    bench('cached window', () => {
        warm.spanAt(text, 50_000);
    });
    bench('cold cache and segmenter', () => {
        new ChineseWordBoundaries().spanAt(text, 50_000);
    });
});
