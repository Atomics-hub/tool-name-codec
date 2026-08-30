const PROFILES = Object.freeze({
  // Intersection of the current OpenAI, Anthropic, and Gemini declarations.
  "portable-v1": Object.freeze({
    id: "portable-v1",
    maxLength: 64,
    allowed: /^[A-Za-z0-9_-]+$/,
    allowedChar: /^[A-Za-z0-9_-]$/,
    first: /^[A-Za-z_]$/,
  }),
  // Conservative compatibility profile used by several OpenAI-compatible APIs.
  "strict-portable-v1": Object.freeze({
    id: "strict-portable-v1",
    maxLength: 63,
    allowed: /^[A-Za-z0-9_-]+$/,
    allowedChar: /^[A-Za-z0-9_-]$/,
    first: /^[A-Za-z]$/,
  }),
  "openai-v1": Object.freeze({
    id: "openai-v1",
    maxLength: 64,
    allowed: /^[A-Za-z0-9_-]+$/,
    allowedChar: /^[A-Za-z0-9_-]$/,
    first: /^[A-Za-z0-9_-]$/,
  }),
  "anthropic-v1": Object.freeze({
    id: "anthropic-v1",
    maxLength: 64,
    allowed: /^[A-Za-z0-9_-]+$/,
    allowedChar: /^[A-Za-z0-9_-]$/,
    first: /^[A-Za-z0-9_-]$/,
  }),
  // Conservative round-trip subset of the Gemini Developer API's current
  // FunctionDeclaration and FunctionCall name grammars. The two official
  // schemas disagree about dots and colons, so neither is emitted here.
  "gemini-api-2026-08": Object.freeze({
    id: "gemini-api-2026-08",
    maxLength: 128,
    allowed: /^[A-Za-z0-9_-]+$/,
    allowedChar: /^[A-Za-z0-9_-]$/,
    first: /^[A-Za-z_]$/,
  }),
  // Vertex AI documents a distinct Gemini function-name contract: 64
  // characters, a letter/underscore first, and dots but not colons.
  "vertex-gemini-2026-08": Object.freeze({
    id: "vertex-gemini-2026-08",
    maxLength: 64,
    allowed: /^[A-Za-z0-9_.-]+$/,
    allowedChar: /^[A-Za-z0-9_.-]$/,
    first: /^[A-Za-z_]$/,
  }),
  "mcp-2025-11-25": Object.freeze({
    id: "mcp-2025-11-25",
    maxLength: 128,
    allowed: /^[A-Za-z0-9._-]+$/,
    allowedChar: /^[A-Za-z0-9._-]$/,
    first: /^[A-Za-z0-9._-]$/,
  }),
  // MCP 2026-07-28 retains the 2025-11-25 tool-name SHOULD profile and
  // explicitly calls out disambiguation for clients aggregating servers.
  "mcp-2026-07-28": Object.freeze({
    id: "mcp-2026-07-28",
    maxLength: 128,
    allowed: /^[A-Za-z0-9._-]+$/,
    allowedChar: /^[A-Za-z0-9._-]$/,
    first: /^[A-Za-z0-9._-]$/,
  }),
});

const LIMITS = Object.freeze({
  maxEntries: 10_000,
  maxManifestEntries: 25_000,
  maxReservedNames: 10_000,
  maxManifestSourceLength: 64 * 1024 * 1024,
  maxReasonsPerEntry: 16,
  maxReasonLength: 64,
  maxIdLength: 1_024,
  maxSourceNameLength: 4_096,
  maxNamespaceLength: 1_024,
  maxTotalSourceLength: 4 * 1024 * 1024,
});

const MANIFEST_REASON_CODES = new Set([
  "sanitized",
  "truncated",
  "catalog-collision",
  "reserved-or-historical-collision",
  "namespaced",
  "stateless-stability",
  "legacy-import",
]);

export class ToolNameCodecError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ToolNameCodecError";
    this.code = code;
    this.details = details;
  }
}

function diagnosticValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return String(value);
  } catch {
    return "<unprintable>";
  }
}

