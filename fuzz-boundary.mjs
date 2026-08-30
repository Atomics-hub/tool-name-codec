import assert from "node:assert/strict";
import {
  compileToolNames,
  planToolNameMigration,
  ToolNameCodecError,
  validateWireName,
} from "./src/index.mjs";

let state = 0x5eedc0de;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x1_0000_0000;
}

function pick(values) {
  return values[Math.floor(random() * values.length)];
}

function text() {
  const alphabet = [
    "a",
    "Z",
    "0",
    "_",
    "-",
    ".",
    "/",
    " ",
    "\0",
    "\n",
    "\u001b",
    "💣",
    "é",
  ];
  return Array.from({ length: Math.floor(random() * 20) }, () =>
    pick(alphabet),
  ).join("");
}

function value(depth = 0) {
  const leaves = [
    null,
    undefined,
    true,
    false,
    0,
    -1,
    1.5,
    Number.NaN,
    text(),
    1n,
    Symbol("fuzz"),
  ];
  if (depth >= 3 || random() < 0.6) return pick(leaves);
  if (random() < 0.5) {
    return Array.from({ length: Math.floor(random() * 6) }, () =>
      value(depth + 1),
    );
  }
  const object = {};
  for (let index = 0; index < Math.floor(random() * 6); index += 1)
    object[text()] = value(depth + 1);
  return object;
}

function acceptOrTypedError(operation) {
  try {
    operation();
  } catch (error) {
    assert.equal(
      error instanceof ToolNameCodecError,
      true,
      `Unexpected ${error?.constructor?.name}: ${error?.message}`,
    );
  }
}

for (let iteration = 0; iteration < 25_000; iteration += 1) {
  const a = value();
  const b = value();
  const c = value();
  acceptOrTypedError(() => validateWireName(a, b));
  acceptOrTypedError(() => compileToolNames(a, b));
  acceptOrTypedError(() => planToolNameMigration(a, b, c));
}

console.log(
  JSON.stringify({ iterations: 25_000, calls: 75_000, unexpectedErrors: 0 }),
);
