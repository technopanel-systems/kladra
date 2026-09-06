-- The use panel asks "what did each person do in the last window?" by user and
-- instant. Nothing served that read; it scanned the table once per person.
CREATE INDEX "audit_log_user_at_idx" ON "audit_log" USING btree ("user_id","at");--> statement-breakpoint

-- "Item 1, Item 2 …" is the position, and a dispatch names the line it moves by
-- it. Two lines at one position are one label for two figures. dispatch_items
-- had its line index from 0002; this is the same rule on the other table. The
-- app rewrites a quotation's lines by delete-and-insert, so nothing renumbers
-- in place against it.
CREATE UNIQUE INDEX "quotation_items_position_idx" ON "quotation_items" USING btree ("quotation_id","position");--> statement-breakpoint

-- A target's month is its first day. The form made it so; the unique index on
-- (person, month) only means anything if every writer does. The company's own
-- target first, then each person's.
ALTER TABLE "company_targets" ADD CONSTRAINT "company_targets_month_check" CHECK ("company_targets"."month" = date_trunc('month', "company_targets"."month")::date);--> statement-breakpoint

-- What a notice is about was a closed list in TypeScript over a free-text
-- column: closed in the editor, open here, so a seed or a migration could write
-- a fourth kind that no clearing would ever look for (D100). The check reads the
-- same constant the type is derived from — one list, written once.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_type_check" CHECK ("notifications"."subject_type" in ('quotation', 'dispatch', 'company'));--> statement-breakpoint

-- The same for each person's target.
ALTER TABLE "targets" ADD CONSTRAINT "targets_month_check" CHECK ("targets"."month" = date_trunc('month', "targets"."month")::date);