function resolveProfile(id = "portable-v1") {
  if (typeof id !== "string" || !Object.hasOwn(PROFILES, id)) {
    throw new ToolNameCodecError(
      "UNKNOWN_PROFILE",
      `Unknown tool-name profile: ${diagnosticValue(id)}`,
      { id },
    );
  }
  return PROFILES[id];
}

export function getProfile(id = "portable-v1") {
  const profile = resolveProfile(id);
  // RegExp.prototype.compile() can mutate a frozen RegExp's internal pattern
  // before throwing on its frozen lastIndex. Expose inert metadata rather than
  // the shared validator objects used by this module.
  return Object.freeze({
    id: profile.id,
    maxLength: profile.maxLength,
    pattern: profile.allowed.source,
    firstPattern: profile.first.source,
  });
}

export function validateWireName(name, profileId = "portable-v1") {
  const profile = resolveProfile(profileId);
  const reasons = [];
  if (typeof name !== "string") reasons.push("not-string");
  else {
    if (name.length === 0) reasons.push("empty");
    if (name.length > profile.maxLength) reasons.push("too-long");
    if (name.length > 0 && !profile.first.test(name[0]))
      reasons.push("invalid-first-character");
    if (name.length > 0 && !profile.allowed.test(name))
      reasons.push("invalid-character");
  }
  return { ok: reasons.length === 0, reasons, profile: profile.id };
}

function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertOptions(options, allowedKeys) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ToolNameCodecError(
      "INVALID_OPTIONS",
      "options must be an object",
    );
  }
  for (const key of allowedKeys) {
    if (key in options && !Object.hasOwn(options, key)) {
      throw new ToolNameCodecError(
        "INHERITED_OPTION",
        `Option must be an own property: ${key}`,
        { key },
      );
    }
  }
  for (const key of Object.keys(options)) {
    if (!allowedKeys.has(key)) {
      throw new ToolNameCodecError("UNKNOWN_OPTION", `Unknown option: ${key}`, {
        key,
      });
    }
  }
}

function assertReservedOption(reserved) {
  if (reserved !== undefined && !Array.isArray(reserved)) {
    throw new ToolNameCodecError(
      "INVALID_RESERVED_NAMES",
      "reserved must be an array",
    );
  }
  if ((reserved?.length ?? 0) > LIMITS.maxReservedNames) {
    throw new ToolNameCodecError(
      "TOO_MANY_RESERVED_NAMES",
      `reserved exceeds ${LIMITS.maxReservedNames} names`,
    );
  }
}

function assertEntry(entry) {
  if (!entry || typeof entry !== "object") {
    throw new ToolNameCodecError(
      "INVALID_ENTRY",
      "Each entry must be an object",
    );
  }
  if (typeof entry.id !== "string" || entry.id.length === 0) {
    throw new ToolNameCodecError(
      "INVALID_ID",
      "Each entry needs a non-empty stable id",
      { entry },
    );
  }
  if (entry.id.length > LIMITS.maxIdLength) {
    throw new ToolNameCodecError(
      "ID_TOO_LONG",
      `Stable id exceeds ${LIMITS.maxIdLength} code units`,
      {
        length: entry.id.length,
      },
    );
  }
  if (typeof entry.name !== "string" || entry.name.length === 0) {
    throw new ToolNameCodecError(
      "INVALID_SOURCE_NAME",
      "Each entry needs a non-empty source name",
      { id: entry.id },
    );
  }
  if (entry.name.length > LIMITS.maxSourceNameLength) {
    throw new ToolNameCodecError(
      "SOURCE_NAME_TOO_LONG",
      `Source name exceeds ${LIMITS.maxSourceNameLength} code units`,
      {
        id: entry.id,
        length: entry.name.length,
      },
    );
  }
  if (
    entry.namespace !== undefined &&
    (typeof entry.namespace !== "string" || entry.namespace.length === 0)
  ) {
    throw new ToolNameCodecError(
      "INVALID_NAMESPACE",
      "namespace must be a non-empty string when supplied",
      {
        id: entry.id,
      },
    );
  }
  if (
    entry.namespace !== undefined &&
    entry.namespace.length > LIMITS.maxNamespaceLength
  ) {
    throw new ToolNameCodecError(
      "NAMESPACE_TOO_LONG",
      `Namespace exceeds ${LIMITS.maxNamespaceLength} code units`,
      {
        id: entry.id,
        length: entry.namespace.length,
      },
    );
  }
}

