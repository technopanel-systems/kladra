-- Why a company left the floor, in the archiver's words (S16, D87). Every
-- other terminal state already carried its reason; the archive dialog asks now,
-- keeps the answer here and in the audit line, and the admin's archive screen
-- shows it under the name. Nullable: the rows archived before this column
-- gave no reason, and inventing one for them would be a lie in the record.
ALTER TABLE "companies" ADD COLUMN "archive_reason" text;
