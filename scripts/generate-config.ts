import path from "node:path";

const rootPath = path.resolve(__dirname, "..");

const packageInfoPath = path.resolve(rootPath, "package.json");
const packageInfoFile = Bun.file(packageInfoPath);
const packageInfo = (await packageInfoFile.json()) as { version: string };

await Bun.write(
  path.resolve(rootPath, "src", "config.ts"),
  `// This file is auto-generated. Don't modify it manually
export default {
  version: "${packageInfo.version}",
  debug: false,
  fetchFn: fetch.bind(window),
}`,
);
