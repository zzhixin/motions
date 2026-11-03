# Personal integration release

Tag: `personal-2026.11.03.1`

This prerelease combines two independently maintained features on `integration/ime-and-chinese`:

- Chinese Flash matching: `feat/chinese-jump-support` at `7d11890`. Flash character motions match pinyin initials; short `/` and `?` searches support up to four characters, including mixed Chinese and English text. Ex substitutions keep their native behavior.
- Input method focus memory: `feat/ime-focus-memory` at `caa4f6e`. Notes, plugin inputs, and search boxes retain their input method state. The cross-app system-memory option controls whether returning to the same area requires a restore.

Both source branches share upstream `1.5.1` (`84770d2`) as their base and merge without text conflicts. Integration commits do not update either source branch or its existing pull request.

## Install

Download the three release assets, or extract the ZIP. Copy `main.js`, `manifest.json`, and `styles.css` into your vault's `.obsidian/plugins/vim-motions/` directory, then reload the plugin. Keep your existing `data.json` so your settings remain available.

The plugin ID remains `vim-motions`, so this build replaces the installed plugin. Its manifest version remains `1.5.1`; identify this personal build by its release tag and archive name. The archive also contains this file for identification. This prerelease is intended for manual installation and is not a community-catalog update.

## Validation scope

The integrated tree passed source, test, and configuration TypeScript checks, ESLint, formatting, pattern checks, dead-code checks, and a production build. The full unit suite passed: 160 files, 3563 tests passed, and 102 skipped. Each feature was previously tested separately on the user's machine. Combined behavior in a real Obsidian instance still needs checking, particularly Flash search input with IME focus restoration and cross-app switching.

## Future updates

Merge new commits from either feature branch into `integration/ime-and-chinese`, resolve and test there, and create a new `personal-*` tag. Keep fixes specific to integration and release packaging on this branch. The automatic release workflow excludes personal tags; upload assets manually and mark each release as a prerelease.
