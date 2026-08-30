import { compileToolNames, validateWireName } from "./src/index.mjs";

self.onmessage = () => {
  const catalog = compileToolNames(
    [
      { id: "one", namespace: "server.one", name: "search/code" },
      { id: "two", namespace: "server.two", name: "search.code" },
    ],
    { profile: "portable-v1", reserved: ["tool_search"] },
  );

  const aliases = catalog.tools.map(({ wireName }) => wireName);
  const stable = compileToolNames(
    [{ id: "one", namespace: "server.one", name: "search/code" }],
    { profile: "portable-v1", allocation: "stable-hash-v1" },
  );
  const stableGrown = compileToolNames(
    [
      { id: "two", namespace: "server.two", name: "search.code" },
      { id: "one", namespace: "server.one", name: "search/code" },
    ],
    { profile: "portable-v1", allocation: "stable-hash-v1" },
  );
  self.postMessage({
    process: typeof globalThis.process,
    Buffer: typeof globalThis.Buffer,
    unique: new Set(aliases).size === 2,
    valid: aliases.every((name) => validateWireName(name, "portable-v1").ok),
    reversible: aliases.every(
      (name) => catalog.fromWire(name)?.wireName === name,
    ),
    serializable:
      JSON.parse(JSON.stringify(catalog.manifest)).entries.length === 2,
    statelessStable: stable.toWire("one") === stableGrown.toWire("one"),
    manifestDeepFrozen:
      Object.isFrozen(catalog.manifest) &&
      Object.isFrozen(catalog.manifest.entries) &&
      catalog.manifest.entries.every(
        (entry) => Object.isFrozen(entry) && Object.isFrozen(entry.reasons),
      ),
  });
};
