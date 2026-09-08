-- A dispatch is raised, and THEN approved. The demo built the two instants on two
-- clocks — working days back from today for the raising, a fixed day of this
-- month for the approval — and past the first days of a month they crossed, so
-- two seeded dispatches were approved the day before they were asked for. No
-- screen read them in order until P11J put a trail on the drawer, and then it
-- printed "Approved" above "Requested". The app cannot write this; a seed, a
-- migration or an import can.
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_approved_after_created_check" CHECK ("dispatches"."approved_at" is null or "dispatches"."approved_at" >= "dispatches"."created_at");
