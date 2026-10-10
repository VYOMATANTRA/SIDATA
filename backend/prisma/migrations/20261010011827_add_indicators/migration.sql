-- CreateTable
CREATE TABLE `indicators` (
    `id` VARCHAR(191) NOT NULL,
    `section_id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `label` TEXT NOT NULL,
    `unit` VARCHAR(32) NULL,
    `value_current` DECIMAL(18, 4) NOT NULL,
    `value_previous` DECIMAL(18, 4) NULL,
    `period_current` VARCHAR(64) NOT NULL,
    `period_previous` VARCHAR(64) NULL,
    `is_computed_comparison` BOOLEAN NOT NULL DEFAULT false,
    `is_stale` BOOLEAN NOT NULL DEFAULT false,
    `source` TEXT NULL,
    `hedge_note` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `indicators_slug_key`(`slug`),
    INDEX `indicators_section_id_sort_order_idx`(`section_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `indicators` ADD CONSTRAINT `indicators_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
