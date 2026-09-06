-- The projects list asks each project for its last logged day. Measured at the
-- volume floor (D107) that walked the whole activities table once per project;
-- the twin read by company had its index since P8, and now this one has too.
CREATE INDEX "activities_project_happened_idx" ON "activities" USING btree ("project_id","happened_on");--> statement-breakpoint

-- The trail is written against eighteen kinds of record: the eight of the
-- floor, the two admin settings, and the eight reference lists the admin edits.
-- `action` stays open — a family per kind, refused at read time when unknown —
-- but the kind itself is closed, and the column says so (D106).
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_record_type_check" CHECK ("audit_log"."record_type" in ('company', 'contact', 'project', 'activity', 'quotation', 'dispatch', 'daily_report', 'user', 'companyTarget', 'nonWorkingDay', 'categories', 'leadSources', 'positions', 'suppliers', 'fireRatings', 'classes', 'thicknesses', 'shipmentMethods'));--> statement-breakpoint

-- Why a company left the floor is a fact about a company that HAS left. A
-- reason on a live company is a state that never happened (D87, rules/data.md).
-- The other way stays open: rows archived before 0010 gave no reason.
ALTER TABLE "companies" ADD CONSTRAINT "companies_archive_reason_check" CHECK ("companies"."archive_reason" is null or "companies"."archived_at" is not null);--> statement-breakpoint

-- A notice's kind is a sentence in both locales, built at read time (D13). A
-- kind no locale has a sentence for would reach the bell as a raw key; the
-- column refuses it now, from the same list the type and the message check read.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('quotationRequested', 'quotationIssued', 'quotationReturned', 'quotationAccepted', 'quotationRejected', 'quotationCancelled', 'dispatchRequested', 'dispatchApproved', 'dispatchRefused', 'companyHandedOver'));
