import type { Item } from '@prisma/client';

/**
 * 条目状态机。
 *
 * 关键约束：回收站（trashed）不是终态，恢复时必须回到「删除前」的状态，
 * 因此删除时要在 Item.statusBeforeTrash 里记住来源状态，恢复时取出来。
 * 旧数据没有该字段时，调用方负责从审计日志/版本快照兜底推断。
 */
export const ALLOWED_TRANSITIONS = {
  draft: new Set(['publish', 'trash']),
  published: new Set(['archive', 'trash']),
  archived: new Set(['publish', 'trash']),
  trashed: new Set(['restore']),
} as const;

export type StatusAction = 'publish' | 'archive' | 'restore' | 'trash';

/** 发布（对外可见）的最低门槛：至少有一条线索或一张图片。 */
export function meetsPublishRequirements(
  item: Pick<Item, 'acquiredAt' | 'acquiredLabel' | 'placeText' | 'storyText'>,
  liveMediaCount: number,
): boolean {
  const hasClue = Boolean(item.acquiredAt || item.acquiredLabel || item.placeText || item.storyText);
  return hasClue || liveMediaCount > 0;
}

const PRE_TRASH_STATUSES = ['draft', 'published', 'archived'] as const;
export type PreTrashStatus = (typeof PRE_TRASH_STATUSES)[number];

export function isPreTrashStatus(value: unknown): value is PreTrashStatus {
  return typeof value === 'string' && (PRE_TRASH_STATUSES as readonly string[]).includes(value);
}

/** 从审计日志 item.trash 记录里解析删除前状态。 */
export function statusFromTrashAudit(diff: unknown): PreTrashStatus | null {
  if (!diff || typeof diff !== 'object') return null;
  const before = (diff as { before?: unknown }).before;
  if (!before || typeof before !== 'object') return null;
  const status = (before as { status?: unknown }).status;
  return isPreTrashStatus(status) ? status : null;
}

/** 从版本快照里解析当时的状态（旧数据兜底）。 */
export function statusFromVersionSnapshot(snapshot: unknown): PreTrashStatus | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const status = (snapshot as { status?: unknown }).status;
  return isPreTrashStatus(status) ? status : null;
}

export interface RestoreDecision {
  status: PreTrashStatus;
  /** 非空表示没能回到删除前状态（通常是发布条件已不满足），需要提示用户。 */
  warning: string | null;
}

/**
 * 计算恢复后的状态：
 * - 删除前是草稿：直接回到草稿（草稿不公开，无需重新校验）；
 * - 删除前是已发布/已归档（对家人公开）：必须重新校验发布条件；
 *   条件不再满足（如线索被清空、图片被删）时降级为草稿，绝不恢复成公开状态。
 */
export function resolveRestore(
  previousStatus: PreTrashStatus,
  item: Pick<Item, 'acquiredAt' | 'acquiredLabel' | 'placeText' | 'storyText'>,
  liveMediaCount: number,
): RestoreDecision {
  if (previousStatus === 'draft') return { status: 'draft', warning: null };
  if (meetsPublishRequirements(item, liveMediaCount)) return { status: previousStatus, warning: null };
  return {
    status: 'draft',
    warning: '未能恢复为删除前的公开状态：发布所需线索已不完整，已恢复为草稿，补充线索或图片后再发布。',
  };
}
