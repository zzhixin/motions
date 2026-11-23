---
title: Live Preview conceal
description: Navigate visible Markdown text and reveal source after a configurable pause.
tags:
    - editing
    - navigation
---

Enable **Settings → Vim Motions → General → Vim features → Live Preview conceal**. It is off by default and requires the bundled Vim engine in Live Preview.

Normal and characterwise visual navigation keeps supported Markdown syntax hidden while you move. Obsidian still supplies the text styles. The first version covers single-line bold, italic, strikethrough, highlight, inline code, headings, Markdown inline links, and wikilinks with aliases.

**Conceal source reveal** selects one of two policies:

- **After delay** reveals the source of the formatted group under the cursor after you stop moving. **Conceal reveal delay (ms)** defaults to **200 ms**, accepts integers from **0 to 10000**, and restarts after each cursor move until that region opens. **0** reveals immediately.
- **When editing** keeps navigation concealed until you enter insert mode. Mouse interaction and IME composition also return control to Obsidian's source display.

The same controls work in vimrc or Lua:

```vim
set previewconceal
set previewconcealreveal=delay
set previewconcealdelay=250
```

```lua
vim.opt.previewconceal = true
vim.opt.previewconcealreveal = "delay" -- or "insert"
vim.opt.previewconcealdelay = 250
```

Once a delayed reveal opens a region, movement within that region keeps its source visible. Delimiters, link addresses and alias targets become navigable source text. The region returns to preview only when the cursor leaves it; returning starts a new reveal delay. Adjacent regions are independent, including when their hidden delimiter ranges touch. A revealed heading prefix does not open neighboring bold/code groups.

Editing opens the current region while other supported regions stay concealed. Standard `I` enters insert mode at the first nonblank source character, preserving leading whitespace. In the insert-only policy, leaving insert mode restores preview; an already delayed-revealed region stays open through editing and Escape until the cursor leaves. Region bounds follow text edits, and visual mode uses Vim's actual head rather than its inclusive selection endpoint to determine whether the cursor has left.

Timers belong to each editor and are cancelled on movement, focus loss, reconfiguration and disposal. Reveal changes only decorations; it adds no undo entry. Both the blinking Vim cursor and the animated cursor remeasure their position when source opens, without requiring a movement key.

![[keybindings#Live Preview conceal]]

`gj`/`gk` follow displayed rows. Moving into a shorter final row lands on its last visible character while retaining the desired column for the return motion.

The visible text maps back to the original Markdown. Operators and text objects retain source ranges, and a visual selection remains a continuous source range: copying across formatting can include Markdown delimiters. Conceal does not rewrite your note.

Parsing reuses Obsidian's existing syntax tree. Only visible lines and requested motion targets are projected, with a per-editor cache limited to 256 lines and 100,000 source UTF-16 units. Lines longer than 20,000 units retain native behavior. Navigation introduces no timer or asynchronous wait; only source reveal is delayed.

Source mode, built-in Vim, external Neovim, table-cell editors, images, embeds, math and generated widgets retain their existing behavior. Lists, callouts, fenced blocks, reference links and multiline inline formatting need separate adapters. Search, character-find and custom jumps keep their source-based destinations; they are outside the visible-text motion adapter. See [[live-preview-navigation|the original plan]] for later scope.
