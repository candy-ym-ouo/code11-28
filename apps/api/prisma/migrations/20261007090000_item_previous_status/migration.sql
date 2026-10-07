-- AlterTable：记录条目移入回收站前的状态，供「恢复」回到删除前状态
ALTER TABLE "items" ADD COLUMN "previous_status" "ItemStatus";

-- 回填旧数据：修复前已进回收站的条目，从审计日志（item.trash 记录的 before 快照）
-- 找回删除前状态；取每个条目最近一次移入回收站的记录。
-- 找不到审计记录的保持 NULL，恢复时安全回落为草稿（绝不直接公开）。
UPDATE "items" AS i
SET "previous_status" = sub."prev"::"ItemStatus"
FROM (
  SELECT DISTINCT ON ("target_id")
    "target_id",
    "diff" -> 'before' ->> 'status' AS "prev"
  FROM "audit_logs"
  WHERE "action" = 'item.trash'
    AND "target_type" = 'item'
  ORDER BY "target_id", "created_at" DESC
) AS sub
WHERE i."id" = sub."target_id"
  AND i."status" = 'trashed'
  AND sub."prev" IN ('draft', 'published', 'archived');
