import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TRANSITIONS,
  isPreTrashStatus,
  meetsPublishRequirements,
  resolveRestore,
  statusFromTrashAudit,
  statusFromVersionSnapshot,
} from './itemStatus';

const noClues = { acquiredAt: null, acquiredLabel: null, placeText: null, storyText: null };

describe('meetsPublishRequirements', () => {
  it('没有任何线索也没有图片时不满足', () => {
    expect(meetsPublishRequirements(noClues, 0)).toBe(false);
  });

  it.each([
    { acquiredAt: new Date() },
    { acquiredLabel: '爷爷留下的' },
    { placeText: '老宅阁楼' },
    { storyText: '一段故事' },
  ] as const)('任一线索即可发布：%s', (clue) => {
    expect(meetsPublishRequirements({ ...noClues, ...clue }, 0)).toBe(true);
  });

  it('有未删除图片即可发布', () => {
    expect(meetsPublishRequirements(noClues, 2)).toBe(true);
  });
});

describe('resolveRestore', () => {
  it('删除前是草稿：直接回到草稿', () => {
    expect(resolveRestore('draft', noClues, 0)).toEqual({ status: 'draft', warning: null });
  });

  it('删除前已发布且条件仍满足：恢复为已发布', () => {
    expect(resolveRestore('published', { ...noClues, storyText: '故事' }, 0)).toEqual({
      status: 'published',
      warning: null,
    });
  });

  it('删除前已归档且条件仍满足：恢复为已归档（而不是变成已发布）', () => {
    expect(resolveRestore('archived', { ...noClues, placeText: '北京' }, 0)).toEqual({
      status: 'archived',
      warning: null,
    });
  });

  it('删除前已发布但线索/图片已缺失：降级草稿并给出提示，绝不公开', () => {
    const decision = resolveRestore('published', noClues, 0);
    expect(decision.status).toBe('draft');
    expect(decision.warning).toBeTruthy();
  });

  it('删除前已归档但发布条件不再满足：同样降级为草稿', () => {
    expect(resolveRestore('archived', noClues, 0).status).toBe('draft');
  });
});

describe('状态机', () => {
  it('只有 trashed 状态可以 restore；普通状态不能重复删除或直接恢复', () => {
    expect(ALLOWED_TRANSITIONS.trashed.has('restore')).toBe(true);
    expect(ALLOWED_TRANSITIONS.draft.has('restore')).toBe(false);
    expect(ALLOWED_TRANSITIONS.published.has('publish')).toBe(false);
    expect(ALLOWED_TRANSITIONS.trashed.has('trash')).toBe(false);
  });
});

describe('旧数据解析', () => {
  it('从 item.trash 审计 diff 中解析删除前状态', () => {
    expect(statusFromTrashAudit({ before: { status: 'published' }, after: { status: 'trashed' } })).toBe(
      'published',
    );
    expect(statusFromTrashAudit({ before: { status: 'archived' } })).toBe('archived');
    expect(statusFromTrashAudit({ before: { status: 'trashed' } })).toBeNull();
    expect(statusFromTrashAudit(null)).toBeNull();
    expect(statusFromTrashAudit({})).toBeNull();
  });

  it('从版本快照解析状态', () => {
    expect(statusFromVersionSnapshot({ status: 'draft' })).toBe('draft');
    expect(statusFromVersionSnapshot({ status: 'trashed' })).toBeNull();
    expect(statusFromVersionSnapshot('nope')).toBeNull();
  });

  it('isPreTrashStatus 只接受三种非回收站状态', () => {
    expect(isPreTrashStatus('draft')).toBe(true);
    expect(isPreTrashStatus('published')).toBe(true);
    expect(isPreTrashStatus('archived')).toBe(true);
    expect(isPreTrashStatus('trashed')).toBe(false);
    expect(isPreTrashStatus(undefined)).toBe(false);
  });
});
