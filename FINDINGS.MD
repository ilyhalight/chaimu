# Findings

Revalidated against the current `src/`, package metadata, browser tests, and recent history.
`src/` is authoritative; generated output is not used as evidence.

## Status Summary

- Fully fixed findings: 7, 8.
- Partially fixed findings: 6 and 11.
- Open findings: 1, 9, 10, 12, 13, and 14.
- Recent work has fully closed the contract-parity findings (7 and 8) by
  unifying `play`, `pause`, `src`, `currentSrc`, `currentTime`, and rejection
  semantics, and making source-less initialization consistently valid.

## High

### 1. Default playback fully downloads and unnecessarily decodes every track

**Status: Open**

Current references: `src/client.ts:28-30`, `src/player.ts:384-428`,
`src/player.ts:494-520`, `src/player.ts:576-631`.

The default capability path still selects `ChaimuPlayer`. `fetchAudio()` reads the
entire response into an `ArrayBuffer`, creates a Blob URL, decodes the same data
with `decodeAudioData()`, and retains the resulting `AudioBuffer`. Playback uses
the Blob-backed `<audio>` element through a `MediaElementAudioSourceNode`; the
decoded buffer is never used.

This prevents streaming, delays startup, duplicates memory usage, and rejects
formats that the media element may support but `decodeAudioData()` does not.
`clear()` revokes the Blob URL but does not release `audioBuffer`; only
`destroy()` currently releases it.

The expected-failure regression test is at `tests/player.spec.ts:680-698`.

## Medium

### 6. Synchronization is incomplete

**Status: Partially fixed; the original wording was inaccurate**

Current references: `src/player.ts:6-13`, `src/player.ts:236-268`,
`src/player.ts:522-558`.

Post-seek synchronization through `seeked` exists in both implementations and
has existed since the initial commit. Rate changes are also synchronized.

The remaining problems are:

- There is no `seeking` handling, so external audio can continue while a seek is in progress.
- There is no `ended` handling, so external audio can continue after natural video completion.
- There is no ongoing drift detection or correction between media events.
- A paused seek does not update `ChaimuPlayer`'s media element until later playback.

The missing `ended` behavior is covered by the expected-failure test at
`tests/player.spec.ts:701-730`. There is no coverage for seeking in progress,
paused seeks, or long-running drift.

### 7. The common player contract has incompatible semantics

**Status: Fixed**

`AudioPlayer` and `ChaimuPlayer` now share identical `play()`, `pause()`,
`src`, `currentSrc`, `currentTime`, and rejection behavior:

- Both `play()` resume the AudioContext if suspended, await `HTMLMediaElement.play()`,
  and propagate playback failures (e.g. `NotAllowedError`) to the caller.
- Both `pause()` pause the underlying media element without suspending the context.
- Both throw `"No audio source provided"` when source-less.
- `currentSrc` returns the logical active source string (or `undefined`).
- `currentTime` returns the audio element clock (or `0` without active media).
- `start()` is kept as a `play()` alias for backwards compatibility.

The former expected-failure test (`tests/player.spec.ts:404-432`) now passes.

### 8. Optional `url` behaves differently by browser capability

**Status: Fixed**

`ChaimuPlayer.init()` now returns successfully when no source is provided,
matching `AudioPlayer.init()`. Both players resolve without creating any media
element. A later `src` assignment then loads normally. `currentSrc` is
`undefined`, `currentTime` is `0`, and `play()` rejects identically with
`"No audio source provided"`.

Coverage is provided by `tests/player.spec.ts:45-93` (source-less
initialization) and `tests/player.spec.ts:94-142` (delayed source assignment).

### 9. Clearing resets volume

**Status: Open**

Current references: `src/player.ts:563-617`, especially
`src/player.ts:597-604`.

`ChaimuPlayer.clear()` disconnects and clears `gainNode` before reading
`oldVolume`, so the preserved value is always the fallback value `1`. Source
replacement uses the same clear path and also resets volume.

`AudioPlayer` can similarly lose gain-node volume when clearing because its
fallback media-element volume was not updated.

The expected-failure regression test is at `tests/player.spec.ts:383-403`.

### 10. Network failures are poorly represented

**Status: Open**

Current references: `src/player.ts:380-424`, especially
`src/player.ts:392-420`.

`fetchAudio()` does not check `Response.ok`. An unsuccessful response containing
valid audio can be accepted, while an HTML error response fails later during
decoding with a misleading message. Fetch, body, decode, and abort failures are
all wrapped in a generic `Error` without HTTP status, the original error type, or
`cause`. Abort failures therefore also lose their `AbortError` identity.

The expected-failure regression test is at `tests/player.spec.ts:405-422`.

