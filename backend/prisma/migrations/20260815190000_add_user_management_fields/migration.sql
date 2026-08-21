-- AlterTable
ALTER TABLE `users` ADD COLUMN `deletedAt` DATETIME(3) NULL,
    ADD COLUMN `requires_password_change` BOOLEAN NOT NULL DEFAULT false;
