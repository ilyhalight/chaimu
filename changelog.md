# 1.1.0

> Most of the work in this release was done with help from AI agents.

## Lib

- Added `Chaimu.replaceVideo()` for switching to another video element without recreating the audio player or losing its source, volume, and `AudioContext`.
- `AudioPlayer` and `ChaimuPlayer` now behave the same when playing, pausing, reporting the current source and time, or handling playback errors.
- Chaimu can now be initialized without an audio source. A source assigned later through `player.src` will load normally.
- Replacing a source or initializing again now cleans up the old media while keeping the current volume and playback rate. Older source requests can no longer overwrite newer ones.
- `destroy()` can safely be called more than once. After destruction, pending work is cancelled, listeners are removed, resources are released, and the client cannot be started again.
- Initialization, playback, source changes, video replacement, and cleanup now run in order instead of racing each other.
- Audio synchronization now handles buffering, completed seeks, loops, the end of playback, and speed changes made by external scripts. Audio resumes on `playing` and pauses on `waiting` or `ended`.

## Workspace

- Added Playwright browser tests for both player implementations and set them up to run in CI with Chromium.
- Added a video-element demo with custom controls and synchronization details.
- Added notes about the project structure and the issues found during the player review.
- Limited package builds to source files and included the browser tests and demo in lint checks.

# 1.0.6

- Set url as optional parameter for Chaimu client

# 1.0.5

## Lib

- Fixed sound distortion (in #57)

## Workspace

- Bump depends

# 1.0.4

## Lib

- Added new exports
- Added option to set custom fetch options
- Now BasePlayer and his children don't use fetchFn from config. Instead, they use fetchFn from main Chaimu class

## Workspace

- Added pretty-quick on pre-commit
- Fixed name on README
- Changed outdir for minified version
- Removed build minified by default
- Removed dist and docs
- Updated dev depends

# 1.0.3

- Added repeated Audio initialization in init function of AudioPlayer to fix stuck during reinitialization
- Removed sonarjs plugin

# 1.0.2

- Fix get/set src for AudioPlayer

# 1.0.1

- Added disconnect gainNode before initAudioBooster if exists
- Now ChaimuPlayer currentSrc is equal `_src` to compatibility with AudioPlayer

# 1.0.0

- Initial release
