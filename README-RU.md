<h1 align="center">Chaimu</h1>

<div align="center">

Chaimu - это аудиоплеер, который синхронизирует аудио с видео.

[![NPM version][npm-image]][npm-url]
[![Build status][ci-image]][ci-url]
[![Downloads][jsdelivr-image]][jsdelivr-url]
[![en][readme-en-url]](README.md)
[![ru][readme-ru-url]](README-RU.md)

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

## Пример использования

Простой пример использования:

```js
import Chaimu from "chaimu";

const videoEl = document.querySelector("video");
const chaimu = new Chaimu({
  url: "https://s3.toil.cc/vot/translated.mp3",
  video: videoEl,
});
await chaimu.init();
```

Используя этот код, вы свяжете видео с аудио.

Если AudiContext существует, вы сможете использовать расширенную настройку громкости звука.

Если вы хотите использовать классический проигрыватель (через audio элемент), укажите параметр `preferAudio`:

```js
...
const chaimu = new Chaimu({
  ...
  preferAudio: true
});
```

## Демо

[Demo](https://chaimu.toil.cc/)

## Установка

Установка с помощью Bun:

```bash
bun add vot.js
```

Установка с помощью NPM:

```bash
npm install vot.js
```

## Сборка

Чтобы собрать, у вас должно быть:

- [Bun](https://bun.sh/)

Не забудьте установить зависимости:

```bash
bun install
```

Запустите сборку:

```bash
bun build:bun
```
