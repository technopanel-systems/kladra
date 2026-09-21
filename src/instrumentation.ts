/**
 * Next's one hook that runs before the server serves anything, and the only
 * place a deployment mistake can be refused rather than reported.
 *
 * Nothing else belongs here. It is not a place for warming caches or opening
 * connections: the image builds with no `.env` (rules/deploy.md), and anything
 * that reads a secret or opens a socket while this module is evaluated builds
 * on a developer's machine and dies in the container.
 */
export async function register(): Promise<void> {
  // The edge runtime has no environment to check and never serves this app.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertSecureCookies } = await import("@/lib/deploy-check");
  assertSecureCookies();
}
