-- CreateTable
CREATE TABLE `page_highlights` (
    `id` VARCHAR(191) NOT NULL,
    `page_id` VARCHAR(191) NOT NULL,
    `indicator_id` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,

    UNIQUE INDEX `page_highlights_indicator_id_key`(`indicator_id`),
    UNIQUE INDEX `page_highlights_page_id_position_key`(`page_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `page_highlights` ADD CONSTRAINT `page_highlights_page_id_fkey` FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `page_highlights` ADD CONSTRAINT `page_highlights_indicator_id_fkey` FOREIGN KEY (`indicator_id`) REFERENCES `indicators`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
