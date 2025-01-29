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
