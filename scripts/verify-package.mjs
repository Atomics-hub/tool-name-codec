import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
assert.equal(metadata.name, "tool-name-codec");
assert.equal(metadata.sideEffects, false);
assert.deepEqual(metadata.files, [
  "dist",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
]);

const temporary = await mkdtemp(join(tmpdir(), "tool-name-codec-package-"));
const consumer = join(temporary, "consumer");

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: resolve(root, ".npm-cache"),
    },
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`${command} exited with ${result.status}`);
  }
  return result.stdout;
}

try {
  const packed = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", temporary]),
  )[0];
  assert.equal(packed.name, "tool-name-codec");
  assert.ok(
    packed.size < 60_000,
    `tarball is unexpectedly large: ${packed.size}`,
  );
  assert.ok(
    packed.files.every(
      ({ path }) =>
        path.startsWith("dist/") ||
        ["package.json", "README.md", "LICENSE", "CHANGELOG.md"].includes(path),
    ),
    "tarball contains an unexpected file",
  );

  await mkdir(consumer);
  await writeFile(
    join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporary, packed.filename),
    ],
    { cwd: consumer },
  );

  const smoke = `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    import * as esm from "tool-name-codec";
    const require = createRequire(import.meta.url);
    const cjs = require("tool-name-codec");
    for (const implementation of [esm, cjs]) {
      const catalog = implementation.compileToolNames([
        { id: "github/search", namespace: "github.com", name: "search.code" },
        { id: "gitlab/search", namespace: "gitlab.com", name: "search/code" },
      ]);
      assert.equal(catalog.tools.length, 2);
      assert.equal(new Set(catalog.tools.map((tool) => tool.wireName)).size, 2);
      for (const tool of catalog.tools) {
        assert.equal(catalog.fromWire(tool.wireName)?.id, tool.id);
      }
    }
  `;
  run(process.execPath, ["--input-type=module", "--eval", smoke], {
    cwd: consumer,
  });
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log("installed-tarball ESM/CommonJS smoke passed");
