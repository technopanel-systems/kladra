-- A request to archive, and the sales manager's answer (SPEC §3, P14).
--
-- Taking a customer, a contact or a job off the floor stops being something a
-- rep does and becomes something he asks for: a mandatory reason, an answer
-- from the manager, and a refusal that comes back carrying his reason the way a
-- refused load does. One table for all three kinds, because the founder asked
-- for one approval path and not one per kind of record.
--
-- `record_id` points into one of three tables and therefore has no foreign key,
-- exactly as audit_log's does. Nothing is lost by that: archiving is what this
-- app does instead of deleting, so the row it names cannot go away.
--
-- The five checks are the states this table is allowed to be in, said where
-- nothing can go round them: the kind and the status are closed lists, a reason
-- is never blank, answered and waiting are one fact rather than three that can
-- disagree, and only a refusal carries a refusal's reason. The unique index is
-- partial, so one record can have one request waiting and any number of settled
-- ones behind it — asking again after a refusal is a new row, and the refusal
-- stays in the history.
--
-- The notifications table gains three kinds and one subject: a notice can now
-- be about a CONTACT, which nothing had ever needed to say before. Both checks
-- are dropped and rebuilt rather than altered, which is the only way Postgres
-- takes a change to a list a check is written over (rules/migrations.md).
--
-- Nothing is backfilled. Everything already archived was archived under the old
-- rule, and a request row invented for it would be a decision nobody made.

CREATE TABLE "archive_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"record_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"refuse_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "archive_requests_kind_check" CHECK ("archive_requests"."kind" in ('company', 'contact', 'project')),
	CONSTRAINT "archive_requests_status_check" CHECK ("archive_requests"."status" in ('waiting', 'approved', 'refused')),
	CONSTRAINT "archive_requests_reason_check" CHECK ("archive_requests"."reason" ~ '[^[:space:]]'),
	CONSTRAINT "archive_requests_decided_check" CHECK (("archive_requests"."status" = 'waiting') = ("archive_requests"."decided_at" is null and "archive_requests"."decided_by" is null)),
	CONSTRAINT "archive_requests_refusal_check" CHECK (("archive_requests"."refuse_reason" is not null and "archive_requests"."refuse_reason" ~ '[^[:space:]]') = ("archive_requests"."status" = 'refused'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_subject_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "archive_requests" ADD CONSTRAINT "archive_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "archive_requests" ADD CONSTRAINT "archive_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "archive_requests_waiting_idx" ON "archive_requests" USING btree ("kind","record_id") WHERE "archive_requests"."status" = 'waiting';--> statement-breakpoint
CREATE INDEX "archive_requests_status_idx" ON "archive_requests" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_type_check" CHECK ("notifications"."subject_type" in ('quotation', 'dispatch', 'company', 'project', 'contact'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('quotationRequested', 'quotationIssued', 'quotationReturned', 'quotationAccepted', 'quotationRejected', 'quotationCancelled', 'dispatchRequested', 'dispatchApproved', 'dispatchRefused', 'companyHandedOver', 'companyShared', 'projectShared', 'leadAssigned', 'leadAcknowledged', 'companyFolded', 'companyAbsorbed', 'archiveRequested', 'archiveApproved', 'archiveRefused'));