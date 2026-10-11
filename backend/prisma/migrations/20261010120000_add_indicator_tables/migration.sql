-- CreateTable
CREATE TABLE `indicator_tables` (
    `id` VARCHAR(191) NOT NULL,
    `section_id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `kind` ENUM('age_pyramid', 'ethnicity', 'religion_by_sex', 'occupation') NOT NULL,
    `period` VARCHAR(64) NOT NULL,
    `source` TEXT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `indicator_tables_slug_key`(`slug`),
    INDEX `indicator_tables_section_id_sort_order_idx`(`section_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `indicator_table_rows` (
    `id` VARCHAR(191) NOT NULL,
    `table_id` VARCHAR(191) NOT NULL,
    `row_key` VARCHAR(64) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `male` INTEGER NULL,
    `female` INTEGER NULL,
    `total` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `indicator_table_rows_table_id_row_key_key`(`table_id`, `row_key`),
    INDEX `indicator_table_rows_table_id_sort_order_idx`(`table_id`, `sort_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `indicator_tables` ADD CONSTRAINT `indicator_tables_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `indicator_table_rows` ADD CONSTRAINT `indicator_table_rows_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `indicator_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE `indicator_tables` ADD CONSTRAINT `indicator_tables_sort_order_check` CHECK (`sort_order` >= 0);

-- AddCheckConstraint
ALTER TABLE `indicator_table_rows` ADD CONSTRAINT `indicator_table_rows_sort_order_check` CHECK (`sort_order` >= 0);

-- AddCheckConstraint
ALTER TABLE `indicator_table_rows` ADD CONSTRAINT `indicator_table_rows_male_check` CHECK (`male` IS NULL OR `male` >= 0);

-- AddCheckConstraint
ALTER TABLE `indicator_table_rows` ADD CONSTRAINT `indicator_table_rows_female_check` CHECK (`female` IS NULL OR `female` >= 0);

-- AddCheckConstraint
ALTER TABLE `indicator_table_rows` ADD CONSTRAINT `indicator_table_rows_total_check` CHECK (`total` IS NULL OR `total` >= 0);