function identityOf(entry) {
  return JSON.stringify([entry.namespace ?? null, entry.name]);
}

function sourceBase(entry) {
  return entry.namespace === undefined
    ? entry.name
    : `${entry.namespace}__${entry.name}`;
}

function sanitizeBase(value, profile) {
  let out = "";
  for (const character of value)
    out += profile.allowedChar.test(character) ? character : "_";
  if (out.length === 0) out = "tool";
  if (!profile.first.test(out[0])) out = `tool_${out}`;
  return out;
}

function digestInput(entry) {
  return JSON.stringify([entry.id, entry.namespace ?? null, entry.name]);
}

function hashAlias(base, entry, profile, used) {
  const digest = base32(sha256(digestInput(entry)));
  for (let hashLength = 16; hashLength <= digest.length; hashLength += 2) {
    const suffix = `_${digest.slice(0, hashLength)}`;
    const stemLength = profile.maxLength - suffix.length;
    if (stemLength < 1) break;
    let stem = base.slice(0, stemLength).replace(/[_-]+$/g, "");
    if (stem.length === 0 || !profile.first.test(stem[0]))
      stem = "t".slice(0, stemLength);
    const alias = `${stem}${suffix}`;
    if (validateWireName(alias, profile.id).ok && !used.has(alias))
      return alias;
  }
  throw new ToolNameCodecError(
    "ALIAS_SPACE_EXHAUSTED",
    `Could not allocate a unique ${profile.id} alias for ${JSON.stringify(entry.id)}`,
    { stableId: entry.id, profile: profile.id },
  );
}

function stableHashAlias(base, entry, profile, used) {
  const digest = base32(sha256(digestInput(entry)));
  const suffix = `_${digest}`;
  const stemLength = profile.maxLength - suffix.length;
  if (stemLength < 1) {
    throw new ToolNameCodecError(
      "ALIAS_SPACE_EXHAUSTED",
      `The ${profile.id} profile cannot contain a full SHA-256 alias`,
      { stableId: entry.id, profile: profile.id },
    );
  }
  let stem = base.slice(0, stemLength).replace(/[_-]+$/g, "");
  if (stem.length === 0 || !profile.first.test(stem[0]))
    stem = "t".slice(0, stemLength);
  const alias = `${stem}${suffix}`;
  if (!validateWireName(alias, profile.id).ok) {
    throw new ToolNameCodecError(
      "INVALID_GENERATED_ALIAS",
      "Internal stable alias failed profile validation",
      {
        stableId: entry.id,
        profile: profile.id,
      },
    );
  }
  if (used.has(alias)) {
    throw new ToolNameCodecError(
      "STABLE_ALIAS_CONFLICT",
      "A full-digest stable alias conflicts with a historical, reserved, or active name",
      { stableId: entry.id, profile: profile.id, alias },
    );
  }
  return alias;
}

