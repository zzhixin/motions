---
title: Display-line EOF regression evidence
description: Red-first and boundary/column controls for entering the last wrapped display row.
tags:
    - testing
---

## Reproduction

The adapter returns `hitSide: true` when downward movement reaches the source EOF, even if it has entered another displayed row. The fork's `moveByDisplayLines` previously discarded that result unconditionally. The source change now checks the two display coordinates on edge results only; it leaves `lastHSPos` untouched. Genuine attempts past the terminal display row still stop. Ordinary motion adds no timer, parsing or extra geometry reads.

`displayLineEofProbe` lays out a paragraph in actual Windows Obsidian 1.14.5, locates the penultimate row and selects a column beyond the shorter final row. It exercises `gj`, another `gj`, `gk`, `9gj`, `gk`, both with and without conceal. The shared fixture runs in WDIO and CDP; WSL cannot run the WDIO launcher, so these runs used CDP focus emulation in an isolated vault.

Before repair, the plain paragraph stayed at column **104** rather than its last character at **140**. Its y-coordinate stayed **179.453** instead of advancing to **203.452**. The following `gk` moved to column **39** rather than returning to **104**. The new assertion failed with `104 !== 140`. The formatted/concealed control already passed: hidden closing delimiters kept the target before source EOF.

After repair, the plain case returns `140 → 140 → 104 → 140 → 104`, with the screen-column goal fixed at **344.133 px**. The concealed control returns `142 → 142 → 103 → 142 → 103`, with goal **382.898 px**. Assertions compare measured rows and input-derived source positions, not fixed theme or font coordinates.

Physical CDP keydown/keyup events independently produced `gj: 104 → 140` and `gk: 140 → 104`, with the same **344.133 px** goal. A clean-build check first reversed the installed dependency patch; `npm run build` automatically reapplied it and the four unit cases passed again. Registry lockfile installation preflights passed under npm 10, 11 and the latest npm.

## Installed-engine tests and negative controls

The four unit cases run the real installed Vim engine and its real `findPosV` adapter against a deterministic three-row geometry. Before the fix, `gj` stayed at **10** rather than reaching **14**; reverse motion returned **4** instead of **10**. Counted movement failed the same way.

| Deliberate defect                                          | Observed failure                                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Discard every edge result (old code)                       | Final character 14 was never reached; cursor remained at 10.                               |
| Ignore the real terminal-row guard                         | `gj` already in the last row moved from 13 to 14; `gk` in the first row moved from 4 to 0. |
| Replace the remembered goal with the clamped target column | Goal became 24 instead of 32; `gk` returned column 9 instead of 10.                        |

All sabotages were restored and the four cases passed. The ESM and CJS distribution patch is derived from the fork source correction recorded in `patches/upstream/codemirror-vim-display-line-eof.diff`; root postinstall and the esbuild entry apply it with `patch-package --error-on-fail`. The dependency continues to use its npm registry alias. No runtime monkey patch or plugin motion wrapper is used.
