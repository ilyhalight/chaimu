<h1 align="center">Chaimu</h1>

<div align="center">

Chaimu is an audio player that synchronizes audio with video.

[![NPM version][npm-image]][npm-url]
[![Build status][ci-image]][ci-url]
[![Downloads][jsdelivr-image]][jsdelivr-url]
[![ru][readme-ru-url]](README-RU.md)
[![en][readme-en-url]](README.md)

</div>

[npm-image]: https://img.shields.io/npm/v/chaimu?style=flat-square
[npm-url]: https://npmjs.org/package/chaimu
[jsdelivr-image]: https://img.shields.io/jsdelivr/npm/hm/chaimu?style=flat-square
[jsdelivr-url]: https://www.jsdelivr.com/package/npm/chaimu
[ci-image]: https://img.shields.io/github/actions/workflow/status/ilyhalight/chaimu/build.yml?branch=master&style=flat-square
[ci-url]: https://github.com/ilyhalight/chaimu/actions/workflows/build.yml
[readme-ru-url]: https://img.shields.io/badge/%D1%8F%D0%B7%D1%8B%D0%BA-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%20%F0%9F%87%B7%F0%9F%87%BA-white
[readme-en-url]: https://img.shields.io/badge/lang-English%20%F0%9F%87%AC%F0%9F%87%A7-white

<img src="./images/demo.png" style="width:100%">

## Usage

```js
import Chaimu from "chaimu";

const videoEl = document.querySelector("video");
const chaimu = new Chaimu({
  url: "https://s3.toil.cc/vot/translated.mp3",
  video: videoEl,
});
await chaimu.init();
```

This links the external audio to the video. Playback, seeking, and speed changes are synchronized from the video element.

When the browser supports the Web Audio API, Chaimu selects `ChaimuPlayer`; otherwise, it falls back to `AudioPlayer`. To always use `AudioPlayer`, set `preferAudio`:

```js
const chaimu = new Chaimu({
  url: "https://s3.toil.cc/vot/translated.mp3",
  video: videoEl,
  preferAudio: true,
});
await chaimu.init();
```

The initial `url` is optional. You can initialize Chaimu first and assign a source later:

```js
const chaimu = new Chaimu({ video: videoEl });
await chaimu.init();

chaimu.player.src = "https://s3.toil.cc/vot/translated.mp3";
```

Use `replaceVideo()` when switching video elements. It keeps the current player, audio source, volume, and `AudioContext`:

```js
await chaimu.replaceVideo(nextVideoEl);
```

Call `destroy()` when Chaimu is no longer needed. Destruction is permanent for that instance:

```js
await chaimu.destroy();
```

## Demo

[Demo website](https://chaimu.toil.cc/)

Run the demo page against the current source checkout:

```bash
bun run demo
```

Then open `http://127.0.0.1:4174`.

## Install

Installation via Bun:

```bash
bun add chaimu
```

Installation via NPM:

```bash
npm install chaimu
```

## Build

To build, you must have:

- [Bun](https://bun.sh/)

Don't forget to install the dependencies:

```bash
bun install
```

Run the build:

```bash
bun run build:bun
```
