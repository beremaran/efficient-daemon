import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg) throw new Error("usage: sanitize-wasm.mjs input.wasm [output.wasm]");

const input = resolve(inputArg);
const output = resolve(outputArg ?? input);
const optimized = `${output}.wasm-opt.tmp`;
execFileSync("wasm-opt", [input, "--strip-debug", "-o", optimized], { stdio: "inherit" });

try {
  const wasm = readFileSync(optimized);
  if (!wasm.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) {
    throw new Error(`${inputArg} is not a WebAssembly binary`);
  }

  let redacted = 0;
  const prefixes = ["/Users/", "/home/", "/private/var/", "C:\\Users\\", "C:/Users/"];
  // ponytail: replace only known absolute path strings in place to preserve WASM offsets; add a prefix here if a future toolchain embeds another local root.
  for (const prefix of prefixes) {
    const needle = Buffer.from(prefix);
    let start = wasm.indexOf(needle);
    while (start !== -1) {
      const end = wasm.indexOf(0, start);
      if (end === -1 || end - start > 4096) throw new Error("unterminated source path in WebAssembly data");
      const replacement = Buffer.from("redacted");
      replacement.copy(wasm, start, 0, Math.min(replacement.length, end - start));
      wasm.fill(0x20, start + Math.min(replacement.length, end - start), end);
      redacted++;
      start = wasm.indexOf(needle, end + 1);
    }
  }

  if (prefixes.some((prefix) => wasm.includes(Buffer.from(prefix)))) {
    throw new Error("absolute source path remains in WebAssembly output");
  }
  new WebAssembly.Module(wasm);
  writeFileSync(output, wasm);
  if (redacted) process.stdout.write(`Removed ${redacted} embedded source paths from the WebAssembly bundle\n`);
} finally {
  rmSync(optimized, { force: true });
}
