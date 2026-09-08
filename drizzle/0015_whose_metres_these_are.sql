-- Whose these metres are (SPEC §3, D148).
--
-- Two reps can work one job since 0014, and the founder's rule for the metres
-- is that credit is chosen per quotation and per dispatch and never inherited.
-- Some reps genuinely share a job; some are only helping, and a helper still
-- writes his own daily report about what he did without taking the metres.
--
-- Rows, not a column, because a column naming one rep with "split" as its
-- empty case would make a finished month move the day somebody joined or left
-- the job. And rows that hold only the WHO: what each person's share comes to
-- is computed from the record's own lines by src/lib/credit.ts, so correcting
-- a dispatch's quantities cannot leave stored shares that no longer add back
-- to it.
--
-- No backfill. Every quotation and dispatch that exists here was seeded, and
-- the seed writes credit with them (rules/migrations.md); a production import
-- would write one row per record naming its own rep, which is what these rows
-- mean for a record nobody shared.
CREATE TABLE "dispatch_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dispatch_credits" ADD CONSTRAINT "dispatch_credits_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_credits" ADD CONSTRAINT "dispatch_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_credits" ADD CONSTRAINT "quotation_credits_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_credits" ADD CONSTRAINT "quotation_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_credits_dispatch_user_idx" ON "dispatch_credits" USING btree ("dispatch_id","user_id");--> statement-breakpoint
CREATE INDEX "dispatch_credits_user_idx" ON "dispatch_credits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_credits_quotation_user_idx" ON "quotation_credits" USING btree ("quotation_id","user_id");--> statement-breakpoint
CREATE INDEX "quotation_credits_user_idx" ON "quotation_credits" USING btree ("user_id");