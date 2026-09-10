-- A choice belongs to a person, not to a browser (P12-14, SPEC §3).
--
-- "Where a screen earns more than one view, the default is the one that answers
-- the daily question, and the choice is remembered per person and carried in
-- the URL." The URL half has been true since P8. The memory half was a cookie,
-- which is per BROWSER — so the rep who chose the board at his desk got the
-- list back on his phone, and the sentence was half kept.
--
-- Three choices had that cookie, all with the same comment explaining why a
-- preference was not worth a table: list or board, which tab a screen opens on,
-- and which range the metrics cover. One rule, so one mechanism: all three are
-- rows here now, and the three copies of the same `document.cookie` effect are
-- one hook.
--
-- `choice` is text and not an enum on purpose. A fourth range or a third view is
-- a decision about a screen, and every reader already falls back to its own
-- default when the word is one it does not know — which is exactly what a stale
-- cookie did. `kind` IS checked, because those three are the whole idea.

CREATE TABLE "screen_choices" (
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"screen" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screen_choices_user_id_kind_screen_pk" PRIMARY KEY("user_id","kind","screen"),
	CONSTRAINT "screen_choices_kind_check" CHECK ("screen_choices"."kind" in ('view', 'tab', 'range'))
);
--> statement-breakpoint
ALTER TABLE "screen_choices" ADD CONSTRAINT "screen_choices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screen_choices_user_idx" ON "screen_choices" USING btree ("user_id");