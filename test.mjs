import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  compileToolNames,
  getProfile,
  planToolNameMigration,
  ToolNameCodecError,
  validateWireName,
} from "./src/index.mjs";

test("preserves a legal unique source name", () => {
  const result = compileToolNames([{ id: "weather", name: "get_weather" }]);
  assert.equal(result.toWire("weather"), "get_weather");
  assert.equal(result.fromWire("get_weather").sourceName, "get_weather");
});

test("normalizes forbidden characters and retains an exact reverse map", () => {
  const result = compileToolNames([
    {
      id: "pubmed",
      namespace: "bio.server",
      name: "literature.search/pub med",
    },
  ]);
  const alias = result.toWire("pubmed");
  assert.equal(validateWireName(alias).ok, true);
  assert.equal(alias.length <= 64, true);
  assert.equal(result.fromWire(alias).sourceName, "literature.search/pub med");
  assert.equal(result.fromWire(alias).namespace, "bio.server");
});

test("colliding sanitized names receive unique deterministic aliases", () => {
  const entries = [
    { id: "dot", name: "a.b" },
    { id: "slash", name: "a/b" },
    { id: "space", name: "a b" },
  ];
  const forward = compileToolNames(entries);
  const reverse = compileToolNames([...entries].reverse());
  assert.deepEqual(
    Object.fromEntries(entries.map(({ id }) => [id, forward.toWire(id)])),
    Object.fromEntries(entries.map(({ id }) => [id, reverse.toWire(id)])),
  );
  assert.equal(new Set(forward.tools.map((entry) => entry.wireName)).size, 3);
});

test("a previous manifest prevents catalog-growth churn", () => {
  const initial = compileToolNames([{ id: "original", name: "safe_name" }]);
  const expanded = compileToolNames(
    [
      { id: "original", name: "safe_name" },
      { id: "new", namespace: "x", name: "safe_name" },
      { id: "other", name: "safe.name" },
    ],
    { previousManifest: initial.manifest },
  );
  assert.equal(expanded.toWire("original"), "safe_name");
});

test("stable-hash allocation is catalog-growth-stable without prior state", () => {
  const original = {
    id: "server-a/search",
    namespace: "server-a",
    name: "search",
  };
  const first = compileToolNames([original], { allocation: "stable-hash-v1" });
  const expanded = compileToolNames(
    [
      { id: "server-b/search", namespace: "server-b", name: "search" },
      original,
      { id: "server-c/search", namespace: "server-c", name: "search" },
    ],
    { allocation: "stable-hash-v1" },
  );
  assert.equal(expanded.toWire(original.id), first.toWire(original.id));
  assert.equal(first.toWire(original.id).length, 64);
  assert.equal(first.manifest.algorithm, "stable-sha256-v1");
  assert.equal(first.tools[0].reasons.includes("stateless-stability"), true);
});

test("allocation algorithms cannot silently change across manifests", () => {
  const readable = compileToolNames([{ id: "x", name: "search" }]);
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "search" }], {
        allocation: "stable-hash-v1",
        previousManifest: readable.manifest,
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "ALGORITHM_MISMATCH",
  );
  assert.throws(
    () => compileToolNames([], { allocation: "future-v2" }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "UNKNOWN_ALLOCATION",
  );
});

test("retired aliases are tombstoned and cannot be reassigned", () => {
  const initial = compileToolNames([{ id: "old", name: "search" }]);
  const removed = compileToolNames([], { previousManifest: initial.manifest });
  assert.equal(removed.fromWire("search"), undefined);
  assert.equal(removed.lookupWire("search").status, "retired");
  const replacement = compileToolNames([{ id: "new", name: "search" }], {
    previousManifest: removed.manifest,
  });
  assert.notEqual(replacement.toWire("new"), "search");
  assert.equal(replacement.fromWire("search"), undefined);
  assert.equal(replacement.lookupWire("search").id, "old");
});

