---
title: Chinese word segmentation
description: Move, edit, and select Chinese words with Vim commands.
tags:
    - editing
    - text-objects
---

Chinese text is split into words using the system's `Intl.Segmenter` dictionary. For example, `我们学习中文` is treated as `我们` / `学习` / `中文`. This is enabled automatically in the bundled Vim engine.

![[keybindings#Chinese word segmentation]]

`iw` selects the complete word even when the cursor is inside it. `aw` includes trailing spaces when present, otherwise preceding spaces except indentation. `cw` preserves the spaces after the changed word. Counts, registers, undo, dot-repeat, and characterwise visual selections use the same word boundaries. The related `b`/`B`, `e`/`E`, `ge`/`gE`, and `iW`/`aW` also recognize Chinese words.

`W` splits Chinese words too; runs of non-Chinese text keep their usual WORD behavior, including punctuation. Latin words retain Vim's behavior. With [[text-objects|subword motions]] enabled, Latin camelCase and snake_case navigation continues to use subwords while Chinese uses dictionary words. Your own key mappings still take precedence.

Segmentation runs locally and synchronously. It needs no downloads, network requests, workers, or key-prefix timeout. Results are reused across commands and editors using a bounded cache keyed by the actual text. Edits and undo therefore cannot leave stale word positions behind.

The dictionary can differ between operating systems and runtime versions. Older WebViews without `Intl.Segmenter` fall back to one complete Han character per word. Long lines use fixed 256-unit UTF-16 windows, extended at surrogate pairs; a word spanning a window edge may be split there. This limits the work of a single dictionary call and the cache size. The optional Neovim backend keeps Neovim's own word behavior.

The implementation uses the shipped Vim motion API, following the approach of [cm-chs-patch](https://github.com/aidenlx/cm-chs-patch), and also covers word text objects and their operators.
