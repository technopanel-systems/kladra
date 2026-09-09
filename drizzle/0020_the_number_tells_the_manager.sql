-- The name warns the rep; the number tells the manager (P12-8, S14, S15, D158).
--
-- Three things land here and they are one review between them.
--
-- 1. `fold_name` — the name with the SPELLING taken out of it. The duplicate
--    warning matched `name ilike 'what he typed%'`, which is a rule about
--    letters, and two people typing one Saudi customer do not agree about
--    letters. They disagree about the definite article, about where the
--    tashkeel goes, about أ إ آ against ا, about ة against ه, about ى against
--    ي, about Arabic-Indic digits against Western ones, about Al- against Al
--    against nothing, and about whether the firm is a شركة or a مؤسسة. Every
--    one of those is a different string and the same customer.
--
--    So the comparison is made on a folded form and the fold lives HERE, in
--    one immutable function, rather than in TypeScript beside a second copy in
--    SQL. `companies.name_folded` is generated from it, so nothing but the
--    database can write it and no insert can forget to. Nothing the fold
--    produces can be a LIKE metacharacter either, which is why the matcher
--    builds its pattern out of it without escaping anything.
--
--    The trap that comes with a generated column: Postgres does NOT recompute
--    a stored one when the function behind it changes. Changing `fold_name`
--    means rewriting the column in the same migration, and
--    `tests/schema.spec.ts` holds every stored value to the function so that a
--    change which forgets fails a test instead of quietly comparing today's
--    names against last year's rule.
--
--    The article is stripped where Arabic writes it — glued to the front of a
--    word — and the trade's own words are dropped wherever they fall, because
--    "which firm" is never answered by شركة. Nothing else is folded: this is a
--    spelling rule, not a guess at what a name means.
--
-- 2. `duplicate_flags` — the manager's queue. S15 says a company is always
--    created even when it looks like a duplicate and nothing blocks the rep;
--    that is a property of the DETECTOR, not of its absence. The row is
--    written, and then the flag is, in the same transaction. The number raises
--    it and the name never does (D158).
--
-- 3. `companies.merged_into_id` — the tombstone. A record that turned out to
--    be a customer already on file keeps its id, its audit rows and its
--    notices, and points at the record that continues. Archived by
--    construction, so every list in the app already hides it.

CREATE FUNCTION fold_name(value text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $fold$
  WITH lowered AS (SELECT lower(value) AS v),
  bare AS (
    -- The marks that are not letters: fatha to sukun, the superscript alef,
    -- and the tatweel that stretches a word for typesetting.
    SELECT regexp_replace(v, '[ً-ْٰـ]', '', 'g') AS v FROM lowered
  ),
  unified AS (
    -- One letter per sound, and Western digits, which is what this app writes
    -- everywhere else too (D6).
    SELECT translate(v, 'أإآٱىةؤئ٠١٢٣٤٥٦٧٨٩', 'اااايهوي0123456789') AS v FROM bare
  ),
  words AS (
    -- Anything that is not an Arabic letter, a Latin letter or a digit is a
    -- gap: hyphens, full stops, brackets, ampersands, and any other script.
    SELECT ' ' || regexp_replace(v, '[^a-z0-9ء-ي]+', ' ', 'g') || ' ' AS v FROM unified
  ),
  article AS (
    -- Arabic writes the definite article joined to its word, so it is a prefix
    -- and not a word: الوطنية and وطنية are one name typed by two people.
    SELECT regexp_replace(v, ' ال', ' ', 'g') AS v FROM words
  ),
  denoised AS (
    -- What every second firm in this trade is called, in both languages. These
    -- carry no answer to "which firm", and the two records of one customer
    -- rarely agree about which of them to use.
    SELECT regexp_replace(
      v,
      ' (شركه|موسسه|مصنع|مجموعه|معرض|مكتب|مركز|al|el|the|co|corp|company|llc|est|establishment|factory|group)(?= )',
      '',
      'g'
    ) AS v FROM article
  )
  -- A name that was nothing but noise folds to NULL rather than to the empty
  -- string, so it matches nothing instead of matching everything.
  SELECT nullif(btrim(regexp_replace(v, ' +', ' ', 'g')), '') FROM denoised
$fold$;--> statement-breakpoint
CREATE TABLE "duplicate_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"other_id" uuid NOT NULL,
	"matched_phone" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"survivor_id" uuid,
	"ruled_by" uuid,
	"ruled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "duplicate_flags_pair_check" CHECK ("duplicate_flags"."company_id" <> "duplicate_flags"."other_id"),
	CONSTRAINT "duplicate_flags_status_check" CHECK ("duplicate_flags"."status" in ('open', 'notDuplicate', 'kept', 'keptAndShared')),
	CONSTRAINT "duplicate_flags_ruled_check" CHECK (("duplicate_flags"."status" = 'open') = ("duplicate_flags"."ruled_at" is null and "duplicate_flags"."ruled_by" is null)),
	CONSTRAINT "duplicate_flags_survivor_check" CHECK (case when "duplicate_flags"."status" in ('kept', 'keptAndShared')
            then "duplicate_flags"."survivor_id" is not null
                 and "duplicate_flags"."survivor_id" in ("duplicate_flags"."company_id", "duplicate_flags"."other_id")
            else "duplicate_flags"."survivor_id" is null end)
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "name_folded" text GENERATED ALWAYS AS (fold_name(name)) STORED;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "merged_into_id" uuid;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_other_id_companies_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_survivor_id_companies_id_fk" FOREIGN KEY ("survivor_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_flags" ADD CONSTRAINT "duplicate_flags_ruled_by_users_id_fk" FOREIGN KEY ("ruled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_flags_pair_idx" ON "duplicate_flags" USING btree (least("company_id", "other_id"),greatest("company_id", "other_id"));--> statement-breakpoint
CREATE INDEX "duplicate_flags_status_idx" ON "duplicate_flags" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_merged_into_id_companies_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_name_folded_idx" ON "companies" USING btree ("name_folded" text_pattern_ops);--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_merged_check" CHECK ("companies"."merged_into_id" is null or ("companies"."archived_at" is not null and "companies"."merged_into_id" <> "companies"."id"));--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('quotationRequested', 'quotationIssued', 'quotationReturned', 'quotationAccepted', 'quotationRejected', 'quotationCancelled', 'dispatchRequested', 'dispatchApproved', 'dispatchRefused', 'companyHandedOver', 'companyShared', 'projectShared', 'leadAssigned', 'leadAcknowledged', 'companyFolded', 'companyAbsorbed'));