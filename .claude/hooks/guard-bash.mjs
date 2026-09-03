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

// H12 — never docker stop/down/rm/kill/restart anything outside the compose
// project "kladra". A destructive docker verb must name kladra (the project
// flag, a kladra-* container, or run as `docker compose` from this repo whose
// compose file is `name: kladra`). Anything naming facet is refused outright.
// Each docker invocation is judged on its own segment, so an unrelated part of
// a long command cannot trip or excuse it.
for (const seg of command.match(/\bdocker\b[^\n|;&]*/gi) ?? []) {
  if (!/\b(?:stop|rm|rmi|kill|restart|down|prune)\b/i.test(seg)) continue;
  const namesFacet = /facet/i.test(seg);
  const namesKladra = /kladra/i.test(seg);
  const composeLocal = /\bdocker\s+compose\b/i.test(seg) && !/\s-f\s|--project-directory/i.test(seg);
  if (namesFacet || !(namesKladra || composeLocal)) {
    deny(
      "H12 (CLAUDE.md § FACET)",
      "destructive docker command outside the compose project \"kladra\": `" +
        seg.trim() +
        "`. Name the kladra project or container explicitly; FACET's containers, " +
        "port 3000, port 5432 and its tunnel are never touched from Kladra.",
    );
  }
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
