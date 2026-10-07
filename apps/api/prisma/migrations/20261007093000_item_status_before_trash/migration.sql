-- 回收站条目需要记住「删除前状态」，恢复时回到该状态而不是一律变成已发布。
ALTER TABLE "items" ADD COLUMN "status_before_trash" "ItemStatus";

-- 旧数据兼容：为已在回收站里的条目回填删除前状态。
-- 1) 优先取最近一次 item.trash 审计日志记录的删除前状态（changeStatus 的 diff.before.status）；
-- 2) 审计缺失时退而求其次，取最后一个版本快照里的状态（发布/归档通常会留下快照）；
-- 3) 都没有则按草稿处理，保证恢复后绝不会意外公开。
WITH trash_log AS (
    SELECT DISTINCT ON (target_id)
        target_id,
        NULLIF(diff #>> '{before,status}', '') AS before_status
    FROM audit_logs
    WHERE action = 'item.trash'
      AND target_type = 'item'
      AND diff ? 'before'
      AND diff #>> '{before,status}' IN ('draft', 'published', 'archived')
    ORDER BY target_id, created_at DESC
),
last_version AS (
    SELECT DISTINCT ON (v.item_id)
        v.item_id,
        NULLIF(v.snapshot ->> 'status', '') AS snapshot_status
    FROM item_versions v
    WHERE v.snapshot ->> 'status' IN ('draft', 'published', 'archived')
    ORDER BY v.item_id, v.version DESC
)
UPDATE items i
SET status_before_trash = COALESCE(t.before_status, v.snapshot_status, 'draft')::"ItemStatus"
FROM trash_log t
FULL JOIN last_version v ON v.item_id = t.target_id
WHERE i.id = COALESCE(t.target_id, v.item_id)
  AND i.status = 'trashed';
