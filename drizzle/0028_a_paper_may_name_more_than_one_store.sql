-- A paper may name more than one store (P14, founder: “a quotation or a dispatch may name more than
-- one warehouse — not per line, that would confuse the reps; the field takes one warehouse normally and
-- allows a second or a third in the rare case, on the document as a whole”).
--
-- The paper's own `warehouse_id` is untouched and still required: it is the first store, and keeping it
-- is what keeps “every paper names at least one” a guarantee of the database rather than a thing an
-- action remembers. These two tables hold the rare second and third, in the order the rep typed them.
--
-- No backfill: every paper that exists names one store, and one store is still the ordinary answer.

CREATE TABLE "dispatch_warehouses" (
	"dispatch_id" uuid NOT NULL,
	"warehouse_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "dispatch_warehouses_dispatch_id_warehouse_id_pk" PRIMARY KEY("dispatch_id","warehouse_id"),
	CONSTRAINT "dispatch_warehouses_position_check" CHECK ("dispatch_warehouses"."position" > 0)
);
--> statement-breakpoint
CREATE TABLE "quotation_warehouses" (
	"quotation_id" uuid NOT NULL,
	"warehouse_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "quotation_warehouses_quotation_id_warehouse_id_pk" PRIMARY KEY("quotation_id","warehouse_id"),
	CONSTRAINT "quotation_warehouses_position_check" CHECK ("quotation_warehouses"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "dispatch_warehouses" ADD CONSTRAINT "dispatch_warehouses_dispatch_id_dispatches_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_warehouses" ADD CONSTRAINT "dispatch_warehouses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_warehouses" ADD CONSTRAINT "quotation_warehouses_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_warehouses" ADD CONSTRAINT "quotation_warehouses_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispatch_warehouses_position_idx" ON "dispatch_warehouses" USING btree ("dispatch_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quotation_warehouses_position_idx" ON "quotation_warehouses" USING btree ("quotation_id","position");