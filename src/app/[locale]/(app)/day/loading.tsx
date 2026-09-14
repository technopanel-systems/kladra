import { WorkTabSkeleton } from "@/components/team/work-skeleton";

/**
 * A person's day while it reads: the month, then what came back and who to call
 * as cards (P13-S8).
 */
export default function DayLoading() {
  return <WorkTabSkeleton tabs={2} />;
}
