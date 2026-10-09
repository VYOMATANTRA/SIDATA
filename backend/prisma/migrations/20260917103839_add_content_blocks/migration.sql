-- CreateTable
CREATE TABLE `content_blocks` (
    `id` VARCHAR(191) NOT NULL,
    `section_id` VARCHAR(191) NULL,
    `block_type` ENUM('hero', 'sambutan_lurah', 'highlight', 'prose') NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NOT NULL,
    `metadata` JSON NULL,
    `sort_order` INTEGER NULL,
    `updated_by_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `content_blocks_slug_key`(`slug`),
    INDEX `content_blocks_block_type_idx`(`block_type`),
    INDEX `content_blocks_section_id_sort_order_idx`(`section_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_blocks` ADD CONSTRAINT `content_blocks_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE `content_blocks` ADD CONSTRAINT `check_content_blocks_section_sort` CHECK (`section_id` IS NOT NULL OR `sort_order` IS NULL);

