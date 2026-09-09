-- Paper somebody put out themselves (SPEC §3).
--
-- The coordinator sells now, and on her own customers there is nobody behind
-- her to ask: she types the SMAC number and the quotation is issued in one act
-- rather than waiting in a queue she owns. The founder's clause is "flagged for
-- the manager so nobody issues their own work unseen", and what it asks for is
-- not a refusal but a name on a list he reads.
--
-- The CHECK is written against `issued_at` and not against the status, because
-- a self-issued quotation can be withdrawn or rejected afterwards and what the
-- column says stays true: she issued it.
ALTER TABLE "quotations" ADD COLUMN "self_issued" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_self_issued_check" CHECK (not "quotations"."self_issued" or "quotations"."issued_at" is not null);