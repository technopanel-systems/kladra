-- A report is what the person wrote (P13-S4, SPEC §3, D167, D171).
--
-- The sentence at the end of the day goes: a report is the entries, one per thing that happened, each
-- against its customer with what came of it. `daily_reports` was a second place to write the same
-- day, and D162 had already found that two records of one day drift. With it goes its audit record
-- type, and the audit rows that named it are deleted before the closed list is put back — a CHECK
-- added over rows it refuses fails the whole migration.
--
-- An entry now always says what came of it: the popup asks for the outcome as one press, so the
-- column stops being nullable. No backfill: there is no production data, the suite clears before it
-- migrates, and a developer's own database is cleared, migrated and reseeded in that order
-- (rules/migrations.md). An entry left over from before this migration with no outcome is residue,
-- and is cleared rather than guessed at.

DROP TABLE "daily_reports" CASCADE;--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_record_type_check";--> statement-breakpoint
DELETE FROM "audit_log" WHERE "record_type" = 'daily_report';--> statement-breakpoint
DELETE FROM "activities" WHERE "outcome_id" IS NULL;--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "outcome_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_record_type_check" CHECK ("audit_log"."record_type" in ('company', 'contact', 'project', 'activity', 'quotation', 'dispatch', 'user', 'companyTarget', 'nonWorkingDay', 'companyShare', 'projectShare', 'categories', 'leadSources', 'positions', 'suppliers', 'fireRatings', 'classes', 'thicknesses', 'shipmentMethods', 'warehouses', 'services', 'outcomes'));
