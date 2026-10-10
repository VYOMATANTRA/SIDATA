-- DropForeignKey
ALTER TABLE `indicators` DROP FOREIGN KEY `indicators_section_id_fkey`;

-- AddForeignKey
ALTER TABLE `indicators` ADD CONSTRAINT `indicators_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
