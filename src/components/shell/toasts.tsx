"use client";

import { Toaster } from "@/components/ui/sonner";
import { useIsPhone } from "@/hooks/use-is-phone";

/**
 * Where the app's toasts stand: at the bottom corner a reader's line ends at,
 * and on a phone lifted clear of the bottom bar (S12.1).
 *
 * Measured at 375 before this: the toast sat 16px off the bottom edge, over
 * the bar's labels — and over a sheet's Save, which is the lowest thing in
 * every form on a phone (D129), so "could not reach the server" covered the
 * very button the rep had to press again. It is lifted 72px, plus the home
 * indicator: the bar is 57 and a sheet's Save stands 60 off the edge, so it
 * clears both with a gap a finger can see — the bar on a screen, Save in a
 * sheet. It stays at the bottom rather than moving to the top edge
 * because that is where the eye is when a form's answer arrives — on the
 * button it just pressed.
 *
 * The phone is the app's own line (`useIsPhone`, D128), not the toaster's:
 * sonner switches to its phone layout at 600px, and between 600 and 767 a
 * tablet has a bottom bar and would have had the desk's toast on top of it.
 * The swap happens after hydration, when there is no toast on screen to move.
 */
const ABOVE_THE_BAR = { bottom: "calc(4.5rem + env(safe-area-inset-bottom))" };

export function Toasts({ dir }: { dir: "ltr" | "rtl" }) {
  const phone = useIsPhone();
  const lift = phone ? ABOVE_THE_BAR : undefined;
  return (
    <Toaster position={dir === "rtl" ? "bottom-left" : "bottom-right"} offset={lift} mobileOffset={lift} />
  );
}
