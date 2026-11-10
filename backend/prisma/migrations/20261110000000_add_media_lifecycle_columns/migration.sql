-- AlterTable
ALTER TABLE `media_assets`
  ADD COLUMN `cleanup_claimed_at` DATETIME(3) NULL,
  ADD COLUMN `cleanup_quarantine_reason` VARCHAR(64) NULL;

-- CreateIndex
CREATE INDEX `media_assets_attached_at_cleanup_claimed_at_created_at_idx` ON `media_assets`(`attached_at`, `cleanup_claimed_at`, `created_at`);

-- CreateIndex
CREATE INDEX `media_assets_attached_at_cleanup_claimed_at_detached_at_idx` ON `media_assets`(`attached_at`, `cleanup_claimed_at`, `detached_at`);

-- CreateTable
CREATE TABLE `media_asset_references` (
    `id` VARCHAR(191) NOT NULL,
    `asset_id` VARCHAR(191) NOT NULL,
    `reference_type` VARCHAR(64) NOT NULL,
    `reference_id` VARCHAR(191) NOT NULL,
    `slot` VARCHAR(64) NOT NULL DEFAULT 'default',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `media_asset_references_tuple_key`(`reference_type`, `reference_id`, `slot`, `asset_id`),
    INDEX `media_asset_references_asset_id_idx`(`asset_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_asset_references` ADD CONSTRAINT `media_asset_references_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

