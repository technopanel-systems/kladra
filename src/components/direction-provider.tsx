"use client";

import { Direction } from "radix-ui";

/**
 * Radix reads direction from context for keyboard handling and positioning;
 * <html dir> alone only steers CSS. Wrap the tree once, in the root layout.
 */
export function DirectionProvider({
  dir,
  children,
}: {
  dir: "ltr" | "rtl";
  children: React.ReactNode;
}) {
  return <Direction.Provider dir={dir}>{children}</Direction.Provider>;
}
