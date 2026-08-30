import {
  compileToolNames,
  getProfile,
  planToolNameMigration,
  ToolNameCodecError,
  validateWireName,
  type ToolNameManifest,
  type ToolNameProfileId,
} from "tool-name-codec";

const profile: ToolNameProfileId = "portable-v1";
const first = compileToolNames(
  [
    { id: "github/search", namespace: "github.com", name: "search.code" },
    { id: "gitlab/search", namespace: "gitlab.com", name: "search/code" },
  ],
  { profile, reserved: ["tool_search"] },
);

const manifest: ToolNameManifest = first.manifest;
const second = compileToolNames(
  first.tools.map((entry) => ({
    id: entry.id,
    name: entry.sourceName,
    ...(entry.namespace === undefined ? {} : { namespace: entry.namespace }),
  })),
  { previousManifest: manifest },
);

second.toWire("github/search");
second.fromWire(second.tools[0]!.wireName)?.sourceName;
validateWireName("search_code", profile).ok;
getProfile(profile).maxLength;

const migration = planToolNameMigration(
  [{ id: "github/search", name: "search.code" }],
  [{ id: "github/search", name: "search.code", wireName: "search_code" }],
);
if (migration.ok) migration.plan.preserved;
else migration.conflicts[0]?.code;

new ToolNameCodecError("EXAMPLE", "example", { profile });

// @ts-expect-error unknown profiles fail at compile time for typed callers
compileToolNames([], { profile: "future-profile" });
// @ts-expect-error entries require a caller-owned stable id
compileToolNames([{ name: "search" }]);
