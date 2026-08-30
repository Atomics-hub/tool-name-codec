import assert from "node:assert/strict";
import { compileToolNames, validateWireName } from "./src/index.mjs";

let seed = 0x9e3779b9;
function random() {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 0x100000000;
}
const alphabet = "abcXYZ019_-. /:💥é\u0000";
function randomName() {
  const length = 1 + Math.floor(random() * 220);
  let out = "";
  for (let index = 0; index < length; index += 1)
    out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}

let catalogs = 0;
let names = 0;
const started = performance.now();
const rounds = Number.parseInt(process.argv[2] ?? "2000", 10);
if (!Number.isSafeInteger(rounds) || rounds < 1)
  throw new Error("rounds must be a positive integer");
for (let round = 0; round < rounds; round += 1) {
  const size = 1 + Math.floor(random() * 120);
  const entries = Array.from({ length: size }, (_, index) => ({
    id: `round-${round}/tool-${index}`,
    namespace:
      random() < 0.7 ? `server-${Math.floor(random() * 16)}` : undefined,
    name: randomName(),
  }));
  const first = compileToolNames(entries);
  const shuffled = [...entries].sort(() => random() - 0.5);
  const second = compileToolNames(shuffled);
  const aliases = first.tools.map((entry) => entry.wireName);
  assert.equal(new Set(aliases).size, aliases.length);
  for (const entry of entries) {
    const alias = first.toWire(entry.id);
    assert.equal(validateWireName(alias).ok, true);
    assert.equal(second.toWire(entry.id), alias);
    assert.equal(first.fromWire(alias).id, entry.id);
  }

  const keep = entries.filter((_, index) => index % 3 !== 0);
  const oldAliases = new Map(
    keep.map((entry) => [entry.id, first.toWire(entry.id)]),
  );
  const grown = compileToolNames(
    [
      ...keep,
      {
        id: `round-${round}/added`,
        namespace: "new.server",
        name: randomName(),
      },
    ],
    { previousManifest: JSON.parse(JSON.stringify(first.manifest)) },
  );
  for (const entry of keep)
    assert.equal(grown.toWire(entry.id), oldAliases.get(entry.id));
  for (const retired of entries.filter((_, index) => index % 3 === 0)) {
    assert.equal(grown.fromWire(first.toWire(retired.id)), undefined);
    assert.equal(grown.lookupWire(first.toWire(retired.id)).status, "retired");
  }

  const stable = compileToolNames(entries, { allocation: "stable-hash-v1" });
  const stableGrown = compileToolNames(
    [
      ...entries,
      {
        id: `round-${round}/stateless-added`,
        namespace: "new.server",
        name: randomName(),
      },
    ],
    { allocation: "stable-hash-v1" },
  );
  const stableAliases = stable.tools.map((entry) => entry.wireName);
  assert.equal(new Set(stableAliases).size, stableAliases.length);
  for (const entry of entries) {
    const alias = stable.toWire(entry.id);
    assert.equal(validateWireName(alias).ok, true);
    assert.equal(stableGrown.toWire(entry.id), alias);
    assert.equal(stable.fromWire(alias).id, entry.id);
  }
  catalogs += 1;
  names += size;
}
const elapsed = performance.now() - started;
console.log(
  JSON.stringify({
    catalogs,
    names,
    elapsedMs: Math.round(elapsed),
    namesPerSecond: Math.round(names / (elapsed / 1000)),
  }),
);
