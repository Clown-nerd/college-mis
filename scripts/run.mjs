import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "development" && mode !== "production") {
  throw new Error("Usage: node scripts/run.mjs <development|production>");
}

const args = mode === "development"
  ? [fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url)), "server/_core/index.ts"]
  : ["dist/index.js"];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: mode },
});

const forwardSignal = (signal) => {
  if (!child.killed) {
    child.kill(signal);
  }
};
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("SIGINT", () => forwardSignal("SIGINT"));

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
