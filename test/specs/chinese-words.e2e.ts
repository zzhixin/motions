import { browser, expect } from '@wdio/globals';
import { obsidianPage } from 'wdio-obsidian-service';
import {
    getCursorPos,
    getEditorValue,
    getRegisterContent,
    getVimMode,
    sendVimEscape,
    setPluginSettingAndReload,
    setupEditor,
    vimKeys,
} from '../helpers';

describe('Chinese word commands', function () {
    before(async function () {
        await browser.reloadObsidian({ vault: 'test-vault' });
        await obsidianPage.openFile('Welcome.md');
        await setPluginSettingAndReload('enableSubwordMotions', false);
    });

    afterEach(async function () {
        await sendVimEscape();
    });

    for (const key of ['w', 'W']) {
        it(`${key} moves to the next dictionary word`, async function () {
            await setupEditor('我们学习中文', { line: 0, ch: 0 });
            await vimKeys(key);
            await expect(await getCursorPos()).toEqual({ line: 0, ch: 2 });
        });
    }

    for (const keys of [
        'dw',
        'cw',
        'yw',
        'diw',
        'daw',
        'ciw',
        'caw',
        'yiw',
        'yaw',
    ]) {
        it(`${keys} operates on one Chinese word`, async function () {
            await setupEditor('我们学习中文', {
                line: 0,
                ch: keys.length === 3 ? 1 : 0,
            });
            await vimKeys(...keys);
            await expect({
                text: await getEditorValue(),
                register: await getRegisterContent('"'),
                mode: await getVimMode(),
            }).toEqual({
                text: keys.startsWith('y') ? '我们学习中文' : '学习中文',
                register: { text: '我们', linewise: false },
                mode: keys.startsWith('c') ? 'insert' : 'normal',
            });
        });
    }

    it('recomputes dot-repeat and undo using the edited text', async function () {
        await setupEditor('我们学习中文', { line: 0, ch: 0 });
        await vimKeys('d', 'w', '.');
        await expect(await getEditorValue()).toBe('中文');
        await vimKeys('u');
        await expect(await getEditorValue()).toBe('学习中文');
    });

    it('keeps word support after settings reload and with subword navigation', async function () {
        await setPluginSettingAndReload('enableSubwordMotions', true);
        try {
            await setupEditor('camelCase我们学习', { line: 0, ch: 5 });
            await vimKeys('d', 'w');
            await expect(await getEditorValue()).toBe('camel我们学习');
            await setupEditor('我们学习中文', { line: 0, ch: 0 });
            await vimKeys('w');
            await expect(await getCursorPos()).toEqual({ line: 0, ch: 2 });
        } finally {
            await setPluginSettingAndReload('enableSubwordMotions', false);
        }
    });
});
