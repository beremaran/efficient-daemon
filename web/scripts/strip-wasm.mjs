import { execFileSync } from "node:child_process";
import { copyFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const assetsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../internal/workbench/dist/assets");
const distDir = resolve(assetsDir, "..");
const wasmFiles = readdirSync(assetsDir).filter((file) => file.endsWith(".wasm"));

if (wasmFiles.length === 0) throw new Error(`no WebAssembly files found in ${assetsDir}`);

for (const file of wasmFiles) {
  const input = resolve(assetsDir, file);
  execFileSync(process.execPath, [resolve(dirname(fileURLToPath(import.meta.url)), "sanitize-wasm.mjs"), input], {
    stdio: "inherit",
  });
}

copyFileSync(resolve(distDir, "../../../THIRD_PARTY_NOTICES.md"), resolve(distDir, "THIRD_PARTY_NOTICES.md"));
