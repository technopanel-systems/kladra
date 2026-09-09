-- Two more bells: a lead assigned, and a lead acknowledged (SPEC §3, P12-7).
--
-- S53's rule is that every decision which ends or starts somebody's work
-- carries a written notice to the person it lands on, and a lead is exactly
-- that in both directions. Marketing gives a customer away and the rep hears
-- about it; the rep says he has him and marketing hears that, because a handoff
-- nobody confirms is a customer two people each think the other is calling.
--
-- The kinds are a CHECK rather than an enum type, as every kind here has been:
-- the row stores the kind and its parameters and the sentence is built in the
-- reader's language at read time (D13), so adding one is a constraint edit and
-- two message keys, never a data migration.

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_kind_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('quotationRequested', 'quotationIssued', 'quotationReturned', 'quotationAccepted', 'quotationRejected', 'quotationCancelled', 'dispatchRequested', 'dispatchApproved', 'dispatchRefused', 'companyHandedOver', 'companyShared', 'projectShared', 'leadAssigned', 'leadAcknowledged'));
