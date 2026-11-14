-- AlterTable
-- Optional editorial headline and byline for a Cerita page (SPEC §2/§7/§8). All three are
-- nullable and stay empty until approved wording and an authorship source exist (SPEC §10).
ALTER TABLE `pages`
    ADD COLUMN `headline` VARCHAR(255) NULL,
    ADD COLUMN `byline_author` VARCHAR(120) NULL,
    ADD COLUMN `byline_affiliation` VARCHAR(160) NULL;
