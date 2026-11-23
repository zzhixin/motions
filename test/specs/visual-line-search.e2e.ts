import { browser, expect } from '@wdio/globals';
import { Key } from 'webdriverio';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureWindowFocused } from '../helpers';
import {
    prepareVisualSearchProbe,
    readVisualSearchProbe,
    visualLineAsyncReplacementProbe,
} from '../fixtures/visual-line-search-probe';

async function openSearch() {
    await browser.keys([Key.Ctrl, 'f']);
    await browser.keys(Key.NULL);
}

describe('Visual-line selection and reopening host search', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        if (!(await ensureWindowFocused())) this.skip();
    });
    afterEach(async function () {
        await browser.keys(['Escape']);
        await browser.keys(['Escape']);
    });
    for (const lines of [1, 2]) {
        it(`uses the current ${lines}-line selection once, without resurrecting it in normal mode`, async function () {
            await browser.executeObsidian(prepareVisualSearchProbe);
            await browser.keys(['V']);
            if (lines === 2) await browser.keys(['j']);
            await openSearch();
            const first = await browser.executeObsidian(readVisualSearchProbe);
            await expect(first.query).toBe(
                lines === 1
                    ? 'alpha selected line'
                    : 'alpha selected linesecond other line',
            );
            await browser.keys(['Escape']);
            const closed = await browser.executeObsidian(readVisualSearchProbe);
            await expect(closed.query).toBeNull();
            await expect(closed.visual).toBe(false);
            await expect(closed.nativeSelectionEmpty).toBe(true);
            if (lines === 2) await browser.keys(['j']);
            await openSearch();
            const reopened = await browser.executeObsidian(
                readVisualSearchProbe,
            );
            await expect(reopened.query).toBe('');
            await expect(reopened.visual).toBe(false);
            await expect(reopened.source).toBe(
                'alpha selected line\nsecond other line\nthird tail',
            );
        });
    }
    for (const command of [false, true]) {
        it(`keeps delayed replacement working through ${command ? 'a host command' : 'a direct selection read'}`, async function () {
            const result = await browser.executeObsidian(
                visualLineAsyncReplacementProbe,
                command,
            );
            await expect(result).toEqual({
                captured: 'alpha\nbeta',
                source: 'head\n[[async]]\ntail',
                selection: '',
                selected: false,
            });
        });
    }
});
