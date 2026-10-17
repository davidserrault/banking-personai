import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
const commands = [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  [
    "--import",
    "tsx",
    "--test",
    ...readdirSync("tests")
      .filter((name) => name.endsWith(".test.ts"))
      .map((name) => `tests/${name}`),
  ],
  ["node_modules/vite/bin/vite.js", "build"],
];
for (const args of commands) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
