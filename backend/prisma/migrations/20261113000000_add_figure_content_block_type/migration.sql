-- AlterTable
-- Adds the `figure` block type (SPEC §2/§7: at most one figure per section). Only the enum
-- changes; `block_type` is not part of `check_content_blocks_section_sort`, so MySQL accepts the
-- MODIFY. The full value list is restated because MySQL replaces the ENUM definition.
ALTER TABLE `content_blocks` MODIFY `block_type` ENUM('hero', 'sambutan_lurah', 'highlight', 'prose', 'figure') NOT NULL;
