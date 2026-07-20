import path from "node:path";
import { format } from "oxfmt";

const rootPath = path.resolve(__dirname, "..");

const packageInfoPath = path.resolve(rootPath, "package.json");
const packageInfoFile = Bun.file(packageInfoPath);
const packageInfo = (await packageInfoFile.json()) as { version: string };

const CONFIG_PATH = path.resolve(rootPath, "src", "config.ts");
const code = await format(
  CONFIG_PATH,
  `// This file is auto-generated. Don't modify it manually
export default {
  version: "${packageInfo.version}",
  debug: false,
  fetchFn: fetch.bind(window),
};`,
);

await Bun.write(CONFIG_PATH, code.code);
