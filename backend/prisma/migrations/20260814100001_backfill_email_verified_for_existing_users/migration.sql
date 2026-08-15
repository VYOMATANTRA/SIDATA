-- The email_verified column and OTP verification flow were introduced together in the
-- previous migration, backfilling `email_verified = false` onto every row that already
-- existed. Any such row necessarily predates OTP verification (it couldn't have gone
-- through a flow that didn't exist yet), so the previous migration's backfill would
-- otherwise permanently lock every pre-existing local account out of login behind the
-- new verification gate. Grandfather them in as verified.
UPDATE `users` SET `email_verified` = true WHERE `auth_provider` = 'local' AND `email_verified` = false;
