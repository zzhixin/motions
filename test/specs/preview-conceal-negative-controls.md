# Live Preview conceal: controls and latency

Measured on the integration branch on 2026-11-21 with the registry Vim fork, without dependency changes.

## Unit controls

The initial four `test/unit/conceal*.test.ts` files contain 45 tests. Every sabotage was restored immediately and the restored suite passed.

| Broken behavior                                           | Observed failure                                                                                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial model absent (red first)                          | 15 of the original 18 cases failed: missing syntax spans and source positions instead of visible stops.                                                                                                                                                                        |
| Hide whole lines rather than syntax; break source mapping | All 19 model cases failed. The heading example concealed `0..21` instead of seven delimiter spans; projected text was empty instead of `á🙂中`; source positions were `[20,20,20,20]` instead of `[12,14,16,16]`. Boundary cases returned `-1` instead of their visible stops. |
| Remove motion installation                                | `l` returned column 3 instead of 4; `2l` returned 4 instead of 6; `0` returned 0 instead of 2. Visual source/head assertions also failed.                                                                                                                                      |
| Return a wrong character destination                      | Column 1 instead of 2 exposes the backward grapheme case that the native engine already handled correctly.                                                                                                                                                                     |
| Remove operator guard                                     | `dl` deleted closing syntax: `**ab rest` instead of `**ab** rest`.                                                                                                                                                                                                             |
| Remove inactive-view guard                                | `0` returned column 2 instead of native column 0.                                                                                                                                                                                                                              |
| Remove teardown                                           | Original character motion returned column 9 instead of 7 after disposal.                                                                                                                                                                                                       |
| Fire clocks immediately and omit cancellation             | Reveal counts were 1/2 instead of 0 before deadlines, and 2 instead of 1 after the final deadline. Cancellation left 1 queued timer instead of 0 and fired once instead of zero times.                                                                                         |
| Break delay normalization                                 | 10001 instead of 0, 42, 10000 or the invalid-input default 200.                                                                                                                                                                                                                |
| Disable projection cache                                  | Parser calls were 2/3/4 instead of 1/2/3 for reuse, edited text and disposal.                                                                                                                                                                                                  |
| Remove cache clear                                        | 2 parser calls instead of 3 after explicitly clearing the current document.                                                                                                                                                                                                    |
| Remove empty-line entry bound                             | Reopening the oldest line made 300 parser calls instead of 301.                                                                                                                                                                                                                |
| Parse pathological long lines                             | 1 parser call instead of 0 for a 20001-unit line.                                                                                                                                                                                                                              |
| Omit config option registration                           | Existing settings coverage failed with missing `previewConceal`, `previewConcealReveal`, `previewConcealDelay`. Registering their vimrc/Lua options restored the test without exclusions.                                                                                      |

## Real rendering

An isolated Windows Obsidian 1.14.5 vault ran the same `previewConcealProbe` used by `preview-conceal.e2e.ts`. A local assertion driver extracted the WDIO expected object and checked the CDP result against it. All fields matched with conceal enabled. With conceal disabled, the same assertion failed: normal-mode `**` markers appeared immediately, the visual range collapsed to `[20,20]` instead of `[22,27]`, and navigation positions differed from `[4,6,9,10,15,36,26,2,40]`.

During implementation, the host's deferred selection correction also collapsed a valid visual range to `[20,20]` with the first boundary guard. Expanding the guard to cover the native rewrite within the same concealed group restored `[22,27]` and Vim head `{line:2,ch:6}`. This is intercepted before dispatch, without changing native plugin state or repeatedly correcting the cursor afterwards.

The focused-window probe verifies the 300 ms deadline, source remaining open during subsequent movement within that region, insert-only policy after 350 ms, insert/normal transitions, zero delay and disabling with a timer pending. Editor focus is required: Obsidian natively hides syntax in an unfocused editor even in insert mode. Background throttling was disabled only in the isolated test window.

