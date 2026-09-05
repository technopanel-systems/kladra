-- A notice now says what it is about, so the transition that settles the work
-- can find it and take it off the screen (D79). Every existing row predates the
-- column and has no answer for it, and a pointer with no subject is exactly the
-- thing being fixed here — so they go, which is what "no production data,
-- migrations clear" is for. The bell recomputes from what is left.
DELETE FROM "notifications";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "subject_id" uuid NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_subject_idx" ON "notifications" USING btree ("subject_type","subject_id");
