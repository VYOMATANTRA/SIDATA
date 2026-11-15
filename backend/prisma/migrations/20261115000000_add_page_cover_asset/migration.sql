-- AlterTable
-- Optional cover photo asset ID for the public Cerita hero card (SPEC §7/§8).
ALTER TABLE `pages` ADD COLUMN `cover_asset_id` VARCHAR(191) NULL, ADD INDEX `pages_cover_asset_id_idx`(`cover_asset_id`);
