# Integration recipes

The codec sits between source-tool discovery and the model-provider catalog. Keep source schemas and execution closures in host-owned state; use the manifest only for stable public names and reverse lookup.

## Multi-server MCP client

```ts
const sourceById = new Map();
const entries = [];

for (const server of configuredServers) {
  const discovered = await server.client.listTools();
  for (const tool of discovered.tools) {
    const id = `${server.configKey}/${tool.name}`;
    sourceById.set(id, { server, tool });
    entries.push({ id, namespace: server.configKey, name: tool.name });
  }
}

const catalog = compileToolNames(entries, {
  profile: "portable-v1",
  previousManifest,
  reserved: nativeToolNames,
});

const exposed = catalog.tools.map((entry) => ({
  name: entry.wireName,
  description: sourceById.get(entry.id).tool.description,
  inputSchema: sourceById.get(entry.id).tool.inputSchema,
}));

async function dispatch(modelCall) {
  const route = catalog.fromWire(modelCall.name);
  if (!route) throw new Error(`Unknown or retired tool: ${modelCall.name}`);
  const source = sourceById.get(route.id);
  return source.server.client.callTool({
    name: route.sourceName,
    arguments: modelCall.arguments,
  });
}
```

Do not reconstruct the source route by splitting the alias. Use `fromWire()`.

## Vercel AI SDK-style tool records

The AI SDK accepts a record keyed by the model-facing tool name. Compile before constructing that record and close over the stable ID.

```ts
const catalog = compileToolNames(
  sourceTools.map((tool) => ({
    id: tool.id,
    namespace: tool.serverKey,
    name: tool.sourceName,
  })),
  { previousManifest },
);

const tools = Object.fromEntries(
  catalog.tools.map((entry) => {
    const source = sourceById.get(entry.id);
    return [
      entry.wireName,
      {
        description: source.description,
        inputSchema: source.inputSchema,
        execute: (input) => source.execute(input),
      },
    ];
  }),
);
```

The execution closure remains host-owned. The codec does not store executable functions in the manifest.

## OpenAI or Anthropic request construction

```ts
const catalog = compileToolNames(entries, {
  profile: "openai-v1", // or "anthropic-v1"
  previousManifest,
  reserved: builtInProviderTools,
});

const definitions = catalog.tools.map((entry) => ({
  type: "function",
  function: {
    name: entry.wireName,
    description: sourceById.get(entry.id).description,
    parameters: sourceById.get(entry.id).jsonSchema,
  },
}));
```

On the response path, reject any name for which `fromWire()` returns `undefined`. That includes retired aliases by design.

## Atomic catalog reload

Compile a complete candidate snapshot before publishing it to request handlers:

```ts
const next = compileToolNames(discoveredEntries, {
  previousManifest: activeSnapshot.manifest,
  reserved: nativeToolNames,
});

const nextRoutes = buildRoutes(next, discoveredSources);

activeSnapshot = Object.freeze({
  codec: next,
  routes: nextRoutes,
  manifest: next.manifest,
});
```

Compilation does not make application state atomic. Swap the codec, schemas, and execution routes together inside the host's own snapshot or generation mechanism.

## Persisting manifests

Write manifests atomically: serialize to a temporary file, flush when durability matters, then rename over the previous file. Database-backed hosts should commit the manifest in the same transaction as the catalog generation that references it.

Never edit aliases manually after compilation. To adopt an existing alias table, use `planToolNameMigration()` and review all conflicts first.