function parsePrevious(previous, profile, algorithm) {
  if (previous === undefined) return [];
  if (
    !previous ||
    previous.schema !== "tool-name-codec/1" ||
    !Array.isArray(previous.entries)
  ) {
    throw new ToolNameCodecError(
      "INVALID_MANIFEST",
      "Previous manifest is not tool-name-codec/1",
    );
  }
  if (previous.entries.length > LIMITS.maxManifestEntries) {
    throw new ToolNameCodecError(
      "MANIFEST_TOO_LARGE",
      `Manifest exceeds ${LIMITS.maxManifestEntries} entries`,
    );
  }
  if (previous.profile !== profile.id) {
    throw new ToolNameCodecError(
      "PROFILE_MISMATCH",
      "A manifest cannot silently change provider profile",
      {
        previous: previous.profile,
        current: profile.id,
      },
    );
  }
  if (previous.algorithm !== algorithm) {
    throw new ToolNameCodecError(
      "ALGORITHM_MISMATCH",
      "A manifest cannot silently change allocation algorithm",
      {
        previous: previous.algorithm,
        current: algorithm,
      },
    );
  }
  if (
    previous.reservedNames !== undefined &&
    !Array.isArray(previous.reservedNames)
  ) {
    throw new ToolNameCodecError(
      "INVALID_MANIFEST",
      "Manifest reservedNames must be an array",
    );
  }
  const ids = new Set();
  const aliases = new Set();
  const normalizedEntries = [];
  let totalManifestSourceLength = 0;
  for (const entry of previous.entries) {
    if (
      !entry ||
      typeof entry.id !== "string" ||
      typeof entry.identity !== "string" ||
      typeof entry.wireName !== "string" ||
      typeof entry.sourceName !== "string" ||
      typeof entry.changed !== "boolean" ||
      !Array.isArray(entry.reasons) ||
      !entry.reasons.every((reason) => typeof reason === "string") ||
      !["active", "retired"].includes(entry.status)
    ) {
      throw new ToolNameCodecError(
        "INVALID_MANIFEST_ENTRY",
        "Manifest entry has an invalid shape",
        { entry },
      );
    }
    if (
      entry.reasons.length > LIMITS.maxReasonsPerEntry ||
      entry.reasons.some(
        (reason) =>
          reason.length > LIMITS.maxReasonLength ||
          !MANIFEST_REASON_CODES.has(reason),
      )
    ) {
      throw new ToolNameCodecError(
        "INVALID_MANIFEST_REASONS",
        "Manifest entry has invalid diagnostic reasons",
        {
          id: entry.id,
        },
      );
    }
    try {
      assertEntry({
        id: entry.id,
        name: entry.sourceName,
        namespace: entry.namespace,
      });
    } catch (error) {
      throw new ToolNameCodecError(
        "INVALID_MANIFEST_ENTRY",
        "Manifest entry has invalid source identity fields",
        {
          cause: error instanceof ToolNameCodecError ? error.code : undefined,
        },
      );
    }
    if (
      entry.id.length > LIMITS.maxIdLength ||
      entry.sourceName.length > LIMITS.maxSourceNameLength ||
      (entry.namespace !== undefined &&
        (typeof entry.namespace !== "string" ||
          entry.namespace.length > LIMITS.maxNamespaceLength)) ||
      // JSON.stringify may expand one valid UTF-16 code unit to a six-byte
      // escape (for example NUL or a lone surrogate). Bound the serialized
      // identity by the actual source lengths, not their unescaped lengths,
      // so a manifest emitted at the documented input limit can be reloaded.
      entry.identity.length >
        6 * (entry.sourceName.length + (entry.namespace?.length ?? 0)) + 32
    ) {
      throw new ToolNameCodecError(
        "MANIFEST_ENTRY_TOO_LARGE",
        "Manifest entry exceeds source-string limits",
        {
          id: entry.id.slice(0, 80),
        },
      );
    }
    if (ids.has(entry.id)) {
      throw new ToolNameCodecError(
        "DUPLICATE_MANIFEST_ID",
        `Manifest repeats stable id ${diagnosticValue(entry.id)}`,
      );
    }
    if (aliases.has(entry.wireName)) {
      throw new ToolNameCodecError(
        "DUPLICATE_MANIFEST_ALIAS",
        `Manifest repeats alias ${diagnosticValue(entry.wireName)}`,
      );
    }
    if (!validateWireName(entry.wireName, profile.id).ok) {
      throw new ToolNameCodecError(
        "INVALID_MANIFEST_ALIAS",
        `Manifest alias is invalid for ${profile.id}`,
        {
          id: entry.id,
          wireName: entry.wireName,
        },
      );
    }
    if (
      identityOf({ name: entry.sourceName, namespace: entry.namespace }) !==
      entry.identity
    ) {
      throw new ToolNameCodecError(
        "MANIFEST_IDENTITY_MISMATCH",
        "Manifest source fields do not match identity",
        {
          id: entry.id,
        },
      );
    }
    const expectedChanged =
      entry.wireName !==
      sourceBase({ name: entry.sourceName, namespace: entry.namespace });
    if (entry.changed !== expectedChanged) {
      throw new ToolNameCodecError(
        "MANIFEST_CHANGED_MISMATCH",
        "Manifest changed flag does not match its source and alias",
        {
          id: entry.id,
        },
      );
    }
    totalManifestSourceLength +=
      entry.id.length +
      entry.identity.length +
      entry.sourceName.length +
      (entry.namespace?.length ?? 0) +
      entry.wireName.length +
      entry.reasons.reduce((sum, reason) => sum + reason.length, 0);
    if (totalManifestSourceLength > LIMITS.maxManifestSourceLength) {
      throw new ToolNameCodecError(
        "MANIFEST_SOURCE_TOO_LARGE",
        `Manifest strings exceed ${LIMITS.maxManifestSourceLength} total code units`,
      );
    }
    ids.add(entry.id);
    aliases.add(entry.wireName);
    normalizedEntries.push({
      id: entry.id,
      identity: entry.identity,
      sourceName: entry.sourceName,
      ...(entry.namespace === undefined ? {} : { namespace: entry.namespace }),
      wireName: entry.wireName,
      status: entry.status,
      changed: entry.changed,
      reasons: [...entry.reasons],
    });
  }
  const reservedNames = previous.reservedNames ?? [];
  if (reservedNames.length > LIMITS.maxReservedNames) {
    throw new ToolNameCodecError(
      "MANIFEST_TOO_LARGE",
      `Manifest exceeds ${LIMITS.maxReservedNames} reserved names`,
    );
  }
  for (const reserved of reservedNames) {
    if (
      typeof reserved !== "string" ||
      !validateWireName(reserved, profile.id).ok
    ) {
      throw new ToolNameCodecError(
        "INVALID_MANIFEST_RESERVED_NAME",
        "Manifest has an invalid reserved name",
        {
          reserved,
        },
      );
    }
    if (aliases.has(reserved)) {
      throw new ToolNameCodecError(
        "MANIFEST_RESERVED_CONFLICT",
        "Manifest reserves an allocated alias",
        {
          reserved,
        },
      );
    }
  }
  return {
    entries: normalizedEntries,
    reservedNames: [...new Set(reservedNames)],
  };
}

