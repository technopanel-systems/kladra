/**
 * The signed-out shell: no rail, no top bar, nothing to click but the form.
 * The canvas glow is on <body> (globals.css), so this only has to centre.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-5 py-12">
      {children}
    </main>
  );
}