test("stable ids cannot silently change semantic identity", () => {
  const initial = compileToolNames([{ id: "billing.charge", name: "charge" }]);
  assert.throws(
    () =>
      compileToolNames([{ id: "billing.charge", name: "refund" }], {
        previousManifest: initial.manifest,
      }),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "STABLE_ID_REUSED",
  );
});

test("profiles encode real provider differences", () => {
  assert.equal(
    validateWireName("admin_tools-list", "gemini-api-2026-08").ok,
    true,
  );
  assert.equal(
    validateWireName("admin.tools:list", "gemini-api-2026-08").ok,
    false,
  );
  assert.equal(
    validateWireName("admin.tools-list", "vertex-gemini-2026-08").ok,
    true,
  );
  assert.equal(
    validateWireName("admin.tools:list", "vertex-gemini-2026-08").ok,
    false,
  );
  assert.equal(
    validateWireName("a".repeat(65), "vertex-gemini-2026-08").ok,
    false,
  );
  assert.equal(
    validateWireName("a".repeat(128), "gemini-api-2026-08").ok,
    true,
  );
  assert.equal(validateWireName("admin.tools:list", "anthropic-v1").ok, false);
  assert.equal(validateWireName("1starts_with_digit", "portable-v1").ok, false);
  assert.equal(validateWireName("1starts_with_digit", "openai-v1").ok, true);
  assert.equal(validateWireName("a".repeat(128), "mcp-2025-11-25").ok, true);
  assert.equal(
    validateWireName("admin.tools-list_2", "mcp-2026-07-28").ok,
    true,
  );
  assert.equal(validateWireName("bad/name", "mcp-2026-07-28").ok, false);
});

test("profile lookup rejects inherited object keys with a typed error", () => {
  for (const profile of ["__proto__", "constructor", "toString"]) {
    assert.throws(
      () => validateWireName("safe_name", profile),
      (error) =>
        error instanceof ToolNameCodecError && error.code === "UNKNOWN_PROFILE",
    );
  }
  assert.throws(
    () => validateWireName("safe_name", Symbol("profile")),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "UNKNOWN_PROFILE",
  );
  assert.throws(
    () => compileToolNames([], { allocation: Symbol("allocation") }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "UNKNOWN_ALLOCATION",
  );
});

test("public profile metadata cannot mutate shared validation regexes", () => {
  const profile = getProfile("portable-v1");
  assert.deepEqual(Object.keys(profile), [
    "id",
    "maxLength",
    "pattern",
    "firstPattern",
  ]);
  assert.equal(typeof profile.pattern, "string");
  assert.equal(validateWireName("bad.name", "portable-v1").ok, false);

  const callerRegex = new RegExp(profile.pattern);
  Object.freeze(callerRegex);
  assert.throws(() => callerRegex.compile(".*"), TypeError);
  assert.equal(callerRegex.source, ".*");
  assert.equal(validateWireName("bad.name", "portable-v1").ok, false);
});

test("public lookup diagnostics escape hostile control characters", () => {
  const codec = compileToolNames([{ id: "safe", name: "safe" }]);
  assert.throws(
    () => codec.toWire("missing\u001b[2J\nforged"),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "UNKNOWN_ACTIVE_ID" &&
      !error.message.includes("\u001b") &&
      !error.message.includes("\n"),
  );
});

test("rejects duplicate ids, malformed manifests, invalid reserved names, and profile drift", () => {
  assert.throws(
    () => compileToolNames([], null),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "INVALID_OPTIONS",
  );
  assert.throws(
    () =>
      compileToolNames([
        { id: "x", name: "a" },
        { id: "x", name: "b" },
      ]),
    /repeats stable id/,
  );
  assert.throws(
    () => compileToolNames([], { previousManifest: {} }),
    /tool-name-codec\/1/,
  );
  assert.throws(
    () => compileToolNames([], { reserved: "tool_search" }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_RESERVED_NAMES",
  );
  assert.throws(
    () => compileToolNames([], { reserved: ["bad.name"] }),
    /reserved name/,
  );
  assert.throws(
    () =>
      compileToolNames([], {
        reserved: Array.from({ length: 10_001 }, () => "x"),
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "TOO_MANY_RESERVED_NAMES",
  );
  const initial = compileToolNames([{ id: "x", name: "x" }]);
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "x" }], {
        profile: "gemini-api-2026-08",
        previousManifest: initial.manifest,
      }),
    (error) => error.code === "PROFILE_MISMATCH",
  );
});

