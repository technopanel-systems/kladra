-- A target says who earns (P14, founder: “a rep whose target is zero earns no share of any
-- quotation or dispatch”).
--
-- The tick beside the target is the exception the founder asked for in the same breath: a
-- zero-target person who is nonetheless sharing the work. It sits on the target row, not on the
-- user, because it is a month's answer like the target beside it — somebody who covers a floor
-- in August and sells in September is two answers, and a flag on the person would be one.
--
-- Default false, and no backfill: every seeded person who sells has a target above zero and is
-- unaffected, and a person who has none is exactly the case the founder is describing.

ALTER TABLE "targets" ADD COLUMN "shares" boolean DEFAULT false NOT NULL;
