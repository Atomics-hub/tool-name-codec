import assert from "node:assert/strict";
import test from "node:test";
import { compileToolNames } from "../src/index.mjs";

test("a multi-server model catalog dispatches colliding names to the original MCP route", async () => {
  const calls = [];
  const servers = [
    {
      configKey: "github.com",
      tools: [{ name: "search.code", description: "Search GitHub" }],
    },
    {
      configKey: "gitlab.com",
      tools: [{ name: "search/code", description: "Search GitLab" }],
    },
  ];
  const sourceById = new Map();
  const entries = [];

  for (const server of servers) {
    for (const tool of server.tools) {
      const id = `${server.configKey}/${tool.name}`;
      entries.push({ id, namespace: server.configKey, name: tool.name });
      sourceById.set(id, {
        ...tool,
        async execute(input) {
          calls.push({ server: server.configKey, tool: tool.name, input });
          return { ok: true };
        },
      });
    }
  }

  const catalog = compileToolNames(entries, {
    profile: "portable-v1",
    reserved: ["web_search"],
  });
  const modelTools = Object.fromEntries(
    catalog.tools.map((entry) => {
      const source = sourceById.get(entry.id);
      return [
        entry.wireName,
        {
          description: source.description,
          execute: (input) => source.execute(input),
        },
      ];
    }),
  );

  assert.equal(Object.keys(modelTools).length, 2);
  assert.equal(new Set(Object.keys(modelTools)).size, 2);
  for (const tool of catalog.tools) {
    await modelTools[tool.wireName].execute({ query: tool.id });
  }
  assert.deepEqual(calls, [
    {
      server: "github.com",
      tool: "search.code",
      input: { query: "github.com/search.code" },
    },
    {
      server: "gitlab.com",
      tool: "search/code",
      input: { query: "gitlab.com/search/code" },
    },
  ]);
});

test("an atomic catalog generation keeps old aliases and refuses retired dispatch", () => {
  const first = compileToolNames([
    { id: "github/search", namespace: "github", name: "search.code" },
    { id: "gitlab/search", namespace: "gitlab", name: "search/code" },
  ]);
  const firstGithubAlias = first.toWire("github/search");
  const retiredGitlabAlias = first.toWire("gitlab/search");

  const next = compileToolNames(
    [
      { id: "github/search", namespace: "github", name: "search.code" },
      { id: "native/search", namespace: "native", name: "search code" },
    ],
    { previousManifest: JSON.parse(JSON.stringify(first.manifest)) },
  );

  assert.equal(next.toWire("github/search"), firstGithubAlias);
  assert.equal(next.fromWire(retiredGitlabAlias), undefined);
  assert.equal(next.lookupWire(retiredGitlabAlias)?.status, "retired");
  assert.notEqual(next.toWire("native/search"), retiredGitlabAlias);
});
