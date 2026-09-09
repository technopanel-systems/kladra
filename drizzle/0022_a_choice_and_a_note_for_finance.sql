-- A choice, its second answer, and a note finance reads (P12-10, SPEC §3).
--
-- "Payment terms are a choice plus notes, not free text. Bank transfer → full
-- amount or part. Cash → on delivery or at the office. Credit and tasaheel → a
-- note from the rep explaining the terms is mandatory, for finance to review."
--
-- `payment_terms` was one free-text column, which is a column nobody can count:
-- "50% مقدم والباقي عند التسليم" and "تحويل بنكي خلال 30 يوم" are the same
-- arrangement typed by two people. It becomes an enum of the founder's four,
-- with `payment_detail` for the second question two of them ask and
-- `payment_note` for the words the other two require.
--
-- The cast in the type change is a cast of nothing: there is no production data
-- (rules/migrations.md), the suite clears before it migrates, and a developer's
-- own database is cleared, migrated and reseeded in that order. Every old value
-- was somebody's sentence and none of them is one of the four, so on a table
-- with rows in it this migration is meant to fail rather than guess.
--
-- The three checks are the shape itself, held where the form cannot be the only
-- guard. Each `in` is preceded by `is not null and`, because a CHECK refuses a
-- row only when its expression is FALSE and `null in (a, b)` is NULL — the
-- shorter spelling reads correctly and admits a bank transfer with no amount
-- on it (§5 #176).

CREATE TYPE "public"."payment_detail" AS ENUM('fullAmount', 'partAmount', 'onDelivery', 'atOffice');--> statement-breakpoint
CREATE TYPE "public"."payment_terms" AS ENUM('bankTransfer', 'cash', 'credit', 'tasaheel');--> statement-breakpoint
ALTER TABLE "dispatches" ALTER COLUMN "payment_terms" SET DATA TYPE "public"."payment_terms" USING "payment_terms"::"public"."payment_terms";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "payment_detail" "payment_detail";--> statement-breakpoint
ALTER TABLE "dispatches" ADD COLUMN "payment_note" text;--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_payment_detail_check" CHECK (case "dispatches"."payment_terms"
            when 'bankTransfer'
              then "dispatches"."payment_detail" is not null
                   and "dispatches"."payment_detail" in ('fullAmount', 'partAmount')
            when 'cash'
              then "dispatches"."payment_detail" is not null
                   and "dispatches"."payment_detail" in ('onDelivery', 'atOffice')
            else "dispatches"."payment_detail" is null
          end);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_payment_note_check" CHECK (case when "dispatches"."payment_terms" in ('credit', 'tasaheel')
            then "dispatches"."payment_note" is not null
            else true end);--> statement-breakpoint
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_payment_note_blank_check" CHECK ("dispatches"."payment_note" is null or "dispatches"."payment_note" ~ '[^[:space:]]');