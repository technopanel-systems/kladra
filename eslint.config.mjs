import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Test artefacts. `playwright-report/` carries the trace viewer's own
    // minified bundle, and a failing run therefore turned `npm run lint` into
    // three thousand problems in somebody else's code — with our own hidden
    // among them. ESLint's flat config does not read .gitignore, so being
    // gitignored is not enough (rules/data.md: a check that cries wolf is a
    // check nobody reads).
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
    "shots/**",
    ".playwright-cli/**",
  ]),
]);

export default eslintConfig;
