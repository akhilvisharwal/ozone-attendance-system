import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(repoRoot, "qa", ".env.qa");

if (existsSync(envPath)) {
  const result = dotenv.config({ path: envPath, override: false, quiet: true });
  if (result.error) throw result.error;
  console.log("Loaded QA environment from qa/.env.qa");
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error("Run QA tasks through an npm script so npm_execpath is available.");
}
const npmCommand = (...args) => [process.execPath, npmCli, ...args];
const playwrightCommand = (...args) => [
  process.execPath,
  path.join(repoRoot, "node_modules", "playwright", "cli.js"),
  ...args,
];
const task = process.argv[2];
const forwardedArgs = process.argv.slice(3);

const commands = {
  lint: [
    npmCommand("--prefix", "backend", "run", "lint"),
    npmCommand("--prefix", "frontend", "run", "lint"),
  ],
  typecheck: [
    npmCommand("--prefix", "backend", "run", "lint"),
    npmCommand("--prefix", "frontend", "exec", "tsc", "-b"),
  ],
  test: [
    npmCommand("--prefix", "backend", "test"),
    npmCommand("--prefix", "frontend", "test"),
  ],
  "test:http": [npmCommand("--prefix", "backend", "run", "test:http")],
  build: [
    npmCommand("--prefix", "backend", "run", "build"),
    npmCommand("--prefix", "frontend", "run", "build"),
  ],
  migrate: [npmCommand("--prefix", "backend", "run", "migrate")],
  e2e: [playwrightCommand("test", ...forwardedArgs)],
  "e2e:smoke": [
    playwrightCommand(
      "test",
      "qa/smoke.spec.ts",
      "--project=chromium",
      ...forwardedArgs
    ),
  ],
};

if (task === "gate") {
  commands.gate = [...commands.lint, ...commands.test, ...commands.build];
}

const selected = commands[task];
if (!selected) {
  console.error(`Unknown QA task: ${task ?? "(missing)"}`);
  process.exit(2);
}

for (const [command, ...args] of selected) {
  const childEnv =
    task === "test" || task === "gate"
      ? { ...process.env, SKIP_DB_TESTS: process.env.SKIP_DB_TESTS ?? "1" }
      : process.env;
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: childEnv,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