Physical CDP keydown/keyup events for `l l w l h 0 $` over `**ab** [cd](url)` produced columns `3,6,8,9,8,2,9`, with rendered text `ab cd` throughout. Vertical traversal over bold, a heading, a one-character line and bold again retained visible column 3 across the short line: source columns `5,0,5,0,5,5`. Source mode retained literal syntax and native `0` returned column 0.

The WDIO launcher itself is unavailable in this WSL environment; the shared browser probe and physical CDP events were run against the actual Windows renderer. Mobile, arbitrary themes and other plugins were not interactively verified.

## Keeping revealed regions editable

The retention regression was run against the old production artifact before the fix. For `[ab](one)[cd](two) X`, after the first link opens, `l` returned `abcd X` instead of `[ab](one)cd X`. `3l` then landed at source column 18 instead of 5 inside the link address, and `0` returned column 1 instead of the editable opening bracket at column 0. A header's `# ` also disappeared when moving between its bold and code children.

`previewConcealRetentionProbe` and the additional WDIO assertion now cover source movement, entering/leaving two adjacent links, the opening bracket of an already revealed neighbor, reopening after return, typing through mapped bounds, visual selection at the last source character, and sibling formats in a revealed heading. The shared assertion fails on the old artifact and passes after repair. The existing baseline probe's `moving` and `restarted` expectations were deliberately changed to retain `**alpha beta**`; its old behavior also fails the new assertion.

An intermediate fix passed retention but still let Obsidian expand both adjacent links in insert mode: `insertAdjacent` was `[ab](one)[cd](two) X`, expected `[ab](one)cd X`. Rendering is now gated separately from motion adaptation, so editing opens the current groups while noncurrent supported groups remain concealed.

Some local Windows sequences lost OS focus and were rejected by the probe's focus guard. Subsequent verification used CDP focus emulation to keep the isolated renderer focused; editor selections and source were not mocked.

The seven tests in `conceal-reveal.test.ts` bring the focused suite to **52** cases. All source sabotages were restored before the final run:

| Removed behavior                | Observed failure                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Never open a region             | Projection was `abcd` instead of `[ab](one)cd`; source steps returned 10 instead of 3 and 11 instead of 10; opening position was 1 instead of 0. |
| Keep regions after leaving      | The previous region remained open at the shared boundary; revealing the next region concealed zero groups instead of just the previous group.    |
| Skip edit mapping               | Both edited groups stayed concealed instead of only the neighbor at `10..19`.                                                                    |
| Retain a wholly replaced region | Only the second group was concealed instead of both after replacing `0..9`.                                                                      |
| Reveal every sibling            | Opening a heading and its current bold child also opened the code sibling.                                                                       |
| Skip clear                      | Only the neighbor was concealed after disposal instead of both groups.                                                                           |

The region interval is half-open: the last closing delimiter remains editable, but the shared endpoint belongs to the next adjacent region. Visual ownership uses Vim's head, not the inclusive CM selection endpoint: at the first region's final source character after an edit, head 9 and selection `[9,10]` retain that region. Open intervals follow incremental edits, and whole replacements release ownership.

Physical CDP key events independently moved through a revealed link address, inserted `Z` into `(one)` to produce `(Zone)`, escaped, moved in normal mode, undid and redid the insertion. Source remained available through normal movement and undo/redo, while the adjacent link retained independent preview behavior.

## Cursor geometry after delayed reveal

`previewConcealCursorProbe` reads the actual fork cursor DOM or opaque pixels on the animated cursor canvas, against CM's current source-position coordinates. It uses `**alpha beta** tail`, source head 4, a 250 ms reveal delay and no movement after reveal. Smooth movement and the smear trail are disabled to measure the settled canvas position. Both probes first require an aligned preview cursor and an actual layout shift; a missing canvas, missing paint or lost focus fails the probe.

Red first on the previous production artifact: the blinking cursor remained at x=432.017 while the revealed character moved to x=447.614 (15.597 px error). The animated cursor stayed at x=431.894 (15.720 px error). Both `< 2 px` assertions failed. After the fix the errors are 0 px and 0.262 px respectively, with source head unchanged at 4. The shared browser functions ran in the isolated Windows Obsidian 1.14.5 renderer through CDP with focus emulation; the WDIO launcher remains unavailable in WSL.

