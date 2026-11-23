import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import { ensureWindowFocused } from '../helpers';
import {
    prepareConcealInsertProbe,
    readConcealInsertProbe,
    restoreConcealInsertProbe,
} from '../fixtures/conceal-insert-probe';

describe('Conceal and normal-mode insert entry', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        if (!(await ensureWindowFocused())) this.skip();
    });
    for (const source of ['  alpha beta', '  **alpha beta**']) {
        it(`consumes Shift+I and permits editing at the first nonblank in ${source}`, async function () {
            const previous = await browser.executeObsidian(
                prepareConcealInsertProbe,
                source,
            );
            try {
                await browser.keys(['I']);
                const entered = await browser.executeObsidian(
                    readConcealInsertProbe,
                );
                await expect(entered).toEqual({
                    source,
                    cursor: { line: 0, ch: 2 },
                    insert: true,
                    keyMap: 'vim-insert',
                });
                await browser.keys(['Z']);
                const typed = await browser.executeObsidian(
                    readConcealInsertProbe,
                );
                await expect(typed).toEqual({
                    source: '  Z' + source.slice(2),
                    cursor: { line: 0, ch: 3 },
                    insert: true,
                    keyMap: 'vim-insert',
                });
                await browser.keys(['Escape']);
                const exited = await browser.executeObsidian(
                    readConcealInsertProbe,
                );
                await expect(exited).toEqual({
                    source: typed.source,
                    cursor: { line: 0, ch: 2 },
                    insert: false,
                    keyMap: 'vim',
                });
            } finally {
                await browser.executeObsidian(
                    restoreConcealInsertProbe,
                    previous,
                );
            }
        });
    }
});