test("manifest JSON round-trip preserves behavior", () => {
  const first = compileToolNames([
    { id: "x", namespace: "srv", name: "bad.name" },
  ]);
  const json = JSON.parse(JSON.stringify(first.manifest));
  const second = compileToolNames(
    [{ id: "x", namespace: "srv", name: "bad.name" }],
    { previousManifest: json },
  );
  assert.equal(second.toWire("x"), first.toWire("x"));
});

test("manifest entries are canonicalized and deeply frozen at the public boundary", () => {
  const first = compileToolNames([{ id: "x", name: "bad.name" }]);
  const previous = JSON.parse(JSON.stringify(first.manifest));
  previous.entries[0].ignoredExtension = { mutable: true };
  const second = compileToolNames([{ id: "x", name: "bad.name" }], {
    previousManifest: previous,
  });
  assert.equal(Object.isFrozen(second.manifest), true);
  assert.equal(Object.isFrozen(second.manifest.entries), true);
  assert.equal(Object.isFrozen(second.manifest.entries[0]), true);
  assert.equal(Object.isFrozen(second.manifest.entries[0].reasons), true);
  assert.equal("ignoredExtension" in second.manifest.entries[0], false);
  assert.throws(
    () => second.manifest.entries[0].reasons.push("tampered"),
    TypeError,
  );
});

test("manifest diagnostic fields are validated instead of trusted as arbitrary nested data", () => {
  const first = compileToolNames([{ id: "x", name: "bad.name" }]);
  const badReasons = JSON.parse(JSON.stringify(first.manifest));
  badReasons.entries[0].reasons = ["sanitized", { attacker: true }];
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "bad.name" }], {
        previousManifest: badReasons,
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_MANIFEST_ENTRY",
  );
  const unknownReason = JSON.parse(JSON.stringify(first.manifest));
  unknownReason.entries[0].reasons = ["attacker-controlled"];
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "bad.name" }], {
        previousManifest: unknownReason,
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_MANIFEST_REASONS",
  );
  const reasonBomb = JSON.parse(JSON.stringify(first.manifest));
  reasonBomb.entries[0].reasons = Array.from({ length: 17 }, () => "sanitized");
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "bad.name" }], {
        previousManifest: reasonBomb,
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_MANIFEST_REASONS",
  );
  const forgedChanged = JSON.parse(JSON.stringify(first.manifest));
  forgedChanged.entries[0].changed = false;
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "bad.name" }], {
        previousManifest: forgedChanged,
      }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "MANIFEST_CHANGED_MISMATCH",
  );
});

test("empty, Unicode, leading punctuation, and long names remain bounded", () => {
  for (const [index, name] of [
    "💣",
    ".hidden",
    "-dash",
    "_ok",
    "x".repeat(4_096),
    "e\u0301",
    "é",
  ].entries()) {
    const result = compileToolNames([{ id: `case-${index}`, name }]);
    assert.equal(validateWireName(result.toWire(`case-${index}`)).ok, true);
  }
});

test("bounded inputs reject hostile source allocation before hashing", () => {
  assert.throws(
    () => compileToolNames([{ id: "x", name: "x".repeat(4_097) }]),
    (error) => error.code === "SOURCE_NAME_TOO_LONG",
  );
  const tooMany = Array.from({ length: 10_001 }, (_, index) => ({
    id: String(index),
    name: "x",
  }));
  assert.throws(
    () => compileToolNames(tooMany),
    (error) => error.code === "CATALOG_TOO_LARGE",
  );
});