export function compileToolNames(entries, options = {}) {
  assertOptions(
    options,
    new Set(["profile", "allocation", "previousManifest", "reserved"]),
  );
  if (!Array.isArray(entries)) {
    throw new ToolNameCodecError("INVALID_CATALOG", "entries must be an array");
  }
  if (entries.length > LIMITS.maxEntries) {
    throw new ToolNameCodecError(
      "CATALOG_TOO_LARGE",
      `Catalog exceeds ${LIMITS.maxEntries} active entries`,
    );
  }
  const profile = resolveProfile(options.profile ?? "portable-v1");
  const allocation = options.allocation ?? "readable-v1";
  if (!["readable-v1", "stable-hash-v1"].includes(allocation)) {
    throw new ToolNameCodecError(
      "UNKNOWN_ALLOCATION",
      `Unknown allocation mode: ${diagnosticValue(allocation)}`,
      { allocation },
    );
  }
  const algorithm =
    allocation === "stable-hash-v1" ? "stable-sha256-v1" : "readable-sha256-v1";
  assertReservedOption(options.reserved);
  const parsedPrevious = parsePrevious(
    options.previousManifest,
    profile,
    algorithm,
  );
  const previousEntries = Array.isArray(parsedPrevious)
    ? parsedPrevious
    : parsedPrevious.entries;
  const historicalReserved = Array.isArray(parsedPrevious)
    ? []
    : parsedPrevious.reservedNames;
  const currentById = new Map();
  let totalSourceLength = 0;
  for (const entry of entries) {
    assertEntry(entry);
    totalSourceLength +=
      entry.id.length + entry.name.length + (entry.namespace?.length ?? 0);
    if (totalSourceLength > LIMITS.maxTotalSourceLength) {
      throw new ToolNameCodecError(
        "CATALOG_SOURCE_TOO_LARGE",
        `Catalog source strings exceed ${LIMITS.maxTotalSourceLength} total code units`,
      );
    }
    if (currentById.has(entry.id)) {
      throw new ToolNameCodecError(
        "DUPLICATE_ID",
        `Catalog repeats stable id ${diagnosticValue(entry.id)}`,
        { id: entry.id },
      );
    }
    currentById.set(entry.id, {
      id: entry.id,
      name: entry.name,
      namespace: entry.namespace,
    });
  }

  const previousById = new Map(
    previousEntries.map((entry) => [entry.id, entry]),
  );
  const allocatedAliases = new Set(
    previousEntries.map((entry) => entry.wireName),
  );
  const used = new Set([...allocatedAliases, ...historicalReserved]);
  const allReserved = new Set(historicalReserved);
  for (const reserved of options.reserved ?? []) {
    if (
      typeof reserved !== "string" ||
      !validateWireName(reserved, profile.id).ok
    ) {
      throw new ToolNameCodecError(
        "INVALID_RESERVED_NAME",
        "Every reserved name must be valid for the profile",
        {
          reserved,
        },
      );
    }
    if (allocatedAliases.has(reserved)) {
      throw new ToolNameCodecError(
        "RESERVED_NAME_CONFLICT",
        `Reserved name ${diagnosticValue(reserved)} is already allocated by the previous manifest`,
        { reserved },
      );
    }
    allReserved.add(reserved);
    used.add(reserved);
  }

  const manifestEntries = [];
  for (const old of previousEntries) {
    const current = currentById.get(old.id);
    if (current && identityOf(current) !== old.identity) {
      throw new ToolNameCodecError(
        "STABLE_ID_REUSED",
        `Stable id ${diagnosticValue(old.id)} changed identity; retire it and use a new id instead`,
        { id: old.id },
      );
    }
    manifestEntries.push({ ...old, status: current ? "active" : "retired" });
  }

  const newEntries = [...currentById.values()]
    .filter((entry) => !previousById.has(entry.id))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
  const bases = newEntries.map((entry) =>
    sanitizeBase(sourceBase(entry), profile),
  );
  const baseCounts = new Map();
  for (const base of bases)
    baseCounts.set(base, (baseCounts.get(base) ?? 0) + 1);

  for (let index = 0; index < newEntries.length; index += 1) {
    const entry = newEntries[index];
    const rawBase = sourceBase(entry);
    const safeBase = bases[index];
    const safeAsIs =
      rawBase === safeBase && validateWireName(safeBase, profile.id).ok;
    const uniqueBase = baseCounts.get(safeBase) === 1;
    const wireName =
      allocation === "stable-hash-v1"
        ? stableHashAlias(safeBase, entry, profile, used)
        : safeAsIs && uniqueBase && !used.has(safeBase)
          ? safeBase
          : hashAlias(safeBase, entry, profile, used);
    const reasons = [];
    if (rawBase !== safeBase) reasons.push("sanitized");
    if (rawBase.length > profile.maxLength) reasons.push("truncated");
    if (!uniqueBase) reasons.push("catalog-collision");
    if (used.has(safeBase)) reasons.push("reserved-or-historical-collision");
    if (entry.namespace !== undefined) reasons.push("namespaced");
    if (allocation === "stable-hash-v1") reasons.push("stateless-stability");
    used.add(wireName);
    manifestEntries.push({
      id: entry.id,
      identity: identityOf(entry),
      sourceName: entry.name,
      ...(entry.namespace === undefined ? {} : { namespace: entry.namespace }),
      wireName,
      status: "active",
      changed: wireName !== rawBase,
      reasons,
    });
  }

  if (manifestEntries.length > LIMITS.maxManifestEntries) {
    throw new ToolNameCodecError(
      "MANIFEST_TOO_LARGE",
      `Compiled manifest exceeds ${LIMITS.maxManifestEntries} entries`,
    );
  }

  manifestEntries.sort((left, right) => compareCodeUnits(left.id, right.id));
  const manifest = Object.freeze({
    schema: "tool-name-codec/1",
    profile: profile.id,
    algorithm,
    reservedNames: Object.freeze([...allReserved].sort(compareCodeUnits)),
    entries: Object.freeze(
      manifestEntries.map((entry) =>
        Object.freeze({ ...entry, reasons: Object.freeze([...entry.reasons]) }),
      ),
    ),
  });
  const activeById = new Map(
    manifest.entries
      .filter((entry) => entry.status === "active")
      .map((entry) => [entry.id, entry]),
  );
  const activeByWire = new Map(
    manifest.entries
      .filter((entry) => entry.status === "active")
      .map((entry) => [entry.wireName, entry]),
  );
  const byWire = new Map(
    manifest.entries.map((entry) => [entry.wireName, entry]),
  );
  return Object.freeze({
    manifest,
    tools: Object.freeze(
      manifest.entries.filter((entry) => entry.status === "active"),
    ),
    toWire(id) {
      const entry = activeById.get(id);
      if (!entry) {
        throw new ToolNameCodecError(
          "UNKNOWN_ACTIVE_ID",
          `No active tool has id ${diagnosticValue(id)}`,
          { id },
        );
      }
      return entry.wireName;
    },
    fromWire(wireName) {
      return activeByWire.get(wireName);
    },
    lookupWire(wireName) {
      return byWire.get(wireName);
    },
  });
}

