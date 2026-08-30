import {
  compileToolNames,
  planToolNameMigration,
  validateWireName,
} from "./src/index.mjs";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

const initial = compileToolNames([
  { id: "weather", name: "get.weather" },
  { id: "billing", namespace: "payments/v2", name: "charge card" },
]);

for (const tool of initial.tools) {
  invariant(
    validateWireName(tool.wireName).ok,
    `invalid wire name: ${tool.wireName}`,
  );
  invariant(
    initial.fromWire(tool.wireName)?.id === tool.id,
    `reverse-map failure: ${tool.id}`,
  );
}

const changed = compileToolNames(
  [
    { id: "weather", name: "get.weather" },
    { id: "search", name: "get/weather" },
  ],
  { previousManifest: JSON.parse(JSON.stringify(initial.manifest)) },
);

invariant(
  changed.toWire("weather") === initial.toWire("weather"),
  "catalog growth renamed an existing tool",
);
invariant(
  changed.fromWire(initial.toWire("billing")) === undefined,
  "retired alias remained dispatchable",
);
invariant(
  changed.lookupWire(initial.toWire("billing"))?.status === "retired",
  "retired alias was not tombstoned",
);

const migration = planToolNameMigration(
  [{ id: "legacy", name: "search/tool" }],
  [{ id: "legacy", name: "search/tool", wireName: "search_tool_v1" }],
);

invariant(migration.ok, "legacy migration failed");
invariant(
  migration.catalog.toWire("legacy") === "search_tool_v1",
  "legacy alias changed",
);

console.log(
  JSON.stringify({
    ok: true,
    runtime: globalThis.Bun
      ? `bun-${Bun.version}`
      : globalThis.Deno
        ? `deno-${Deno.version.deno}`
        : `node-${process.version}`,
    active: changed.tools.length,
    historical: changed.manifest.entries.length,
  }),
);
