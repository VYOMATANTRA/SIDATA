-- AddForeignKey
-- content_blocks.section_id was created without an FK because `sections` did not exist yet.
-- RESTRICT, not SET NULL/CASCADE: MySQL (error 3823) forbids those referential actions on a column
-- used in a CHECK constraint, and `check_content_blocks_section_sort` uses section_id. Nulling it
-- on a block that still has a sort_order would break that CHECK anyway. A section that still has
-- blocks therefore cannot be deleted; move or delete its blocks first.
ALTER TABLE `content_blocks` ADD CONSTRAINT `content_blocks_section_id_fkey` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