Display-only refreshes now carry a shared cursor-layout effect. The animated cursor invalidates its geometry/glyph cache, wakes and snaps to the new layout. After dispatch, the fork's public `refreshVimCursors()` queues its normal CM measurement pass. This emits no Vim command events and does not rewrite the selection or document, so it cannot reset a command prefix or create an undo entry. There is no additional reveal timer or polling in production.

## Normal-mode `I` and internal action calls

The fork's `enterInsertMode(firstNonBlank)` calls `moveToFirstNonWhiteSpaceCharacter(cm, head)` directly. Conceal's navigation wrapper assumed it always received motion arguments and Vim state. In an active navigator it read `state.insertMode` from undefined; in an inactive navigator its fallback read `args.repeat` from undefined. These are internal computations by the action, so the wrapper now delegates the original call before navigation adaptation when either parameter is absent. The fix adds no key handler, timer, cursor rewrite or fork patch.

Red first: all nine new installed-engine cases fail without this guard. Six exercise `I` on indented plain text, Markdown and blank lines with the navigator active/inactive; three exercise calls missing arguments, state or both. With the guard restored, all 24 installed-engine conceal motion cases pass, including insert keymap/mode events, first-nonblank position and unchanged source.

The shared `conceal-insert` fixture and WDIO spec send physical uppercase keys. In the isolated Windows Obsidian 1.14.5 renderer through CDP, the old production build changes `  alpha beta` to `  alpha bIeta` and leaves column 10, `insert: false`, `keyMap: vim`; the formatted control becomes `  **alphaI beta**`. Both expected insert-entry assertions fail. In the repaired production build, `Shift+I` preserves the complete source and returns column 2, `insert: true`, `keyMap: vim-insert`. Typing `Z` gives `  Zalpha beta` / `  Z**alpha beta**` at column 3. Escape leaves the source intact and returns to normal mode at column 2. Snapshots wait for two animation frames to include deferred host formatting updates; focus emulation and background throttling changes apply only to the isolated test renderer. The WDIO launcher remains unavailable in WSL.

### Audit of other internal callers

The installed fork also calls the same motion with only `cm/head` from `indentAuto`, the linewise case-conversion operator and the linewise ROT13 operator. Four command-level installed-engine cases now run `==`, `gUU`, `g~~` and `g??`. They preserve native source coordinates: `==` leaves `**alpha beta**` at column 0; the other cases retain indentation and syntax, produce uppercase/ROT13 bodies, and leave the cursor at source column 2 in normal mode.

Removing the generic argument/state guard reproduces all four failures (13 failures including the nine insert-entry/partial-call cases); restoring it passes all 28 conceal motion cases. This confirms the previous fix covers these callers, rather than adding another command-specific exception.

The other direct motion calls in this installed fork pass both motion arguments and Vim state: half-page scrolling invokes `moveByDisplayLines` with four arguments, and surround's text-object resolver passes four or five. The optional input snapshot is already guarded in the relevant adapters. Code inspection of the atomic, Chinese-word and table wrappers found no additional missing-argument entry in these current engine paths. This is a bounded audit of the installed engine, not a claim about every future fork version or third-party caller.

## Latency

In the isolated desktop renderer, a 1500-line, 136500-unit document received 300 alternating `h/l` commands per configuration. Timings include synchronous key handling and editor transactions, but not the next paint.

| Setting         | Median | P95     | Maximum |
| --------------- | ------ | ------- | ------- |
| Off             | 9.0 ms | 10.4 ms | 17.6 ms |
| On, insert-only | 9.4 ms | 10.7 ms | 17.9 ms |

This is one local measurement, not a platform-wide latency guarantee. Production limits work to requested/visible lines, bounds cached source to 100000 units and 256 entries, leaves lines above 20000 units native, and scans excluded syntax intervals once instead of comparing every token against every math/code span. Only source reveal has a timer; navigation has no added wait.