/**
 * Import an application's current alias table without rewriting it. Conflicts
 * are returned as data so a migration can be reviewed before a manifest is
 * persisted or any stored transcript is touched.
 */
export function planToolNameMigration(entries, legacyAliases, options = {}) {
  assertOptions(options, new Set(["profile", "allocation", "reserved"]));
  const profile = resolveProfile(options.profile ?? "portable-v1");
  const allocation = options.allocation ?? "readable-v1";
  if (!["readable-v1", "stable-hash-v1"].includes(allocation)) {
    throw new ToolNameCodecError(
      "UNKNOWN_ALLOCATION",
      `Unknown allocation mode: ${diagnosticValue(allocation)}`,
      { allocation },
    );
  }
  const algorithm =
    allocation === "stable-hash-v1" ? "stable-sha256-v1" : "readable-sha256-v1";
  if (!Array.isArray(entries) || !Array.isArray(legacyAliases)) {
    throw new ToolNameCodecError(
      "INVALID_MIGRATION_INPUT",
      "entries and legacyAliases must be arrays",
    );
  }
  if (legacyAliases.length > LIMITS.maxManifestEntries) {
    throw new ToolNameCodecError(
      "MIGRATION_TOO_LARGE",
      `legacyAliases exceeds ${LIMITS.maxManifestEntries} entries`,
    );
  }
  assertReservedOption(options.reserved);
  const conflicts = [];
  const ids = new Set();
  const aliases = new Set();
  const reserved = new Set(options.reserved ?? []);
  const manifestEntries = [];
  let totalLegacySourceLength = 0;

  for (const legacy of legacyAliases) {
    try {
      assertEntry(legacy);
    } catch (error) {
      conflicts.push({
        code:
          error instanceof ToolNameCodecError
            ? error.code
            : "INVALID_LEGACY_ENTRY",
        id: typeof legacy?.id === "string" ? legacy.id : undefined,
        message: String(error.message ?? error),
      });
      continue;
    }
    totalLegacySourceLength +=
      legacy.id.length + legacy.name.length + (legacy.namespace?.length ?? 0);
    if (totalLegacySourceLength > LIMITS.maxTotalSourceLength) {
      throw new ToolNameCodecError(
        "MIGRATION_SOURCE_TOO_LARGE",
        `Legacy source strings exceed ${LIMITS.maxTotalSourceLength} total code units`,
      );
    }
    if (
      legacy.status !== undefined &&
      !["active", "retired"].includes(legacy.status)
    ) {
      conflicts.push({
        code: "INVALID_LEGACY_STATUS",
        id: legacy.id,
        status: legacy.status,
      });
      continue;
    }
    if (
      typeof legacy.wireName !== "string" ||
      !validateWireName(legacy.wireName, profile.id).ok
    ) {
      conflicts.push({
        code: "INVALID_LEGACY_ALIAS",
        id: legacy.id,
        wireName: legacy.wireName,
      });
      continue;
    }
    if (ids.has(legacy.id))
      conflicts.push({ code: "DUPLICATE_LEGACY_ID", id: legacy.id });
    if (aliases.has(legacy.wireName)) {
      conflicts.push({
        code: "DUPLICATE_LEGACY_ALIAS",
        id: legacy.id,
        wireName: legacy.wireName,
      });
    }
    if (reserved.has(legacy.wireName)) {
      conflicts.push({
        code: "LEGACY_RESERVED_CONFLICT",
        id: legacy.id,
        wireName: legacy.wireName,
      });
    }
    ids.add(legacy.id);
    aliases.add(legacy.wireName);
    manifestEntries.push({
      id: legacy.id,
      identity: identityOf(legacy),
      sourceName: legacy.name,
      ...(legacy.namespace === undefined
        ? {}
        : { namespace: legacy.namespace }),
      wireName: legacy.wireName,
      status: legacy.status === "retired" ? "retired" : "active",
      changed: legacy.wireName !== sourceBase(legacy),
      reasons: ["legacy-import"],
    });
  }

  if (conflicts.length > 0) {
    return Object.freeze({
      ok: false,
      conflicts: Object.freeze(
        conflicts.map((conflict) => Object.freeze({ ...conflict })),
      ),
    });
  }

  const previousManifest = {
    schema: "tool-name-codec/1",
    profile: profile.id,
    algorithm,
    reservedNames: [...reserved],
    entries: manifestEntries,
  };
  let catalog;
  try {
    catalog = compileToolNames(entries, {
      ...options,
      previousManifest,
      reserved: [],
    });
  } catch (error) {
    if (error instanceof ToolNameCodecError) {
      return Object.freeze({
        ok: false,
        conflicts: Object.freeze([
          { code: error.code, message: error.message, ...error.details },
        ]),
      });
    }
    throw error;
  }
  const legacyIds = new Set(legacyAliases.map((entry) => entry.id));
  const currentIds = new Set(entries.map((entry) => entry.id));
  const plan = Object.freeze({
    preserved: Object.freeze(
      catalog.tools
        .filter((entry) => legacyIds.has(entry.id))
        .map((entry) => entry.id),
    ),
    generated: Object.freeze(
      catalog.tools
        .filter((entry) => !legacyIds.has(entry.id))
        .map((entry) => entry.id),
    ),
    retired: Object.freeze(
      catalog.manifest.entries
        .filter((entry) => !currentIds.has(entry.id))
        .map((entry) => entry.id),
    ),
  });
  return Object.freeze({ ok: true, catalog, plan });
}

// Small synchronous SHA-256 implementation keeps the codec dependency-free and
// usable in Node, browsers, workers, Bun, and Deno without async WebCrypto APIs.
function sha256(input) {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  const rotate = (value, bits) => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1)
      words[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const a = words[i - 15];
      const b = words[i - 2];
      const s0 = rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3);
      const s1 = rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10);
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const t1 = (h + s1 + choose + constants[i] + words[i]) >>> 0;
      const s0 = rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  const result = new Uint8Array(32);
  const resultView = new DataView(result.buffer);
  for (let i = 0; i < state.length; i += 1)
    resultView.setUint32(i * 4, state[i], false);
  return result;
}

function base32(bytes) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
