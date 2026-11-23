import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureWindowFocused } from '../helpers';
import {
    previewConcealProbe,
    previewConcealCursorProbe,
    previewConcealRetentionProbe,
} from '../fixtures/preview-conceal-probe';

describe('Live Preview conceal', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        if (!(await ensureWindowFocused())) this.skip();
    });

    it('preserves visible navigation, source editing and the configured reveal deadline', async function () {
        const result = await browser.executeObsidian(previewConcealProbe);
        const rendered = 'Heading boldá🙂中 and label Aliasplain end';
        await expect(result).toEqual({
            formatted: rendered,
            positions: [4, 6, 9, 10, 15, 36, 26, 2, 40],
            editing: 'Heading boldá🙂中 and label [[Target|Alias]]plain end',
            resumed: rendered,
            visual: {
                selection: [22, 27],
                head: { line: 2, ch: 6 },
                text: rendered,
            },
            before: 'alpha betalink',
            after: '**alpha beta**link',
            moving: '**alpha beta**link',
            restarted: '**alpha beta**link',
            deadline: '**alpha beta**link',
            insertPolicy: 'alpha betalink',
            insert: '**alpha beta**link',
            normal: 'alpha betalink',
            zero: '**alpha beta**link',
            disabled: '**alpha beta**link',
        });
    });

    it('keeps revealed source editable until leaving, with independent adjacent regions', async function () {
        const result = await browser.executeObsidian(
            previewConcealRetentionProbe,
        );
        await expect(result).toEqual({
            revealed: { text: '[ab](one)cd X', ch: 1 },
            moved: { text: '[ab](one)cd X', ch: 2 },
            destination: { text: '[ab](one)cd X', ch: 5 },
            opening: { text: '[ab](one)cd X', ch: 0 },
            enteredNeighbor: { text: 'abcd X', ch: 10 },
            neighborRevealed: { text: 'ab[cd](two) X', ch: 10 },
            neighborOpening: { text: 'ab[cd](two) X', ch: 9 },
            returned: { text: 'abcd X', ch: 2 },
            revealedAgain: { text: '[ab](one)cd X', ch: 2 },
            edited: { text: '[Zab](one)cd X', ch: 2 },
            source: '[Zab](one)[cd](two) X',
            insertAdjacent: '[ab](one)cd X',
            visualEditing: {
                text: '[Zab](one)cd X',
                head: 9,
                selection: [9, 10],
            },
            headingFirst: '# **ab** cd tail',
            headingCrossed: '# ab cd tail',
            headingSecond: '# ab `cd` tail',
        });
    });
    for (const animated of [false, true]) {
        it(`remeasures the ${animated ? 'animated' : 'blinking'} cursor after reveal without movement`, async function () {
            const result = await browser.executeObsidian(
                previewConcealCursorProbe,
                animated,
            );
            await expect(result.before.text).toBe('alpha beta tail');
            await expect(result.before.head).toBe(4);
            await expect(result.before.error).toBeLessThan(2);
            await expect(result.after.text).toBe('**alpha beta** tail');
            await expect(result.after.head).toBe(4);
            await expect(result.shift).toBeGreaterThan(5);
            await expect(result.after.error).toBeLessThan(2);
        });
    }
});
