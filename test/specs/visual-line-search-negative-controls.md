---
title: Visual-line selection and reopened host search
description: Search-query and delayed-replacement negative controls for visual-line selection caches.
tags:
    - testing
---

## Real-renderer reproduction

The shared `visual-line-search` fixture reads the actual search input, native CM selection and Vim mode. It does not call the patched `getSelection()` while observing search, so instrumentation cannot create the cached selection being tested. Physical `V`, optional `j`, `Ctrl+F`, Escape and another `Ctrl+F` run in an isolated Windows Obsidian 1.14.5 vault. CDP focus emulation keeps the test renderer focused; the normal Obsidian instance and user vault are untouched.

The one-line case reopens immediately without moving; the two-line case moves with `j` before reopening. Both are run against old and repaired artifacts.

Old production artifact: selecting the first line fills the first query with `alpha selected line`. Selecting two lines fills it with `alpha selected linesecond other line` (the text input removes the newline). Escape closes search and leaves Vim normal mode with an empty native selection. Nevertheless, reopening search fills `alpha selected line` again in both cases. Both new `query === ''` assertions fail.

Control: disabling Vim Motions and enabling native Obsidian Vim, then leaving both search and visual mode before moving and reopening, yields an empty query. Native Vim required an extra Escape to leave visual mode in this sequence; the bundled engine was already normal after closing search. Comparisons were made only once both engines were normal and their native selections were empty.

Repaired production artifact: both first queries remain correct; closing search leaves no search input, and reopening yields an empty query without changing the note. The browser fixture runs unchanged under WDIO and CDP. The WDIO launcher is unavailable in this WSL environment, so the actual shared browser probes and keyboard events ran through CDP.

## Replacement compatibility controls

The private replacement snapshot now has a different purpose from current selection. Real-renderer checks cover both a direct `getSelection()` followed by a delay and a command callback whose selection is temporarily expanded. Each captures `alpha\nbeta`, waits, exits visual mode and replaces the range to obtain `head\n[[async]]\ntail`. The resulting selection is empty and `somethingSelected()` is false.

An intentionally broken temporary bundle removed both snapshot captures in memory, without changing the repository source or root production artifact. The same checks produced `head\nalpha\n[[async]]beta\ntail` (direct read) and `head\nalpha\nbet[[async]]a\ntail` (command). Both violate the expected replacement result. Restoring the production artifact and rerunning all four browser cases passed.

## Unit controls

Seven cases use the actual selection-patch ViewPlugin and actual command wrapper over a deterministic EditorState. On the old source five fail: stale getters return true/text after exit, a new native selection is ignored by replacement, a direct-read cache survives 30 seconds, and destruction leaves one snapshot timer instead of zero. Two controls preserve async replacement.

Separate source sabotages remove each capture independently. Without the direct-read snapshot the result is `head\nalpha\nbeta\nt[[link]]ail`, expected `head\n[[link]]\ntail`. Without the expanded-command snapshot it is `head\nalpha\nbeta\nt[[async]]ail`, expected `head\n[[async]]\ntail`. All sabotages were restored; all seven cases pass.
