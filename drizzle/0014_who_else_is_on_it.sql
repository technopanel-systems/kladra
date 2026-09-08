-- A company can be shared, and a project can be worked by more than one rep
-- (SPEC §3, D147). Two things follow, and both are here.
--
-- First, a contact and a project now say whose they are. Until now the answer
-- was the company's one rep, read through companies.rep_id, and there was no
-- second person to ask about. Every existing row predates the column and the
-- honest answer for it is the company's rep — which is a backfill, and this
-- repo has no production data, so they go instead and the seed writes them
-- again with an owner (rules/migrations.md).
--
-- Second, the two indexes that were about a company alone are about a company
-- and a rep. Two reps working one customer will both hold the buyer's number,
-- and each of them has a main contact of his own; refusing the second would
-- tell a rep that his own customer's number belongs to somebody else.
DELETE FROM "contacts";--> statement-breakpoint
DELETE FROM "projects";--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "rep_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "rep_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_rep_id_users_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_rep_idx" ON "contacts" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "projects_rep_idx" ON "projects" USING btree ("rep_id");--> statement-breakpoint
DROP INDEX "contacts_company_phone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_company_phone_idx" ON "contacts" USING btree ("company_id","rep_id","phone_normalized");--> statement-breakpoint
DROP INDEX "contacts_one_main_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_one_main_idx" ON "contacts" USING btree ("company_id","rep_id") WHERE "contacts"."is_main" and "contacts"."archived_at" is null;--> statement-breakpoint
CREATE TABLE "company_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_shares" ADD CONSTRAINT "company_shares_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_shares" ADD CONSTRAINT "company_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_shares" ADD CONSTRAINT "company_shares_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_shares_company_user_idx" ON "company_shares" USING btree ("company_id","user_id");--> statement-breakpoint
CREATE INDEX "company_shares_user_idx" ON "company_shares" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_shares_project_user_idx" ON "project_shares" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_shares_user_idx" ON "project_shares" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_record_type_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_subject_type_check";
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_record_type_check" CHECK ("audit_log"."record_type" in ('company', 'contact', 'project', 'activity', 'quotation', 'dispatch', 'daily_report', 'user', 'companyTarget', 'nonWorkingDay', 'companyShare', 'projectShare', 'categories', 'leadSources', 'positions', 'suppliers', 'fireRatings', 'classes', 'thicknesses', 'shipmentMethods'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_subject_type_check" CHECK ("notifications"."subject_type" in ('quotation', 'dispatch', 'company', 'project'));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('quotationRequested', 'quotationIssued', 'quotationReturned', 'quotationAccepted', 'quotationRejected', 'quotationCancelled', 'dispatchRequested', 'dispatchApproved', 'dispatchRefused', 'companyHandedOver', 'companyShared', 'projectShared'));
