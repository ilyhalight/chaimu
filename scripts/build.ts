await Bun.build({
  entrypoints: ["./src/index.ts"],
  outdir: "./",
  naming: "[dir]/[name].min.[ext]",
  minify: true,
});