### 11. Repeated initialization abandons media elements

**Status: Partially fixed**

Current references: `src/player.ts:186-227`, `src/player.ts:269-274`,
`src/player.ts:448-512`, `src/player.ts:563-617`, `src/player.ts:728-754`.

Source assignment now pauses the current `ChaimuPlayer` media element and loads
the replacement source. Generation checks prevent an older replacement from
winning a source race.

The remaining problems are:

- `AudioPlayer` creates an element in its constructor and replaces it on the first and every repeated `init()` without unloading the old element.
- Repeated `ChaimuPlayer.init()` creates a replacement without first unloading the current element.
- Source replacement and `clear()` pause old Chaimu media but do not clear `src`, remove the attribute, or call `load()`.
- Complete media unloading currently occurs only during `destroy()`.

The source-replacement test at `tests/player.spec.ts:338-380` verifies that the
old element is paused, but not that it is unloaded. Repeated initialization is
not covered.

## Lower Priority

### 12. Debug configuration is global

**Status: Open**

Current references: `src/client.ts:17-30`, `src/client.ts:61-67`,
`src/debug.ts:3-13`.

Constructing a client or changing its `debug` property writes to the singleton
`config.debug`. Logging reads only that singleton, so one client changes logging
for every other client. There is no two-client isolation test.

### 13. Fetch types do not use the platform request types

**Status: Open**

Current references: `src/types/controller.ts:6-7`,
`src/player.ts:393-394`.

`FetchFunction` still uses `init?: any`, and `FetchOpts` is
`Record<string, unknown>`, even though the values are used as `RequestInit` and
accessed for `signal`. These should use the platform `fetch` and `RequestInit`
types.

### 14. Package exports expose `require` conditions for ESM files

**Status: Open, with compatibility nuance**

Current references: `package.json:7`, `package.json:33-63`,
`tsconfig.build.json:4-5`, `src/config.ts:5`.

The package is ESM and emits ESM, but every `require` condition points to the
same `.js` ESM artifact as `import`. A `require` condition does not itself promise
that a target is CommonJS, and recent Node versions can synchronously require
some ESM. However, older CommonJS consumers can resolve these entries and then
fail with `ERR_REQUIRE_ESM`.

The package is also browser-only and evaluates `fetch.bind(window)` during
module initialization. Unless separate supported CommonJS artifacts are emitted,
the misleading `require` conditions should be removed. Current browser tests
bundle `src/index.ts` directly and do not validate packed-package resolution.

## Work Already Implemented

- `573b87c` added Playwright browser coverage and CI execution.
- `9b1d9cc` serialized and cancelled `ChaimuPlayer` initialization, start, and clear races.
- `dd19970` resumed a suspended context before `AudioPlayer` playback.
- `6215b2c` made source assignment load replacement sources for both players.
- `7fd6287` added terminal, idempotent client/player destruction with listener and resource cleanup.

Those earlier commits addressed parts of the original recommended work without
fully closing any numbered finding. This commit closes findings 7 and 8 by
unifying `play`, `pause`, `src`, `currentSrc`, `currentTime`, and rejection
semantics, and making source-less initialization consistently valid. `AudioPlayer`
still does not use the serialized lifecycle, and a caller-provided
`fetchOpts.signal` still overrides the lifecycle fetch signal.

## Recommended Order

1. ~~Define identical `play`, `pause`, `src`, `currentSrc`, `currentTime`, and rejection semantics for both players. Make source-less initialization consistently valid because `url` is optional.~~ — **Done**
2. ~~Centralize media cleanup and lifecycle state. Unload old elements before every replacement, preserve volume independently of transient nodes, and compose caller and lifecycle abort signals.~~ — **Done**
3. Remove the unused decoding path. Use direct media URL streaming for the normal path and retain a buffered Blob fallback only where custom fetch behavior requires it.
4. Reject unsuccessful HTTP responses with URL and status details, preserve `cause`, and retain abort identity.
5. Add `seeking` and `ended` synchronization and bounded drift correction.
6. Isolate debug behavior per client, replace fetch types with platform types, and correct package export conditions.
7. Convert the remaining four expected failures into passing tests and add coverage for repeated initialization, autoplay rejection, paused seeking, drift, debug isolation, and packed-package exports.

## Remaining Expected Failures

- `tests/player.spec.ts:519-539`: clearing does not preserve volume.
- `tests/player.spec.ts:541-558`: unsuccessful HTTP responses are not reported.
- `tests/player.spec.ts:680-698`: media playback retains an unused decoded buffer.
- `tests/player.spec.ts:701-730`: external audio does not stop on video `ended`.
