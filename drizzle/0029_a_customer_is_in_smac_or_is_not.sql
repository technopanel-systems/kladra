-- A customer is in SMAC, or is not, and somebody said so (SPEC §3, P14).
--
-- SMAC is the ERP that holds the money and it has no API: every link to it is a
-- person retyping something. So "is this customer registered" is somebody's
-- word, and the two pairs below are the two people whose word it can be — the
-- rep's belief, and the coordinator's answer, which is the one that counts
-- because she is the one who creates the customer there.
--
-- Each pair is an instant and a name, held together by a check, so an answer
-- cannot outlive whoever gave it. Nothing is backfilled: every company starts
-- unanswered, which is the truth on the morning this ships.

ALTER TABLE "companies" ADD COLUMN "smac_believed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "smac_believed_by" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "smac_registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "smac_registered_by" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_smac_believed_by_users_id_fk" FOREIGN KEY ("smac_believed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_smac_registered_by_users_id_fk" FOREIGN KEY ("smac_registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_smac_idx" ON "companies" USING btree ("smac_registered_at");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_smac_believed_check" CHECK (("companies"."smac_believed_at" is null) = ("companies"."smac_believed_by" is null));--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_smac_registered_check" CHECK (("companies"."smac_registered_at" is null) = ("companies"."smac_registered_by" is null));