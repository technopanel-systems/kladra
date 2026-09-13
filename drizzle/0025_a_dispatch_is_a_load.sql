-- A dispatch is a load, a report entry says what came of it, and a service has a price (P13-S0, SPEC §3).
--
-- The founder's second round, as columns, all of it in one set so the slices that build the screens
-- never write the schema at the same time.
--
-- `dispatches` names its own company, and optionally its project and quotation: a dispatch may be
-- DIRECT, for a company with no paper behind it. A dispatch prefilled from a quotation is still for
-- that quotation's job (`dispatches_project_check`) and records how it differed from it
-- (`quotation_difference`, null exactly when there was nothing to differ from).
--
-- `dispatch_items` stops pointing into the quotation for its sheet: a rep edits the load, so each
-- line carries the same inputs a quotation line does, its m² generated the same way, and a nullable
-- link to the line it was prefilled from — which is what "what already went" still sums over.
-- `quotation_services` and `dispatch_services` hold CNC cutting, denting and fabrication, priced per
-- typed m², from the admin's `services` list.
--
-- `raised_by_id` on both papers: whom it counts for stays `rep_id`, and who pressed the button is
-- kept beside it, because the coordinator raises on a rep's behalf and the manager asks how often.
--
-- `activities` takes an outcome from the admin's `outcomes` list, two more kinds of what happened
-- (a site visit, a meeting), and the quotation or dispatch an entry was about.
--
-- Credit and tasaheel are one payment option. Removing an enum value that a CHECK mentions drops
-- and re-adds both checks around the swap (rules/migrations.md); drizzle-kit only wrote the one it
-- saw change.
--
-- No backfill: there is no production data, the suite clears before it migrates, and a developer's
-- own database is cleared, migrated and reseeded in that order (rules/migrations.md).

ALTER TYPE "public"."channel" ADD VALUE 'siteVisit' BEFORE 'call';--> statement-breakpoint
ALTER TYPE "public"."channel" ADD VALUE 'meeting' BEFORE 'call';--> statement-breakpoint
CREATE TABLE "dispatch_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dispatch_id" uuid NOT NULL,
	"quotation_service_id" uuid,
	"position" integer NOT NULL,
	"service_id" integer NOT NULL,
	"sqm" numeric(12, 2) NOT NULL,
	"price_per_sqm" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispatch_services_sqm_check" CHECK ("dispatch_services"."sqm" > 0),
	CONSTRAINT "dispatch_services_price_check" CHECK ("dispatch_services"."price_per_sqm" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outcomes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotation_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"service_id" integer NOT NULL,
	"sqm" numeric(12, 2) NOT NULL,
	"price_per_sqm" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_services_sqm_check" CHECK ("quotation_services"."sqm" > 0),
	CONSTRAINT "quotation_services_price_check" CHECK ("quotation_services"."price_per_sqm" >= 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_record_type_check";--> statement-breakpoint
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_payment_note_check";--> statement-breakpoint
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_payment_detail_check";--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "payment_terms" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."payment_terms";--> statement-breakpoint
CREATE TYPE "public"."payment_terms" AS ENUM('bankTransfer', 'cash', 'credit');--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "payment_terms" SET DATA TYPE "public"."payment_terms" USING "payment_terms"::"public"."payment_terms";--> statement-breakpoint
ALTER TABLE "dispatch_items" ALTER COLUMN "quotation_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "quotation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "outcome_id" integer;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "quotation_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "dispatch_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "position" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "colour_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "supplier_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "fire_rating_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "class_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "thickness_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "width" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "length" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "price_per_sqm" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD COLUMN "sqm" numeric(12, 2) GENERATED ALWAYS AS (round(width * length * qty, 2)) STORED;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "company_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "raised_by_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "quotation_difference" jsonb;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "raised_by_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatch_services" ADD CONSTRAINT "dispatch_services_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_services" ADD CONSTRAINT "dispatch_services_quotation_service_id_quotation_services_id_fk" FOREIGN KEY ("quotation_service_id") REFERENCES "public"."quotation_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_services" ADD CONSTRAINT "dispatch_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_services" ADD CONSTRAINT "quotation_services_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_services" ADD CONSTRAINT "quotation_services_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dispatch_services_dispatch_idx" ON "dispatch_services" USING btree ("dispatch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_services_position_idx" ON "dispatch_services" USING btree ("dispatch_id","position");--> statement-breakpoint
CREATE INDEX "quotation_services_quotation_idx" ON "quotation_services" USING btree ("quotation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_services_position_idx" ON "quotation_services" USING btree ("quotation_id","position");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_fire_rating_id_fire_ratings_id_fk" FOREIGN KEY ("fire_rating_id") REFERENCES "public"."fire_ratings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_thickness_id_thicknesses_id_fk" FOREIGN KEY ("thickness_id") REFERENCES "public"."thicknesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_raised_by_id_users_id_fk" FOREIGN KEY ("raised_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_quotation_idx" ON "activities" USING btree ("quotation_id");--> statement-breakpoint
CREATE INDEX "activities_dispatch_idx" ON "activities" USING btree ("dispatch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_items_position_idx" ON "dispatch_items" USING btree ("dispatch_id","position");--> statement-breakpoint
CREATE INDEX "dispatch_items_quotation_item_idx" ON "dispatch_items" USING btree ("quotation_item_id");--> statement-breakpoint
CREATE INDEX "dispatches_company_idx" ON "dispatches" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "dispatches_project_idx" ON "dispatches" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "dispatches_raised_by_idx" ON "dispatches" USING btree ("raised_by_id");--> statement-breakpoint
CREATE INDEX "quotations_raised_by_idx" ON "quotations" USING btree ("raised_by_id");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_record_type_check" CHECK ("audit_log"."record_type" in ('company', 'contact', 'project', 'activity', 'quotation', 'dispatch', 'daily_report', 'user', 'companyTarget', 'nonWorkingDay', 'companyShare', 'projectShare', 'categories', 'leadSources', 'positions', 'suppliers', 'fireRatings', 'classes', 'thicknesses', 'shipmentMethods', 'warehouses', 'services', 'outcomes'));--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_width_check" CHECK ("dispatch_items"."width" > 0);--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_length_check" CHECK ("dispatch_items"."length" > 0);--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_price_check" CHECK ("dispatch_items"."price_per_sqm" >= 0);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_project_check" CHECK ("dispatches"."quotation_id" is null or "dispatches"."project_id" is not null);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_difference_check" CHECK (("dispatches"."quotation_id" is null) = ("dispatches"."quotation_difference" is null));--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_payment_note_check" CHECK (case when "dispatches"."payment_terms" = 'credit'
            then "dispatches"."payment_note" is not null
            else true end);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_payment_detail_check" CHECK (case "dispatches"."payment_terms"
            when 'bankTransfer'
              then "dispatches"."payment_detail" is not null
                   and "dispatches"."payment_detail" in ('fullAmount', 'partAmount')
            when 'cash'
              then "dispatches"."payment_detail" is not null
                   and "dispatches"."payment_detail" in ('onDelivery', 'atOffice')
            else "dispatches"."payment_detail" is null
          end);
