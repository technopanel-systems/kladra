import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Points the plugin at our request config (messages/<locale>/*.json merged there).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle so the Docker runtime stage does not
  // need node_modules. See Dockerfile.
  output: "standalone",

  // Next 16 takes an exclusive lock at `<distDir>/lock` and refuses to start a
  // second dev server in the same directory. The test server (3101, database
  // kladra_test) has to run alongside the developer's (3100), so it gets its
  // own build directory and therefore its own lock. Only scripts/dev-test.ts
  // sets this; every other command builds into `.next` as usual.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  // `next dev` otherwise appends a self-re-adding block to CLAUDE.md on every
  // start. CLAUDE.md is one of the five authority files and is hand-written,
  // not a generated artefact. The Next 16 docs it points at are still readable
  // at node_modules/next/dist/docs/ — the README says so instead.
  agentRules: false,
};

export default withNextIntl(nextConfig);
