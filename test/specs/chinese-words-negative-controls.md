# Chinese word commands: controls and latency

Measured on the integration branch on 2026-11-21. The tests execute the installed registry package (`@saberzero1/codemirror-vim` 6.4.8), not a mocked Vim interpreter. No dependency or fork change is required: host-language support uses `getMotion` / `defineMotion`.

## Functional controls

`npx vitest run test/unit/chinese-words.test.ts` passes 74 tests after restoration. Controls temporarily sabotaged one production module at a time, ran the relevant cases, and restored the module immediately.

| Removed or broken behavior   | Observed failure                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chinese installation         | `w`/`W` land at column **5**, expected **2**. `dw` removes the entire `我们学习中文`, expected remaining `学习中文`; `yw` yanks the whole string, expected `我们`. |
| Native delegation            | English motion/operator results differ from the unmodified engine, including word movement, text and registers.                                                    |
| Motion result                | Returning column **1** breaks counted `2w`/`2W` (expected **4**) and line/EOF/BOF controls.                                                                        |
| Teardown                     | Native `diw` still leaves `学习中文`, expected an empty document after restoring the engine.                                                                       |
| Lazy initialization          | English navigation constructs **1** segmenter, expected **0**.                                                                                                     |
| Cache reuse                  | The same text causes **8** dictionary calls, expected **1**.                                                                                                       |
| LRU eviction                 | Reopening the evicted input makes **65** total dictionary calls, expected **66**.                                                                                  |
| Bounded windows              | The native segmenter receives **100,257** units, expected calls of **257** and **256** units.                                                                      |
| Surrogate-safe window end    | Looking up the Han character spanning offsets 255–257 returns **null**, expected `{ from: 255, to: 257 }`.                                                         |
| Character fallback           | `w` without `Intl.Segmenter` lands at column **5**, expected **2** after a supplementary Han character.                                                            |
| Fresh table wrapper capture  | Two installation generations make **1** dictionary call, expected **2**; both must use their own reader.                                                           |
| Subword integration          | `dw` on `我们学习中文` changes nothing, expected `学习中文`; mixed Latin/Chinese navigation also fails.                                                            |
| Subword `cw` whitespace rule | Remaining text is `学习中文`, expected `  学习中文`. This was observed red before adding the trimming rule.                                                        |
| Visual selection expansion   | Reverse visual selection becomes `学习`, expected `学习中`; forward selection loses its original anchor too.                                                       |

The separate `chinese-words.e2e.ts` spec drives physical keys with WebdriverIO. Locally, an isolated **Windows Obsidian 1.14.5** vault was driven with CDP `Input.dispatchKeyEvent`: all **11** requested sequences passed. Temporarily removing the three navigation wrapper layers made all **11** fail: movement reached column 5, delete/change removed all six characters, and yank copied all six. Restoring the wrappers returned all 11 to green. Direct installed-editor checks additionally verified dot-repeat (`中文`), undo (`学习中文`) a settings reload and Vim disable/enable (column 2), subword `cw` whitespace (`  学习中文`), and reverse visual selection (`学习中`). The full WebdriverIO runner was not used locally because this WSL environment lacks its Linux GUI/Nix dependencies.

## Performance

Reproduce the segmentation benchmark with:

```sh
npx vitest bench test/bench/chinese-words.bench.ts --run
```

For a 100,000-unit line, the local Node benchmark measured a cached boundary lookup at **0.0006 ms mean** and a new segmenter plus a cold cache at **0.1688 ms mean**. These are local observations, not CI timing assertions.

In the isolated Windows Obsidian renderer, 500 invocations of the installed `moveByWords` callback measured:

| Input                                                | First invocation       | Warm p99 |
| ---------------------------------------------------- | ---------------------- | -------- |
| `我们学习中文`                                       | below timer resolution | 0.2 ms   |
| Approximately 100,000 Chinese characters on one line | 0.4 ms                 | 0.1 ms   |
| English, feature installed                           | 0.8 ms                 | 0.3 ms   |
| English baseline                                     | 0.1 ms                 | 0.1 ms   |

The long Chinese line without the feature measured **3.6 ms p50**, **4.8 ms p95**, and **8.0 ms p99** over 100 samples, since the native motion scans the unbroken Han run. Renderer timings have approximately 0.1 ms resolution and cover the synchronous motion callback, **not** input-to-paint latency. No zero-duration claim should be inferred from sub-resolution samples.

The deterministic performance controls are the bounded segment inputs, shared immutable-text cache, lazy constructor and eviction assertions. Timing percentiles remain a benchmark because machine load and timer resolution vary.
