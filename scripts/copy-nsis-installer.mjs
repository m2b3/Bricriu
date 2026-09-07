import { copyFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(repoRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const installerName = `${tauriConfig.productName}_${tauriConfig.version}_x64-setup.exe`;
const source = path.join(
  repoRoot,
  "src-tauri",
  "target",
  "release",
  "bundle",
  "nsis",
  installerName,
);
const destination = path.join(repoRoot, installerName);

await copyFile(source, destination);
console.log(`Copied installer to ${destination}`);
