"use client";

import { useEffect, type ReactNode } from "react";
import { useLiveOptional } from "@/components/live/live-provider";
import { useArrived } from "@/hooks/use-arrived";
import { cn } from "@/lib/utils";

/**
 * One entry of a report list, able to take the arrived flash (DESIGN §2, §8).
 *
 * The list is drawn on the server, and a report's live event names its company
 * rather than the entry, so the report a rep had just written landed without a
 * mark and after "Report added" he read the list to find it. An entry that
 * mounts tells the channel its rows are on screen (`landed`): the id the report
 * dialog said to expect starts its two seconds on the entry as it now reads.
 */
export function ArrivedEntry({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const arrived = useArrived(id);
  const landed = useLiveOptional()?.landed;
  useEffect(() => {
    landed?.();
  }, [landed]);
  return (
    <li data-slot="report-entry" className={cn(className, arrived && "row-arrived")}>
      {children}
    </li>
  );
}
