import { copyFile, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

const common = {
  bundle: true,
  entryPoints: ["src/index.mjs"],
  logLevel: "info",
  platform: "neutral",
  sourcemap: true,
  target: ["es2022"],
};

await Promise.all([
  build({ ...common, format: "esm", outfile: "dist/index.js" }),
  build({ ...common, format: "cjs", outfile: "dist/index.cjs" }),
]);

await Promise.all([
  copyFile("src/index.d.ts", "dist/index.d.ts"),
  copyFile("src/index.d.ts", "dist/index.d.cts"),
]);
