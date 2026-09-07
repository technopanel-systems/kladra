import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // No client code calls a server action bare. React hands a REJECTED action —
  // no signal in a lobby, a deploy mid-request — to the error boundary, whether
  // it came from a form's useActionState or from a startTransition, and the
  // screen went with everything typed on it (DESIGN §5 "No answer is an
  // answer", D132). `const guarded = useWireGuard(); await guarded(fooAction)(…)`.
  {
    files: ["src/components/**/*.tsx", "src/app/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "AwaitExpression > CallExpression[callee.type='Identifier'][callee.name=/Action$/]",
          message:
            "A server action is never awaited bare from the client: const guarded = useWireGuard(); await guarded(fooAction)(…) — DESIGN §5 'No answer is an answer' (D132).",
        },
        {
          selector: "CallExpression[callee.name='useActionState'] > Identifier[name=/Action$/]",
          message:
            "useActionState takes the guarded action: useActionState(guarded(fooAction), null) — DESIGN §5 'No answer is an answer' (D132).",
        },
        {
          selector:
            "MemberExpression[property.name='then'] > CallExpression[callee.type='Identifier'][callee.name=/Action$/]",
          message:
            "A server action read with .then is bare too: guarded(fooAction)(…).then(…) — DESIGN §5 'No answer is an answer' (D132).",
        },
        {
          selector:
            "JSXAttribute[name.name='action'] > JSXExpressionContainer > Identifier[name=/Action$/][name!='formAction']",
          message:
            "A form action is a client call of a server action: guard it, or disable this line with the reason (the two that return void and end in a redirect are the standing exceptions) — DESIGN §5 (D132).",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // The test server's build directory — same artefacts, different name
    // (next.config.ts, NEXT_DIST_DIR).
    ".next-test/**",
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
