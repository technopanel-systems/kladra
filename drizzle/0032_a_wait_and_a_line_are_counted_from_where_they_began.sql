ALTER TABLE "dispatches" ADD COLUMN "desk_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD COLUMN "origin_item_id" uuid;--> statement-breakpoint
ALTER TABLE "quotations" ADD COLUMN "desk_since" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_origin_item_id_quotation_items_id_fk" FOREIGN KEY ("origin_item_id") REFERENCES "public"."quotation_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_items_origin_idx" ON "quotation_items" USING btree ((coalesce("origin_item_id", "id")));