#!/usr/bin/env node
/**
 * PreToolUse guard for Write | Edit | NotebookEdit.
 *
 * Enforces the Kladra prohibitions CLAUDE.md can only state as prose. Each
 * check is numbered (H1-H9) and the deny message names the rule so a blocked
 * session can cite it. Exit 2 + stderr is the documented block contract.
 *
 * An Edit is denied only when the offending token is INTRODUCED — present in
 * new_string and absent from old_string — so moving existing code never trips
 * a guard the original site did not.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const raw = fs.readFileSync(0, "utf8");
let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // unparseable input is the harness's problem, never a block
}

const toolInput = input.tool_input ?? {};
const filePath = toolInput.file_path ?? toolInput.notebook_path;
if (!filePath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const norm = (p) => path.resolve(p).replace(/\\/g, "/").toLowerCase();
const repo = norm(projectDir);
const target = norm(path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath));

function deny(rule, message) {
  process.stderr.write(`${rule}: ${message}`);
  process.exit(2);
}

// H0 — FACET is a read-only reference library. Never write into it.
if (/^(?:[a-z]:|\/[a-z])\/(?:projects|dev)\/facet-crm(?:\/|$)/.test(target)) {
  deny(
    "H0 (CLAUDE.md § FACET)",
    `write into the FACET reference library refused: ${filePath}. FACET is read-only.`,
  );
}

// H1 — no write outside the repository. Guidance and records live in git or
// they do not exist. The session scratchpad and OS temp are the only
// sanctioned outside locations.
if (!target.startsWith(repo + "/") && target !== repo) {
  const temp = norm(os.tmpdir());
  const inTemp =
    target.startsWith(temp + "/") ||
    target.includes("/appdata/local/temp/") ||
    target.startsWith("/tmp/");
  if (!inTemp) {
    deny(
      "H1 (CLAUDE.md § How we work)",
      `write outside the repository: ${filePath}. Records live in git or in the ` +
        `session scratchpad; nowhere else.`,
    );
  }
  process.exit(0); // temp writes are sanctioned; no further checks apply
}

const rel = target.slice(repo.length + 1);

// H2 — five authority files only. SPEC.md, DESIGN.md, WORKFLOW.md, CLAUDE.md,
// README.md. Skills, rules and agents under .claude/ are not documents.
// Editing an existing file is never blocked here.
if (rel.endsWith(".md") && !fs.existsSync(target)) {
  const allowedPrefixes = [".claude/", "node_modules/"];
  const allowedExact = new Set(["claude.md", "spec.md", "design.md", "workflow.md", "readme.md"]);
  const ok = allowedExact.has(rel) || allowedPrefixes.some((p) => rel.startsWith(p));
  if (!ok) {
    deny(
      "H2 (CLAUDE.md § Five files)",
      `new document refused: ${rel}. Kladra has five authority files — SPEC.md, ` +
        `DESIGN.md, WORKFLOW.md, CLAUDE.md, README.md. Decisions go into SPEC.md ` +
        `§4; how-it-looks into DESIGN.md; process into WORKFLOW.md.`,
    );
  }
}

// The added text: Write = whole content, Edit = new_string. The prior text is
// what makes "introduced" testable.
const added = toolInput.content ?? toolInput.new_string ?? "";
let prior = toolInput.old_string ?? "";
if (toolInput.content !== undefined && fs.existsSync(target)) {
  try {
    prior = fs.readFileSync(target, "utf8");
  } catch {
    prior = "";
  }
}
const introduces = (re) => re.test(added) && !re.test(prior);

const isSrcCode = rel.startsWith("src/") && /\.(ts|tsx)$/.test(rel);

if (isSrcCode) {
  // H3 — physical Tailwind utilities are a layout bug in Arabic.
  const physical =
    /(?:^|[\s"'`{:(])(?:-?(?:ml|mr|pl|pr)-(?:\d|px|auto|\[)|text-left\b|text-right\b|border-[lr]\b|(?:left|right)-(?:\d|px|auto|full|\[))/m;
  if (introduces(physical)) {
    deny(
      "H3 (DESIGN.md § Principles, RTL)",
      `physical Tailwind utility introduced in ${rel}. Use logical utilities — ` +
        `ms-*/me-*, ps-*/pe-*, text-start/text-end, start-*/end-*, border-s/border-e. ` +
        `A physical utility is a layout bug in Arabic.`,
    );
  }

  // H4 — a logical margin on an element that itself carries dir resolves
  // against the element's OWN direction and lands on the wrong side.
  const dirMargin =
    /<[a-zA-Z][^>]*\bdir=[^>]*[\s"'`{:]-?(?:ms|me)-|<[a-zA-Z][^>]*[\s"'`{:]-?(?:ms|me)-[^>]*\bdir=/;
  if (introduces(dirMargin)) {
    deny(
      "H4 (DESIGN.md § Principles, RTL)",
      `ms-*/me-* on an element that itself carries dir, in ${rel}. Where a flex ` +
        `parent supplies a gap, delete the margin; otherwise move it onto a ` +
        `neighbour carrying no dir.`,
    );
  }

  // H5 — raw Next navigation imports drop the locale prefix, silently.
  if (!rel.startsWith("src/i18n/")) {
    const nextLink = /from\s+["']next\/link["']/;
    const nextNav =
      /import\s+(?:type\s+)?\{[^}]*\b(?:redirect|useRouter|usePathname|Link)\b[^}]*\}\s*from\s+["']next\/navigation["']/s;
    if (introduces(nextLink) || introduces(nextNav)) {
      deny(
        "H5 (README § Both locales)",
        `raw next/link or next/navigation import of Link/redirect/usePathname/` +
          `useRouter in ${rel}. Import them from @/i18n/navigation — the raw ` +
          `versions drop the locale prefix. (notFound from next/navigation is fine.)`,
      );
    }
  }

  // H6 / H7 — the two silent ways SQL loses Riyadh's "today".
  if (introduces(/\bcurrent_date\b/i)) {
    deny(
      "H6 (.claude/rules/data.md)",
      `current_date introduced in ${rel}. That is the SERVER's UTC day, one ` +
        `behind Riyadh until 03:00. Write (now() at time zone 'Asia/Riyadh')::date.`,
    );
  }
  if (introduces(/::\s*date\s+at\s+time\s+zone/i)) {
    deny(
      "H7 (.claude/rules/data.md)",
      `"::date at time zone" introduced in ${rel}. On a bare date AT TIME ZONE ` +
        `lifts to midnight-UTC then STRIPS the zone. The safe shape is ` +
        `\${day}::date::timestamp at time zone 'Asia/Riyadh'.`,
    );
  }
}

// H8 — no database RLS. One authorization layer, in application code.
if (rel.startsWith("drizzle/") || rel.startsWith("src/db/")) {
  if (introduces(/\bcreate\s+policy\b|\benable\s+row\s+level\s+security\b/i)) {
    deny(
      "H8 (.claude/rules/data.md)",
      `row-level security introduced in ${rel}. Kladra has one authorization ` +
        `layer, in application code. No database policies.`,
    );
  }
}

// H9 — container ports publish on loopback only (README § Deployment: the app
// is 127.0.0.1-bound so Cloudflare Access cannot be skipped over the LAN).
if (rel === "docker-compose.yml") {
  if (introduces(/["']\d{2,5}:\d{2,5}["']/)) {
    deny(
      "H9 (.claude/rules/deploy.md)",
      `a port mapping without a loopback prefix in docker-compose.yml. Publish ` +
        `as "127.0.0.1:3100:3100" / "127.0.0.1:5433:5432" — a bare "PORT:PORT" ` +
        `binds 0.0.0.0 and answers on the LAN, skipping Cloudflare Access.`,
    );
  }
}

process.exit(0);
