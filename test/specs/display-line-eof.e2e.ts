import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureWindowFocused } from '../helpers';
import { displayLineEofProbe } from '../fixtures/display-line-eof-probe';

describe('Display-line navigation at a short EOF row', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        if (!(await ensureWindowFocused())) this.skip();
    });
    for (const concealed of [false, true]) {
        it(`enters the last row and restores its goal with conceal ${concealed ? 'enabled' : 'disabled'}`, async function () {
            const r = await browser.executeObsidian(
                displayLineEofProbe,
                concealed,
            );
            await expect(r.finalTop).toBeGreaterThan(r.previousTop + 5);
            await expect(r.down.ch).toBe(r.last);
            await expect(r.down.top).toBe(r.finalTop);
            await expect(r.edge.ch).toBe(r.last);
            await expect(r.back.ch).toBe(r.start);
            await expect(r.back.top).toBe(r.previousTop);
            await expect(r.counted.ch).toBe(r.last);
            await expect(r.backAgain.ch).toBe(r.start);
            for (const point of [r.edge, r.back, r.counted, r.backAgain]) {
                await expect(point.goal).toBe(r.down.goal);
            }
        });
    }
});
