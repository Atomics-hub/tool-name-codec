import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { compileToolNames, validateWireName } from "./src/index.mjs";

const modulePath = process.argv[2];
if (!modulePath) {
  throw new Error(
    "usage: node compare-nestm.mjs /absolute/path/to/@nestm/mcp-gateway/dist/index.mjs",
  );
}

const { GatewayNameCodec } = await import(pathToFileURL(modulePath));
const gateway = new GatewayNameCodec();
const openAiShape = /^[A-Za-z0-9_-]{1,64}$/;

const ordinary = gateway.encode("github.com", "search.code");
assert.equal(gateway.decode(ordinary).upstreamName, "github.com");
assert.equal(gateway.decode(ordinary).toolName, "search.code");
assert.equal(openAiShape.test(ordinary), false);

let longPairError;
try {
  gateway.encode("server".repeat(20), "tool".repeat(20));
} catch (error) {
  longPairError = error;
}
assert.ok(
  longPairError,
  "the stateless gateway codec must reject a pair that cannot fit in 128 characters",
);

const first = compileToolNames(
  [{ id: "github/search", namespace: "github.com", name: "search.code" }],
  { profile: "portable-v1" },
);
const expanded = compileToolNames(
  [
    { id: "github/search", namespace: "github.com", name: "search.code" },
    { id: "gitlab/search", namespace: "gitlab.com", name: "search/code" },
    { id: "long", namespace: "server".repeat(20), name: "tool".repeat(20) },
  ],
  { profile: "portable-v1", previousManifest: first.manifest },
);

assert.equal(expanded.toWire("github/search"), first.toWire("github/search"));
for (const id of ["github/search", "gitlab/search", "long"]) {
  const alias = expanded.toWire(id);
  assert.equal(validateWireName(alias, "portable-v1").ok, true);
  assert.equal(expanded.fromWire(alias).id, id);
}

console.log(
  JSON.stringify(
    {
      nestmOrdinary: ordinary,
      nestmOrdinaryLength: ordinary.length,
      nestmValidForOpenAiAndAnthropic: openAiShape.test(ordinary),
      nestmLongPairErrorCode: longPairError?.code,
      candidateAliases: Object.fromEntries(
        ["github/search", "gitlab/search", "long"].map((id) => [
          id,
          expanded.toWire(id),
        ]),
      ),
      candidateOldAliasStable:
        expanded.toWire("github/search") === first.toWire("github/search"),
      candidateManifestEntries: expanded.manifest.entries.length,
    },
    null,
    2,
  ),
);
