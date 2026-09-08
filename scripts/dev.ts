/**
 * `npm run dev` — the development server, on 3100 against `kladra`.
 *
 * It existed as one line in package.json until the fourth sighting of the same
 * failure. A `next dev` that has hot-reloaded through hours of edits grows
 * without plateau — 2.9 GB, then 6.7 GB, then 3.9 GB beside a running suite —
 * and the machine takes the memory back from whatever else is running. It has
 * now killed a full acceptance run twice, thirty minutes in each time, and the
 * second one took this server down with it (WORKFLOW §5 #68).
 *
 * `dev:test` has had the ceiling since P11J and 3100 did not, which is the
 * asymmetry README already warned about and nobody had closed. Four gigabytes
 * is far above what a healthy run of this codebase uses — about 600 MB fresh —
 * so it changes nothing until the server is already pathological, and then it
 * dies at once and says why instead of starving the machine.
 *
 * A script rather than `cross-env` in the npm line: this repo does not carry a
 * dependency for something fifteen lines of Node already does, and `dev:test`
 * is already exactly this shape.
 *
 * Bound to 127.0.0.1 like every other port Kladra opens (rules/deploy.md).
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = "3100";
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");

const child = spawn("npx", ["next", "dev", "-H", "127.0.0.1", "-p", PORT], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=4096"]
      .filter(Boolean)
      .join(" "),
  },
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
