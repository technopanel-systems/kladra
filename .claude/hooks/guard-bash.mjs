#!/usr/bin/env node
/**
 * PreToolUse guard for Bash.
 *
 * H11 — coordination frameworks by name. claude-flow was installed twice in
 * the FACET era and removed twice, leaving a memory store that loaded into
 * twenty sessions unaudited. Claude Code's own subagents and hooks are the
 * only sanctioned mechanisms (CLAUDE.md § How we work).
 *
 * H12 — never touch FACET's running containers, ports or files from a shell.
 *
 * Exit 2 + stderr is the documented block contract for PreToolUse.
 */

import fs from "node:fs";

let input;
try {
  input = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}

const command = input.tool_input?.command ?? "";

function deny(rule, message) {
  process.stderr.write(`${rule}: ${message}`);
  process.exit(2);
}

// H11 — the named offenders, install or invoke, any package manager. Matched
// at command or install position only: a commit message that MENTIONS the name
// is not an invocation.
const frameworkInvocation =
  /(?:^|[;&|]\s*)(?:claude-flow|ruflo|ruv-swarm)\b|\b(?:npx|bunx)\s+(?:-{1,2}\S+\s+)*(?:claude-flow|ruflo|ruv-swarm)\b|\b(?:npm\s+(?:i|install|add)|yarn\s+(?:add|dlx)|pnpm\s+(?:add|dlx))\s+(?:-{1,2}\S+\s+)*(?:claude-flow|ruflo|ruv-swarm)\b/i;
if (frameworkInvocation.test(command)) {
  deny(
    "H11 (CLAUDE.md § How we work)",
    "claude-flow / ruflo / swarm frameworks are banned by name. Claude Code's " +
      "own subagents and hooks are the sanctioned mechanisms.",
  );
}

// H12 — FACET's containers are not ours. Stopping, removing or restarting
// anything named facet-crm-* from this repo is refused.
if (/\bdocker\b[^\n]*\b(?:stop|rm|kill|restart|down|compose\s+down)\b[^\n]*\bfacet/i.test(command)) {
  deny(
    "H12 (CLAUDE.md § FACET)",
    "docker command targets a FACET container. FACET's containers, port 3000, " +
      "port 5432 and its tunnel are never touched from Kladra.",
  );
}
if (/\b(?:rm|del|rmdir|Remove-Item|mv|move)\b[^\n]*facet-crm/i.test(command)) {
  deny(
    "H12 (CLAUDE.md § FACET)",
    "shell command would remove or move something under C:\\dev\\facet-crm. " +
      "FACET is a read-only reference library.",
  );
}
if (/>\s*["']?(?:\/c|c:)[\/\\]dev[\/\\]facet-crm/i.test(command)) {
  deny(
    "H12 (CLAUDE.md § FACET)",
    "shell redirect writes into C:\\dev\\facet-crm. FACET is read-only.",
  );
}

process.exit(0);
