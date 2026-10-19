-- AlterTable
ALTER TABLE `indicators` ADD COLUMN `comparison_template_id` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `comparison_templates` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `body` TEXT NOT NULL,
    `trend_naik` TEXT NOT NULL,
    `trend_turun` TEXT NOT NULL,
    `trend_tetap` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `comparison_templates_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `indicators_comparison_template_id_idx` ON `indicators`(`comparison_template_id`);

-- AddForeignKey
ALTER TABLE `indicators` ADD CONSTRAINT `indicators_comparison_template_id_fkey` FOREIGN KEY (`comparison_template_id`) REFERENCES `comparison_templates`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddCheckConstraint
-- SPEC §5: the tier-1 builder only applies to a genuinely paired indicator. A template may
-- be attached only when the indicator is flagged computed AND has both value_previous and
-- period_previous. The FK above must stay RESTRICT/RESTRICT: MySQL (error 3823) forbids
-- CASCADE/SET NULL on a column used in a CHECK.
ALTER TABLE `indicators` ADD CONSTRAINT `check_indicators_comparison_template_paired` CHECK (`comparison_template_id` IS NULL OR (`is_computed_comparison` = TRUE AND `value_previous` IS NOT NULL AND `period_previous` IS NOT NULL));