test("the portable SHA-256 suffix matches an independent Node crypto oracle", () => {
  const id = "oracle-id";
  const name = "bad.name";
  const result = compileToolNames([{ id, name }]);
  const digest = createHash("sha256")
    .update(JSON.stringify([id, null, name]))
    .digest();
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let expected = "";
  for (const byte of digest) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      expected += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) expected += alphabet[(value << (5 - bits)) & 31];
  assert.equal(result.toWire(id).endsWith(`_${expected.slice(0, 16)}`), true);
});

test("hash preimages are injective when ids and source names contain separators", () => {
  const first = { id: "a\0b", name: "c." };
  const second = { id: "a", name: "b\0c." };
  const readable = compileToolNames([first, second]);
  const stable = compileToolNames([first, second], {
    allocation: "stable-hash-v1",
  });
  assert.notEqual(readable.toWire(first.id), readable.toWire(second.id));
  assert.notEqual(stable.toWire(first.id), stable.toWire(second.id));
});

test("hostile JavaScript property names and Unicode code-unit edges survive JSON round-trips", () => {
  const entries = [
    { id: "__proto__", namespace: "constructor", name: "toString" },
    { id: "constructor", namespace: "__proto__", name: "toString" },
    { id: "lone-high", name: "\ud800" },
    { id: "lone-low", name: "\udc00" },
    { id: "line-separator", name: "line\u2028separator" },
    { id: "paragraph-separator", name: "line\u2029separator" },
    { id: "composed", name: "\u00e9" },
    { id: "decomposed", name: "e\u0301" },
    { id: "nul", name: "a\0b" },
  ];
  const first = compileToolNames(entries, { allocation: "stable-hash-v1" });
  const aliases = entries.map(({ id }) => first.toWire(id));
  assert.equal(new Set(aliases).size, entries.length);
  assert.equal(
    aliases.every((alias) => validateWireName(alias).ok),
    true,
  );

  const parsed = JSON.parse(JSON.stringify(first.manifest));
  const second = compileToolNames(entries, {
    allocation: "stable-hash-v1",
    previousManifest: parsed,
  });
  for (const { id } of entries) {
    assert.equal(second.toWire(id), first.toWire(id));
    assert.equal(second.fromWire(first.toWire(id)).id, id);
  }
});

test("namespace concatenation collisions bind distinct raw tuples", () => {
  const entries = [
    { id: "nested", namespace: "a", name: "b__c" },
    { id: "flat", namespace: "a__b", name: "c" },
    { id: "literal", name: "a__b__c" },
  ];
  for (const allocation of ["readable-v1", "stable-hash-v1"]) {
    const codec = compileToolNames(entries, { allocation });
    const aliases = entries.map(({ id }) => codec.toWire(id));
    assert.equal(new Set(aliases).size, entries.length);
    for (const { id } of entries)
      assert.equal(codec.fromWire(codec.toWire(id)).id, id);
  }
});

test("maximum escaped source fields produce a manifest that reloads itself", () => {
  const entry = {
    id: "max-json-escape-expansion",
    namespace: "\u0001".repeat(1_024),
    name: "\0".repeat(4_096),
  };
  const first = compileToolNames([entry]);
  assert.equal(first.manifest.entries[0].identity.length > 30_000, true);
  const parsed = JSON.parse(JSON.stringify(first.manifest));
  const second = compileToolNames([entry], { previousManifest: parsed });
  assert.equal(second.toWire(entry.id), first.toWire(entry.id));
  assert.equal(second.fromWire(second.toWire(entry.id)).sourceName, entry.name);
});

