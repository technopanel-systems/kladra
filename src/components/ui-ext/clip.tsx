import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * A name somebody typed, cut to fit its place at its OWN end (P13-G6).
 *
 * The app's old run for this, a `truncate` box round a `<bdi>`, keeps the
 * page's direction on the box, so the box clips at the PAGE's end. A name in
 * the other script lost its first word, not its last. On an English screen
 * «مكتب المعمار الحديث للاستشارات الهندسية» read «…المعمار الحديث للاستشارات
 * الهندسية», which is another company, and «عبدالرحمن الزهراني» lost
 * «عبدالرحمن». S12.1 found it in the palette and S12.8 in the team's reports;
 * it was in seventeen places.
 *
 * Here the box takes the name's own direction (`dir="auto"`, which also
 * isolates it as a `<bdi>` would). The box is never wider than its text, so
 * the name still sits where the page's layout puts it and only the ellipsis
 * moves. So it carries no `flex-1`, `grow` or width of its own: give the spare
 * width to a wrapper (`<span className="flex min-w-0 flex-1"><Clip …/></span>`).
 * `column` is for a child of a flex column, which would otherwise stretch it
 * and set the name against the far edge. It carries no margin either: `ms-auto`
 * on a box of the other direction resolves to the other side.
 */
export function Clip({
  text,
  column = false,
  className,
  ...rest
}: Omit<ComponentProps<"span">, "children" | "dir"> & {
  text: string;
  /** A child of a flex column: start-aligned and capped, never stretched. */
  column?: boolean;
}) {
  return (
    <span
      dir="auto"
      className={cn(
        "min-w-0 truncate",
        column && "max-w-full self-start",
        className,
      )}
      {...rest}
    >
      {text}
    </span>
  );
}
