-- A lead is an assignment, and an assignment is a company (SPEC §3, P12-7).
--
-- "Marketing does not use the Add company form. Marketing has its own module
-- for bringing in a lead, and creating one there IS an assignment: it goes to a
-- chosen rep, or to a member of the marketing team."
--
-- So there is no second table waiting to become the first. A lead IS a company,
-- on somebody's floor from the second it is filed, and these three columns are
-- the whole of what makes it one: who found it, what the customer asked for,
-- and whether the person it was given to has said he has it. Everything the app
-- already does to a company — the log, the follow-up, a project, a quotation —
-- works on a lead the moment it lands, which a separate table would have had to
-- reinvent or convert into.
--
-- The checks say the three are one fact. A lead with nothing the customer asked
-- for is a name and a phone number, which is what Add company is already for;
-- and an acknowledgement of a lead nobody gave is a state that never happened.

ALTER TABLE "companies" ADD COLUMN "lead_from_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lead_query" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "lead_acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_lead_from_id_users_id_fk" FOREIGN KEY ("lead_from_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_lead_from_idx" ON "companies" USING btree ("lead_from_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_lead_check" CHECK ("companies"."lead_from_id" is null or "companies"."lead_query" is not null);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_lead_ack_check" CHECK ("companies"."lead_acknowledged_at" is null or "companies"."lead_from_id" is not null);