test("stateless hashes bind the raw source identity rather than only its sanitized spelling", () => {
  const dot = compileToolNames([{ id: "same", name: "search.code" }], {
    allocation: "stable-hash-v1",
  });
  const slash = compileToolNames([{ id: "same", name: "search/code" }], {
    allocation: "stable-hash-v1",
  });
  assert.notEqual(dot.toWire("same"), slash.toWire("same"));
});

test("a reserved first hash candidate extends the digest without renaming anything else", () => {
  const entry = { id: "collision-probe", name: "bad.name" };
  const first = compileToolNames([entry]);
  const blocked = first.toWire(entry.id);
  const second = compileToolNames([entry], { reserved: [blocked] });
  assert.notEqual(second.toWire(entry.id), blocked);
  assert.equal(second.toWire(entry.id).length > blocked.length, true);
  assert.equal(validateWireName(second.toWire(entry.id)).ok, true);
});

test("tombstones survive repeated generations and never get recycled", () => {
  let manifest;
  const aliases = new Set();
  for (let generation = 0; generation < 100; generation += 1) {
    const id = `generation-${generation}`;
    const result = compileToolNames([{ id, name: "search" }], {
      previousManifest: manifest,
    });
    const alias = result.toWire(id);
    assert.equal(aliases.has(alias), false);
    aliases.add(alias);
    manifest = compileToolNames([], {
      previousManifest: result.manifest,
    }).manifest;
  }
  assert.equal(manifest.entries.length, 100);
  assert.equal(
    manifest.entries.every((entry) => entry.status === "retired"),
    true,
  );
});

test("a retired identity may reactivate only as the exact same caller-owned identity", () => {
  const entry = {
    id: "configured-server/search",
    namespace: "configured-server",
    name: "search",
  };
  const first = compileToolNames([entry]);
  const retired = compileToolNames([], { previousManifest: first.manifest });
  assert.equal(retired.fromWire(first.toWire(entry.id)), undefined);
  assert.equal(retired.lookupWire(first.toWire(entry.id)).status, "retired");

  const reactivated = compileToolNames([entry], {
    previousManifest: retired.manifest,
  });
  assert.equal(reactivated.toWire(entry.id), first.toWire(entry.id));
  assert.equal(reactivated.fromWire(first.toWire(entry.id)).status, "active");
  assert.throws(
    () =>
      compileToolNames([{ ...entry, name: "different-action" }], {
        previousManifest: retired.manifest,
      }),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "STABLE_ID_REUSED",
  );
});

test("reserved provider names are historical tombstones too", () => {
  const first = compileToolNames([{ id: "x", name: "search" }], {
    reserved: ["tool_search"],
  });
  const second = compileToolNames([{ id: "x", name: "search" }], {
    previousManifest: first.manifest,
  });
  assert.deepEqual(second.manifest.reservedNames, ["tool_search"]);
  const third = compileToolNames(
    [{ id: "native-looking", name: "tool_search" }],
    {
      previousManifest: second.manifest,
    },
  );
  assert.notEqual(third.toWire("native-looking"), "tool_search");
});

test("a new reserved name cannot silently squat on a historical alias", () => {
  const first = compileToolNames([{ id: "search", name: "search" }]);
  assert.throws(
    () =>
      compileToolNames([{ id: "search", name: "search" }], {
        previousManifest: first.manifest,
        reserved: ["search"],
      }),
    (error) => error.code === "RESERVED_NAME_CONFLICT",
  );
});

test("manifest identity fields must be internally consistent at load time", () => {
  const first = compileToolNames([{ id: "x", name: "charge" }]);
  const tampered = JSON.parse(JSON.stringify(first.manifest));
  tampered.entries[0].sourceName = "refund";
  assert.throws(
    () =>
      compileToolNames([{ id: "x", name: "charge" }], {
        previousManifest: tampered,
      }),
    (error) => error.code === "MANIFEST_IDENTITY_MISMATCH",
  );
});

