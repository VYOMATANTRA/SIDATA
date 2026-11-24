-- AlterTable
-- Adds the generic `by_sex` kind (SPEC §4/§7): a sex-split table whose rows are arbitrary
-- categories (education level, marital status, ...). Only the enum changes; the full value list
-- is restated because MySQL replaces the ENUM definition.
ALTER TABLE `indicator_tables` MODIFY `kind` ENUM('age_pyramid', 'ethnicity', 'religion_by_sex', 'occupation', 'by_sex') NOT NULL;
