-- Every quotation names a job (P12-10, SPEC §3 S18).
--
-- "Every quotation belongs to a project." The form has refused one without a
-- job since P12-9, and the column stayed optional behind it — so the shape the
-- app could no longer produce went on existing everywhere that read the column:
-- eighteen left joins, four nullable types, and the dashes the screens drew in
-- place of a name. A column looser than the form is the wrong way round
-- (rules/data.md): the column is the guard for the ways in that are not the app.
--
-- The one seeded row that had no job was the workshop buying a few sheets to
-- cut up — the nearest thing this floor has to a sale off the shelf. It is a
-- job now, named for what it is (`ألواح تشكيل - طلبية ورشة`, fifty metres, so it
-- moves no figure anybody reads). There is no production data to widen, and the
-- suite clears before it migrates: on a table with rows in it this is meant to
-- fail rather than guess a job for somebody's price.
--
-- The foreign key is rewritten to drop `on delete set null`. A project is
-- archived and never deleted here, so that clause only ever said "if a job is
-- somehow removed, quietly detach its quotations" — which is the one outcome
-- S18 forbids, arriving silently. Plain `no action` refuses the delete instead.

ALTER TABLE "quotations" DROP CONSTRAINT "quotations_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "quotations" ALTER COLUMN "project_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;