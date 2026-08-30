import assert from "node:assert/strict";
import {
  compileToolNames,
  getProfile,
  validateWireName,
} from "./src/index.mjs";

let state = 0x7e57c0de;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x1_0000_0000;
}

function token(length = 12) {
  const alphabet = "abcXYZ019_-. /:\0\ud800\udfff";
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += alphabet[Math.floor(random() * alphabet.length)];
  }
  return out;
}

let attemptedMutations = 0;
for (let iteration = 0; iteration < 10_000; iteration += 1) {
  const first = {
    id: `a-${iteration}-${token(4)}`,
    namespace: token(5),
    name: token(),
  };
  const second = {
    id: `b-${iteration}-${token(4)}`,
    namespace: token(5),
    name: token(),
  };
  const catalog = compileToolNames([first, second], {
    allocation: iteration % 2 === 0 ? "readable-v1" : "stable-hash-v1",
    reserved: ["tool_search"],
  });
  const before = JSON.stringify(catalog.manifest);
  const alias = catalog.toWire(first.id);
  const entry = catalog.fromWire(alias);

  const mutations = [
    () => {
      catalog.manifest.profile = "openai-v1";
    },
    () => {
      catalog.manifest.entries.push({});
    },
    () => {
      catalog.manifest.entries[0].wireName = "poisoned";
    },
    () => {
      catalog.manifest.entries[0].reasons.push("poisoned");
    },
    () => {
      catalog.manifest.reservedNames.push("poisoned");
    },
    () => {
      catalog.tools.pop();
    },
    () => {
      entry.status = "retired";
    },
  ];
  for (const mutate of mutations) {
    attemptedMutations += 1;
    assert.throws(mutate, TypeError);
  }

  assert.equal(JSON.stringify(catalog.manifest), before);
  assert.equal(catalog.toWire(first.id), alias);
  assert.equal(catalog.fromWire(alias)?.id, first.id);
  assert.equal(validateWireName(alias).ok, true);
}

const metadata = getProfile("portable-v1");
assert.throws(() => {
  metadata.pattern = ".*";
}, TypeError);
const callerRegex = new RegExp(metadata.pattern);
Object.freeze(callerRegex);
assert.throws(() => callerRegex.compile(".*"), TypeError);
assert.equal(validateWireName("bad.name").ok, false);

console.log(
  JSON.stringify({
    iterations: 10_000,
    attemptedMutations,
    sharedValidatorPoisoned: false,
  }),
);
