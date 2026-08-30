import { planToolNameMigration } from "tool-name-codec";

const result = planToolNameMigration(
  [
    { id: "github/search", namespace: "github", name: "search.code" },
    { id: "gitlab/search", namespace: "gitlab", name: "search/code" },
  ],
  [
    {
      id: "github/search",
      namespace: "github",
      name: "search.code",
      wireName: "mcp__github__search_code",
    },
  ],
);

console.log(JSON.stringify(result, null, 2));
