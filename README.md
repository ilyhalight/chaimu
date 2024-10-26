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
[ci-image]: https://img.shields.io/github/actions/workflow/status/ilyhalight/chaimu/ci.yml?branch=master&style=flat-square
[ci-url]: https://github.com/ilyhalight/chaimu/actions/workflows/ci.yml
[readme-ru-url]: https://img.shields.io/badge/%D1%8F%D0%B7%D1%8B%D0%BA-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9%20%F0%9F%87%B7%F0%9F%87%BA-white
[readme-en-url]: https://img.shields.io/badge/lang-English%20%F0%9F%87%AC%F0%9F%87%A7-white

<img src="./images/demo.png" style="width:100%">

## Usage example

A simple usage example:

```js
import Chaimu from "chaimu";

const videoEl = document.querySelector("video");
const chaimu = new Chaimu({
  url: "https://s3.toil.cc/vot/translated.mp3",
  video: videoEl,
});
await chaimu.init();
```

Using this code, you will link the video to the audio.

If AudioContext is reached, you will be able to use advanced audio volume control.

If you want to use a classic player (via audio element), specify `preferAudio` param:

```js
...
const chaimu = new Chaimu({
  ...
  preferAudio: true
});
```

## Demo

[Demo website](https://chaimu.toil.cc/)

## Install

Installation via Bun:

```bash
bun add vot.js
```

Installation via NPM:

```bash
npm install vot.js
```

## Build

To build, you must have:

- [Bun](https://bun.sh/)

Don't forget to install the dependencies:

```bash
bun install
```

Run build:

```bash
bun build:bun
```
