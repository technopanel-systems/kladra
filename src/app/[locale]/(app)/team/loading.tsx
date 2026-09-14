import { WorkTabSkeleton } from "@/components/team/work-skeleton";

/**
 * The manager's screen while it reads: the company's month, the strip of what
 * is in play and stuck, and the stuck groups as cards (P13-S8).
 */
export default function TeamLoading() {
  return <WorkTabSkeleton tabs={3} strip />;
}
