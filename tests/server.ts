function createWave() {
  const sampleRate = 8_000;
  const samples = sampleRate * 2;
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples * bytesPerSample);
  const view = new DataView(buffer);

  function writeText(offset: number, text: string) {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  }

  writeText(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples * bytesPerSample, true);

  return buffer;
}

const build = await Bun.build({
  entrypoints: ["./src/index.ts"],
  format: "esm",
  target: "browser",
});

if (!build.success) {
  throw new AggregateError(build.logs, "Failed to build the browser test bundle");
}

const bundle = await build.outputs[0].text();
const wave = createWave();
const waveBytes = new Uint8Array(wave);
const port = Number(process.argv[2] ?? 4173);

Bun.serve({
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/chaimu.js") {
      return new Response(bundle, {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }

    if (url.pathname === "/audio.wav" || url.pathname === "/missing.wav") {
      const headers = new Headers({
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "audio/wav",
      });
      const range = request.headers.get("range")?.match(/^bytes=(\d+)-(\d*)$/);

      if (range && url.pathname === "/audio.wav") {
        const start = Number(range[1]);
        const end = range[2] ? Number(range[2]) : waveBytes.byteLength - 1;
        const body = waveBytes.slice(start, end + 1);
        headers.set("Content-Length", String(body.byteLength));
        headers.set("Content-Range", `bytes ${start}-${end}/${waveBytes.byteLength}`);
        return new Response(body, { headers, status: 206 });
      }

      headers.set("Content-Length", String(waveBytes.byteLength));
      return new Response(wave.slice(0), {
        headers,
        status: url.pathname === "/missing.wav" ? 404 : 200,
      });
    }

    if (url.pathname === "/") {
      return new Response(
        `<!doctype html>
<html>
  <body>
    <video id="video"></video>
    <button id="activate" type="button">Activate audio</button>
    <script type="module">
      import * as chaimuModule from "/chaimu.js";
      window.chaimuModule = chaimuModule;
      document.documentElement.dataset.ready = "true";
    </script>
  </body>
</html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response("Not found", { status: 404 });
  },
  hostname: "127.0.0.1",
  port,
});
