import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { compileToolNames } from "./src/index.mjs";

const count = 25_000;
const entries = Array.from({ length: count }, (_, index) => {
  const suffix = index.toString(36).padStart(4, "0");
  const sourceName = `source_${suffix}`;
  return {
    id: `id_${suffix}`,
    identity: JSON.stringify([null, sourceName]),
    sourceName,
    wireName: `wire_${suffix}`,
    status: "retired",
    changed: true,
    reasons: [],
  };
});

const previousManifest = {
  schema: "tool-name-codec/1",
  profile: "portable-v1",
  algorithm: "readable-sha256-v1",
  reservedNames: [],
  entries,
};

const before = process.memoryUsage().heapUsed;
const started = performance.now();
const codec = compileToolNames([], { previousManifest });
const elapsedMs = performance.now() - started;
const heapDeltaBytes = process.memoryUsage().heapUsed - before;

assert.equal(codec.manifest.entries.length, count);
assert.equal(codec.tools.length, 0);
assert.equal(codec.lookupWire("wire_0000").id, "id_0000");
assert.equal(
  codec.lookupWire(`wire_${(count - 1).toString(36).padStart(4, "0")}`).status,
  "retired",
);

console.log(JSON.stringify({ count, elapsedMs, heapDeltaBytes }));
