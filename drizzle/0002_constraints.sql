--> statement-breakpoint
-- The SMAC number is the only link between Kladra and the system that holds the
-- money (S3, S4). It is typed by a person, so it can be wrong — but it cannot be
-- the SAME wrong twice, and nothing anywhere objected until now. Partial, because
-- a quotation carries none until it is issued.
CREATE UNIQUE INDEX "quotations_smac_number_idx" ON "quotations" ("smac_number") WHERE "smac_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatches_smac_number_idx" ON "dispatches" ("smac_dispatch_number") WHERE "smac_dispatch_number" IS NOT NULL;--> statement-breakpoint

-- A revision names the quotation it copies. It was a bare uuid pointing at
-- nothing in particular.
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_revision_of_fk" FOREIGN KEY ("revision_of") REFERENCES "quotations"("id");--> statement-breakpoint

-- Every figure on every screen is width x length x qty x price. A zero or a
-- minus in any of them is a wrong number that nobody would question, because it
-- would look like arithmetic. Zod says this at the door; the door is not the
-- only way in (the seed, a migration, an import next year).
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_qty_check" CHECK ("qty" > 0);--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_width_check" CHECK ("width" > 0);--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_length_check" CHECK ("length" > 0);--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_price_check" CHECK ("price_per_sqm" >= 0);--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_qty_check" CHECK ("qty" > 0);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_expected_sqm_check" CHECK ("expected_sqm" IS NULL OR "expected_sqm" >= 0);--> statement-breakpoint
ALTER TABLE "targets" ADD CONSTRAINT "targets_sqm_check" CHECK ("sqm" >= 0);--> statement-breakpoint
ALTER TABLE "company_targets" ADD CONSTRAINT "company_targets_sqm_check" CHECK ("sqm" >= 0);--> statement-breakpoint

-- One line of a quotation appears once on a dispatch. Twice would double the m2
-- it moved, in the one figure the whole month is measured by (S43).
CREATE UNIQUE INDEX "dispatch_items_line_idx" ON "dispatch_items" ("dispatch_id","quotation_item_id");--> statement-breakpoint

-- One main contact per company (D18). Two would make "the number to call"
-- depend on row order.
CREATE UNIQUE INDEX "contacts_one_main_idx" ON "contacts" ("company_id") WHERE "is_main" AND "archived_at" IS NULL;--> statement-breakpoint

-- Saudi picks its city from the list, everywhere else types it (SPEC S3). Both,
-- or neither, is a company with no readable address.
ALTER TABLE "companies" ADD CONSTRAINT "companies_city_check" CHECK (num_nonnulls("city_id", "city_text") = 1);--> statement-breakpoint

-- A status and the instants that belong to it agree. An issued quotation with no
-- issued_at is not an error anybody would see: it is a quotation that has waited
-- zero days for ever, on the screen that says what is stuck.
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_issued_check" CHECK (("issued_at" IS NOT NULL) = ("status" IN ('issued','accepted','rejected')));--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_decided_check" CHECK (("decided_at" IS NOT NULL) = ("status" IN ('accepted','rejected','cancelled')));--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_smac_check" CHECK (("smac_number" IS NOT NULL) = ("status" IN ('issued','accepted','rejected')));--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_approved_check" CHECK (("approved_at" IS NOT NULL) = ("status" = 'approved'));--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_smac_check" CHECK (("smac_dispatch_number" IS NOT NULL) = ("status" = 'approved'));--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_refused_check" CHECK (("refuse_reason" IS NOT NULL) = ("status" = 'refused'));--> statement-breakpoint

-- The whole team's day, read by day rather than by company or by person: the
-- daily report's own query, and the only one with no other index to use.
CREATE INDEX "activities_happened_idx" ON "activities" ("happened_on");--> statement-breakpoint

-- "How many times did this come back?" is answered from the audit rows, which
-- already carry every transition with who and when. Without this index it is a
-- full scan of the one table that only ever grows.
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" ("action","at");
