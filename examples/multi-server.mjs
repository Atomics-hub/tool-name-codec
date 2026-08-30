import { compileToolNames } from "tool-name-codec";

const sourceTools = [
  { id: "github/search", namespace: "github.com", name: "search.code" },
  { id: "gitlab/search", namespace: "gitlab.com", name: "search/code" },
];

const catalog = compileToolNames(sourceTools, {
  profile: "portable-v1",
  reserved: ["web_search"],
});

for (const tool of catalog.tools) {
  console.log(`${tool.id} -> ${tool.wireName}`);
}

const simulatedModelCall = catalog.toWire("github/search");
console.log(catalog.fromWire(simulatedModelCall));
