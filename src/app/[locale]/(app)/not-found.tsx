import { Trouble } from "@/components/shell/trouble";

/**
 * An address that names no screen — an old link, a mistyped one. One card
 * inside the shell, and a door home (§5 #20).
 */
export default function NotFound() {
  return <Trouble kind="missing" />;
}
