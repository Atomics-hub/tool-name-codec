import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  compileToolNames,
  planToolNameMigration,
  ToolNameCodecError,
  validateWireName,
} from "../src/index.mjs";

function expectCode(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof ToolNameCodecError && error.code === code,
  );
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function base32(bytes) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

test("diagnostics remain safe when hostile values cannot stringify", () => {
  const hostile = {
    toString() {
      throw new Error("hostile coercion");
    },
  };
  assert.throws(
    () => validateWireName("safe", hostile),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "UNKNOWN_PROFILE" &&
      error.message.endsWith("<unprintable>"),
  );
});

test("entry shape and aggregate source limits fail before allocation", () => {
  expectCode(() => compileToolNames([null]), "INVALID_ENTRY");
  expectCode(
    () => compileToolNames([{ id: "x".repeat(1_025), name: "x" }]),
    "ID_TOO_LONG",
  );
  expectCode(
    () => compileToolNames([{ id: "x", name: "" }]),
    "INVALID_SOURCE_NAME",
  );
  expectCode(
    () => compileToolNames([{ id: "x", name: "x", namespace: "" }]),
    "INVALID_NAMESPACE",
  );
  expectCode(
    () =>
      compileToolNames([{ id: "x", name: "x", namespace: "n".repeat(1_025) }]),
    "NAMESPACE_TOO_LONG",
  );
  expectCode(() => compileToolNames("not-an-array"), "INVALID_CATALOG");

  const oversized = Array.from({ length: 1_025 }, (_, index) => ({
    id: String(index),
    name: "x".repeat(4_096),
  }));
  expectCode(() => compileToolNames(oversized), "CATALOG_SOURCE_TOO_LARGE");
});

test("readable allocation reports bounded namespace exhaustion", () => {
  const entry = { id: "exhaust", name: "bad.name" };
  const digest = base32(
    createHash("sha256")
      .update(JSON.stringify([entry.id, null, entry.name]))
      .digest(),
  );
  const reserved = [];
  for (let length = 16; length <= digest.length; length += 2) {
    reserved.push(`bad_name_${digest.slice(0, length)}`);
  }
  expectCode(
    () => compileToolNames([entry], { reserved }),
    "ALIAS_SPACE_EXHAUSTED",
  );
});

test("stateless aliases fail closed on a full-digest conflict", () => {
  const entry = { id: "stable", name: "bad.name" };
  const first = compileToolNames([entry], { allocation: "stable-hash-v1" });
  expectCode(
    () =>
      compileToolNames([entry], {
        allocation: "stable-hash-v1",
        reserved: [first.toWire(entry.id)],
      }),
    "STABLE_ALIAS_CONFLICT",
  );
});

test("manifest top-level limits and reserved-name shape are enforced", () => {
  const valid = compileToolNames([{ id: "a", name: "safe" }]).manifest;

  const tooManyEntries = clone(valid);
  tooManyEntries.entries = Array.from({ length: 25_001 });
  expectCode(
    () => compileToolNames([], { previousManifest: tooManyEntries }),
    "MANIFEST_TOO_LARGE",
  );

  const wrongReservedShape = clone(valid);
  wrongReservedShape.reservedNames = "safe";
  expectCode(
    () => compileToolNames([], { previousManifest: wrongReservedShape }),
    "INVALID_MANIFEST",
  );

  const tooManyReserved = clone(valid);
  tooManyReserved.reservedNames = Array.from({ length: 10_001 }, () => "x");
  expectCode(
    () => compileToolNames([], { previousManifest: tooManyReserved }),
    "MANIFEST_TOO_LARGE",
  );
});

test("corrupted manifest entry forms are rejected independently", () => {
  const original = compileToolNames([{ id: "a", name: "safe" }]).manifest;

  const invalidShape = clone(original);
  invalidShape.entries[0].status = "unknown";
  expectCode(
    () => compileToolNames([], { previousManifest: invalidShape }),
    "INVALID_MANIFEST_ENTRY",
  );

  const invalidSource = clone(original);
  invalidSource.entries[0].sourceName = "";
  expectCode(
    () => compileToolNames([], { previousManifest: invalidSource }),
    "INVALID_MANIFEST_ENTRY",
  );

  const oversizedIdentity = clone(original);
  oversizedIdentity.entries[0].identity = "x".repeat(128);
  expectCode(
    () => compileToolNames([], { previousManifest: oversizedIdentity }),
    "MANIFEST_ENTRY_TOO_LARGE",
  );

  const duplicateId = clone(original);
  duplicateId.entries.push({
    id: "a",
    identity: JSON.stringify([null, "other"]),
    sourceName: "other",
    wireName: "other",
    status: "active",
    changed: false,
    reasons: [],
  });
  expectCode(
    () => compileToolNames([], { previousManifest: duplicateId }),
    "DUPLICATE_MANIFEST_ID",
  );

  const duplicateAlias = clone(original);
  duplicateAlias.entries.push({
    id: "b",
    identity: JSON.stringify([null, "safe"]),
    sourceName: "safe",
    wireName: "safe",
    status: "active",
    changed: false,
    reasons: [],
  });
  expectCode(
    () => compileToolNames([], { previousManifest: duplicateAlias }),
    "DUPLICATE_MANIFEST_ALIAS",
  );

  const invalidAlias = clone(original);
  invalidAlias.entries[0].wireName = "bad.name";
  invalidAlias.entries[0].changed = true;
  expectCode(
    () => compileToolNames([], { previousManifest: invalidAlias }),
    "INVALID_MANIFEST_ALIAS",
  );
});

test("corrupted historical reservations cannot shadow aliases", () => {
  const original = compileToolNames([{ id: "a", name: "safe" }]).manifest;

  const invalidReserved = clone(original);
  invalidReserved.reservedNames = ["bad.name"];
  expectCode(
    () => compileToolNames([], { previousManifest: invalidReserved }),
    "INVALID_MANIFEST_RESERVED_NAME",
  );

  const shadowingReserved = clone(original);
  shadowingReserved.reservedNames = ["safe"];
  expectCode(
    () => compileToolNames([], { previousManifest: shadowingReserved }),
    "MANIFEST_RESERVED_CONFLICT",
  );
});

test("migration bounds and compile conflicts return typed outcomes", () => {
  expectCode(
    () => planToolNameMigration([], [], { allocation: "future" }),
    "UNKNOWN_ALLOCATION",
  );
  expectCode(() => planToolNameMigration("bad", []), "INVALID_MIGRATION_INPUT");
  expectCode(
    () => planToolNameMigration([], Array.from({ length: 25_001 })),
    "MIGRATION_TOO_LARGE",
  );

  const invalidLegacy = planToolNameMigration([], [null]);
  assert.equal(invalidLegacy.ok, false);
  assert.equal(invalidLegacy.conflicts[0].code, "INVALID_ENTRY");

  const oversized = Array.from({ length: 1_025 }, (_, index) => ({
    id: String(index),
    name: "x".repeat(4_096),
    wireName: `w${index}`,
  }));
  expectCode(
    () => planToolNameMigration([], oversized),
    "MIGRATION_SOURCE_TOO_LARGE",
  );

  const reused = planToolNameMigration(
    [{ id: "stable", name: "new-name" }],
    [{ id: "stable", name: "old-name", wireName: "old-name" }],
  );
  assert.equal(reused.ok, false);
  assert.equal(reused.conflicts[0].code, "STABLE_ID_REUSED");
});
