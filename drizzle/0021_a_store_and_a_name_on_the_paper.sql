-- A store, and a name on the paper (P12-9, SPEC §3).
--
-- Three columns and one list, all four of them the founder's own sentences.
--
-- `warehouses` — "one warehouse per whole quotation and per whole dispatch,
-- never per line: Riyadh, Malham, Dammam, Khamis Mushait". A list rather than
-- four constants, so a fifth store is an evening's typing for the admin rather
-- than a deployment, and `active` is what lets one close without taking every
-- record that points at it with it. No code column, unlike shipment methods:
-- CT and TT are what a rep says out loud, and a warehouse is said by its name.
--
-- `quotations.warehouse_id` and `dispatches.warehouse_id` — NOT NULL, because
-- there is no such thing as a price out of nowhere or a load from nowhere. The
-- two are separate facts on purpose: the price was worked out of one store and
-- the panels may leave from another when that one is short.
--
-- `quotations.contact_id` — who at the customer the paper is addressed to, the
-- last link of company -> project -> contact. Nullable: a price for stock is
-- sometimes for the company rather than for a person. A plain reference and not
-- a composite one against (id, company_id), which would guarantee the person is
-- at the company named beside him: that is true when it is written and a fold
-- may honestly break it afterwards, because the arriving duplicate of a person
-- both reps held is archived where it is (D153). The true answer is the row the
-- paper was actually addressed to; a composite key would force a lie.
--
-- The two NOT NULL columns carry no default and no backfill. There is no
-- production data (rules/migrations.md) and the suite clears before it migrates
-- (tests/global-setup.ts), so this meets empty tables; a developer's own
-- database is cleared, migrated and reseeded in that order, as README says.

CREATE TABLE "warehouses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "warehouses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name_en" text NOT NULL,
	"name_ar" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_record_type_check";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "warehouse_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "warehouse_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_record_type_check" CHECK ("audit_log"."record_type" in ('company', 'contact', 'project', 'activity', 'quotation', 'dispatch', 'daily_report', 'user', 'companyTarget', 'nonWorkingDay', 'companyShare', 'projectShare', 'categories', 'leadSources', 'positions', 'suppliers', 'fireRatings', 'classes', 'thicknesses', 'shipmentMethods', 'warehouses'));