test("manifest source identity fields must remain valid catalog fields", () => {
  const first = compileToolNames([{ id: "x", name: "charge" }]);
  const emptyId = JSON.parse(JSON.stringify(first.manifest));
  emptyId.entries[0].id = "";
  emptyId.entries[0].identity = JSON.stringify([null, "charge"]);
  assert.throws(
    () => compileToolNames([], { previousManifest: emptyId }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_MANIFEST_ENTRY",
  );
});

test("migration planning preserves legacy aliases and reports new and retired ids", () => {
  const result = planToolNameMigration(
    [
      { id: "kept", namespace: "old.server", name: "search.tool" },
      { id: "added", namespace: "new.server", name: "search/tool" },
    ],
    [
      {
        id: "kept",
        namespace: "old.server",
        name: "search.tool",
        wireName: "legacy_search",
      },
      { id: "removed", name: "retired", wireName: "legacy_retired" },
    ],
  );
  assert.equal(result.ok, true);
  assert.equal(result.catalog.toWire("kept"), "legacy_search");
  assert.deepEqual(result.plan, {
    preserved: ["kept"],
    generated: ["added"],
    retired: ["removed"],
  });
  assert.equal(result.catalog.fromWire("legacy_retired"), undefined);
  assert.equal(result.catalog.lookupWire("legacy_retired").status, "retired");
});

test("migration planning aggregates invalid, duplicate, and reserved aliases without mutating", () => {
  const result = planToolNameMigration(
    [{ id: "a", name: "a" }],
    [
      { id: "a", name: "a", wireName: "tool_search" },
      { id: "b", name: "b", wireName: "tool_search" },
      { id: "c", name: "c", wireName: "bad.name" },
    ],
    { reserved: ["tool_search"] },
  );
  assert.equal(result.ok, false);
  assert.equal(
    result.conflicts.some((entry) => entry.code === "LEGACY_RESERVED_CONFLICT"),
    true,
  );
  assert.equal(
    result.conflicts.some((entry) => entry.code === "DUPLICATE_LEGACY_ALIAS"),
    true,
  );
  assert.equal(
    result.conflicts.some((entry) => entry.code === "INVALID_LEGACY_ALIAS"),
    true,
  );
});

test("migration planner rejects a scalar reserved option instead of iterating it", () => {
  assert.throws(
    () => planToolNameMigration([], [], { reserved: "tool_search" }),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "INVALID_RESERVED_NAMES",
  );
});

test("unknown options fail closed instead of silently changing allocation guarantees", () => {
  assert.throws(
    () => compileToolNames([], { allocaton: "stable-hash-v1" }),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "UNKNOWN_OPTION",
  );
  assert.throws(
    () => planToolNameMigration([], [], { previousManifest: {} }),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "UNKNOWN_OPTION",
  );
  assert.throws(
    () => compileToolNames([], Object.create({ allocation: "stable-hash-v1" })),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "INHERITED_OPTION",
  );
  assert.throws(
    () =>
      planToolNameMigration(
        [],
        [],
        Object.create({ reserved: ["tool_search"] }),
      ),
    (error) =>
      error instanceof ToolNameCodecError && error.code === "INHERITED_OPTION",
  );
});

test("migration planning bounds legacy history before iterating it and validates status", () => {
  assert.throws(
    () => planToolNameMigration([], new Array(100_001)),
    (error) =>
      error instanceof ToolNameCodecError &&
      error.code === "MIGRATION_TOO_LARGE",
  );
  const invalidStatus = planToolNameMigration(
    [],
    [{ id: "x", name: "x", wireName: "x", status: "deleted" }],
  );
  assert.equal(invalidStatus.ok, false);
  assert.equal(invalidStatus.conflicts[0].code, "INVALID_LEGACY_STATUS");
  assert.equal(Object.isFrozen(invalidStatus.conflicts[0]), true);
});
