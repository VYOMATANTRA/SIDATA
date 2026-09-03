-- Add CHECK constraint to replace the dropped FK on spatial_point_rt.rt_number.
-- The FK (spatial_point_rt_rt_number_fkey) was dropped in migration 20260820000000
-- because Prisma 7 requires a declared back-relation on both sides of a @relation,
-- and adding `spatialPointRts SpatialPointRt[]` to the RtLeader model would be
-- semantically incorrect — the coordinate join is an asymmetric, query-time filtered
-- read, not a navigable relation (see SPEC.md §7).
--
-- Manggar has 100 RTs (rt_number 1–100). If the RT count changes, update the
-- BETWEEN bounds here and in SPEC.md §7.
ALTER TABLE `spatial_point_rt`
  ADD CONSTRAINT `spatial_point_rt_rt_number_check`
  CHECK (`rt_number` BETWEEN 1 AND 100);
