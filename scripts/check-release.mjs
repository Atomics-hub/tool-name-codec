import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const changelog = await readFile(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
);

assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
assert.ok(
  changelog.includes(`## ${packageJson.version} -`),
  "CHANGELOG has no heading for package version",
);
assert.equal(packageJson.publishConfig?.access, "public");
assert.equal(packageJson.publishConfig?.provenance, true);

const releaseTag = process.env.RELEASE_TAG;
if (releaseTag) assert.equal(releaseTag, `v${packageJson.version}`);

console.log(
  `release metadata valid for tool-name-codec@${packageJson.version}`,
);
