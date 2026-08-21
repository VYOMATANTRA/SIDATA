-- CreateTable
CREATE TABLE `spatial_points` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ketua_rt', 'bank_sampah', 'fasilitas_umum') NOT NULL,
    `latitude` DOUBLE NOT NULL,
    `longitude` DOUBLE NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `spatial_points_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `spatial_point_rt` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `point_id` VARCHAR(191) NOT NULL,
    `rt_number` INTEGER NOT NULL,

    INDEX `spatial_point_rt_rt_number_idx`(`rt_number`),
    INDEX `spatial_point_rt_point_id_idx`(`point_id`),
    UNIQUE INDEX `spatial_point_rt_point_id_rt_number_key`(`point_id`, `rt_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rt_leaders` (
    `rt_number` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `phone_is_whatsapp` BOOLEAN NOT NULL DEFAULT true,
    `alamat` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`rt_number`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `spatial_point_rt` ADD CONSTRAINT `spatial_point_rt_point_id_fkey` FOREIGN KEY (`point_id`) REFERENCES `spatial_points`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `spatial_point_rt` ADD CONSTRAINT `spatial_point_rt_rt_number_fkey` FOREIGN KEY (`rt_number`) REFERENCES `rt_leaders`(`rt_number`) ON DELETE CASCADE ON UPDATE CASCADE;
