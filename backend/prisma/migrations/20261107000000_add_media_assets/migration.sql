-- CreateTable
CREATE TABLE `media_assets` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(20) NOT NULL DEFAULT 'local',
    `storage_key` VARCHAR(512) NOT NULL,
    `kind` ENUM('photo', 'document', 'data') NOT NULL,
    `purpose` VARCHAR(64) NOT NULL,
    `owner_key` VARCHAR(64) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `byte_size` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `created_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `attached_at` DATETIME(3) NULL,

    UNIQUE INDEX `media_assets_storage_key_key`(`storage_key`),
    INDEX `media_assets_attached_at_created_at_idx`(`attached_at`, `created_at`),
    INDEX `media_assets_purpose_owner_key_idx`(`purpose`, `owner_key`),
    INDEX `media_assets_created_by_id_idx`(`created_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `media_assets` ADD CONSTRAINT `media_assets_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

