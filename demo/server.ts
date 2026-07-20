const port = Number(process.argv[2] ?? 4174);
const build = await Bun.build({
  entrypoints: [`${import.meta.dir}/main.ts`],
  format: "esm",
  target: "browser",
  sourcemap: "inline",
});

if (!build.success) {
  throw new AggregateError(build.logs, "Failed to build the Chaimu demo");
}

const demoBundle = await build.outputs[0].text();
const index = Bun.file(`${import.meta.dir}/index.html`);
const styles = Bun.file(`${import.meta.dir}/styles.css`);

Bun.serve({
  fetch(request) {
    const { pathname } = new URL(request.url);

    if (pathname === "/" || pathname === "/index.html") {
      return new Response(index, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    if (pathname === "/styles.css") {
      return new Response(styles, {
        headers: { "Content-Type": "text/css; charset=utf-8" },
      });
    }
    if (pathname === "/demo.js") {
      return new Response(demoBundle, {
        headers: { "Content-Type": "text/javascript; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
  hostname: "127.0.0.1",
  port,
});

console.log(`Chaimu demo running at http://127.0.0.1:${port}`);

export {};
