import fs from "node:fs/promises";

await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./dist",
  naming: "[dir]/[name].min.[ext]",
  minify: true,
});

await fs.copyFile("./dist/index.d.ts", "./dist/index.min.d.ts");
