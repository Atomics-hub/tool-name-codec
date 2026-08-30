# tool-name-codec

Stable, collision-safe tool names across MCP, OpenAI, Anthropic, and Gemini.

[![npm version](https://img.shields.io/npm/v/tool-name-codec.svg)](https://www.npmjs.com/package/tool-name-codec)
[![CI](https://github.com/Atomics-hub/tool-name-codec/actions/workflows/ci.yml/badge.svg)](https://github.com/Atomics-hub/tool-name-codec/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/tool-name-codec.svg)](./LICENSE)
[![zero dependencies](https://img.shields.io/badge/runtime_dependencies-0-brightgreen.svg)](./package.json)

MCP permits tool names that some model providers reject. Flattening several MCP servers can also create duplicate names, and ordinary sanitizers lose the original route. `tool-name-codec` compiles the complete catalog into a provider-valid namespace with deterministic collision handling, exact reverse lookup, stable aliases, migration plans, and retired-name tombstones.

```sh
npm install tool-name-codec
```

```ts
import { compileToolNames } from "tool-name-codec";

const catalog = compileToolNames([
  { id: "github/search", namespace: "github.com", name: "search.code" },
  { id: "gitlab/search", namespace: "gitlab.com", name: "search/code" },
]);

for (const tool of catalog.tools) {
  tool.wireName; // valid, deterministic, unique model-facing name
}

const called = catalog.fromWire(modelToolName);
if (called) {
  await callMcpTool(called.namespace, called.sourceName, argumentsFromModel);
}
```

## Why a catalog codec instead of `sanitize(name)`?

A single-name sanitizer cannot know whether:

- `search.code`, `search/code`, and `search code` collapse to the same output;
- two servers both expose `search`;
- a native provider tool already reserves the chosen name;
- adding a new tool renames an alias stored in old transcripts;
- a removed alias is about to be reused for a different action;
- the model-facing alias can be routed back to the original server and wire name.

This package treats names as catalog state. The returned manifest is the durable mapping between a caller-owned identity and the provider-facing alias.

## The common failures it prevents

### “OpenAI rejected my MCP tool name”

MCP names may contain punctuation or exceed a provider's limit. Select a versioned provider profile and compile before exposing the tools.

```ts
const catalog = compileToolNames(tools, { profile: "openai-v1" });
```

### “Two MCP servers expose the same tool name”

Give every tool a stable application-owned `id` and, when useful, a display namespace. Catalog compilation detects collisions after sanitization and truncation, then allocates deterministic hash suffixes.

### “Adding a tool renamed an old tool”

Persist the previous manifest and supply it on the next catalog build. Existing aliases stay byte-for-byte stable, while removed aliases become non-dispatchable tombstones.

```ts
const next = compileToolNames(nextTools, {
  previousManifest: JSON.parse(await readFile("tool-names.json", "utf8")),
  reserved: ["web_search"],
});

await writeFile("tool-names.json", JSON.stringify(next.manifest, null, 2));
```

### “I cannot persist a manifest”

Use `stable-hash-v1`. It emits a readable stem plus the full Base32 SHA-256 digest, so an identity keeps the same alias as unrelated tools are added without previous state.

```ts
const stateless = compileToolNames(tools, {
  allocation: "stable-hash-v1",
});
```

The tradeoff is deliberately visible: names are long, plain legal names are not preserved, and a stateless caller cannot remember retired aliases.

## Provider profiles

Profiles are versioned output contracts. An old profile never silently changes when a provider changes its documentation.

| Profile                 | Maximum | Intended surface                                        |
| ----------------------- | ------: | ------------------------------------------------------- |
| `portable-v1`           |      64 | Conservative OpenAI, Anthropic, and Gemini intersection |
| `strict-portable-v1`    |      63 | Conservative letter-first compatibility                 |
| `openai-v1`             |      64 | OpenAI-compatible function names                        |
| `anthropic-v1`          |      64 | Anthropic tool names                                    |
| `gemini-api-2026-08`    |     128 | Conservative Gemini Developer API round-trip subset     |
| `vertex-gemini-2026-08` |      64 | Vertex AI Gemini function declarations                  |
| `mcp-2025-11-25`        |     128 | MCP tool-name guidance                                  |
| `mcp-2026-07-28`        |     128 | MCP aggregation-era guidance                            |

Inspect a profile or validate an existing name without compiling a catalog:

```ts
import { getProfile, validateWireName } from "tool-name-codec";

getProfile("portable-v1");
validateWireName("search.code", "openai-v1");
// { ok: false, reasons: ["invalid-character"], profile: "openai-v1" }
```

## Stable identity and reverse routing

`id` must come from configuration or another application-owned identity boundary. Do not derive it only from a server's self-reported display name.

```ts
const catalog = compileToolNames(
  servers.flatMap((server) =>
    server.tools.map((tool) => ({
      id: `${server.configKey}/${tool.name}`,
      namespace: server.configKey,
      name: tool.name,
    })),
  ),
  { previousManifest, reserved: nativeToolNames },
);

const modelTools = Object.fromEntries(
  catalog.tools.map((entry) => [
    entry.wireName,
    {
      description: sourceById.get(entry.id).description,
      parameters: sourceById.get(entry.id).inputSchema,
      execute: (input) => callSource(entry.id, input),
    },
  ]),
);
```

`toWire(id)` resolves an active stable ID. `fromWire(name)` resolves an active alias for dispatch. `lookupWire(name)` also sees retired aliases for diagnostics, but retired aliases never dispatch.

## Migrate an existing alias table

Import current public names without rewriting them on day one:

```ts
import { planToolNameMigration } from "tool-name-codec";

const migration = planToolNameMigration(currentTools, [
  {
    id: "github/search",
    namespace: "github",
    name: "search.code",
    wireName: "mcp__github__search_code",
  },
]);

if (!migration.ok) {
  console.error(migration.conflicts);
  process.exitCode = 1;
} else {
  console.log(migration.plan); // preserved, generated, retired
  await saveManifest(migration.catalog.manifest);
}
```

Invalid, duplicate, or reserved legacy aliases are returned as reviewable conflicts. The planner never edits stored transcripts.

## Guarantees

- Valid output for the selected profile.
- Unique aliases across active, retired, and reserved names.
- Deterministic results independent of input order and locale.
- Exact reverse routing through the returned or serialized manifest.
- Stable existing aliases when a previous manifest is supplied.
- Non-reusable tombstones for removed aliases and historical reserved names.
- Typed failure when a stable ID changes its source identity.
- Bounded catalog, string, history, and manifest inputs.
- Frozen public manifests and entries.

## Deliberate boundaries

`tool-name-codec` does not:

- authenticate a server or treat its self-reported name as unique identity;
- authorize tools or infer provenance by parsing an alias;
- persist manifests or rewrite stored conversations;
- guarantee that application code behind an unchanged stable ID has the same behavior;
- refresh provider catalogs or make a catalog reload atomic with application routing;
- claim that a finite namespace can be collision-free without detection and typed exhaustion.

Those boundaries belong to the host. The package makes the name mapping explicit enough for the host to enforce them correctly.

## Runtime support

The package has zero runtime dependencies and no Node-only imports. It ships ESM, CommonJS, and TypeScript declarations and is tested in Node 18+, browsers, workers, Bun, and Deno.

See [integration recipes](./docs/integrations.md), [design and invariants](./docs/design.md), and the runnable [examples](./examples).

## Performance and limits

The release suite stress-tests 122,146 names across 2,000 randomized catalogs and reloads a 25,000-entry historical manifest. Defaults cap active catalogs at 10,000 entries, manifests at 25,000 entries, and total active source strings at four million UTF-16 code units.

The codec favors deterministic failure over silent truncation, alias reuse, or ambiguous dispatch.

## License

MIT © Atomics Hub
