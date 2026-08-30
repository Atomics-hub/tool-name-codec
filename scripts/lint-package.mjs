import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const environment = {
  ...process.env,
  npm_config_cache: resolve(".npm-cache"),
};

for (const [command, arguments_] of [
  ["publint", []],
  ["attw", ["--pack", "."]],
]) {
  const result = spawnSync(command, arguments_, {
    env: environment,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
