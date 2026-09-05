ALTER TABLE "quotations" ADD CONSTRAINT "quotations_returned_check" CHECK (("quotations"."return_reason" is not null) = ("quotations"."status" = 'returned'));
