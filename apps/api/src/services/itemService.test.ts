import { describe, expect, it } from 'vitest';
import { resolveRestoreTarget } from './itemService';

/**
 * 回收站恢复的目标状态：回到删除前状态，且绝不把不该公开的内容直接公开。
 * 背景：修复前 restore 一律恢复为 published，草稿/归档条目会被直接公开。
 */
describe('resolveRestoreTarget', () => {
  it('草稿删除后恢复仍是草稿', () => {
    expect(resolveRestoreTarget('draft', true)).toBe('draft');
  });

  it('已发布删除后恢复仍是已发布（发布条件仍满足）', () => {
    expect(resolveRestoreTarget('published', true)).toBe('published');
  });

  it('已归档删除后恢复仍是已归档', () => {
    expect(resolveRestoreTarget('archived', true)).toBe('archived');
    expect(resolveRestoreTarget('archived', false)).toBe('archived');
  });

  it('恢复为已发布前重新校验发布条件，不满足则降级为草稿', () => {
    expect(resolveRestoreTarget('published', false)).toBe('draft');
  });

  it('旧数据没有删除前记录（NULL）时回落为草稿，绝不直接公开', () => {
    expect(resolveRestoreTarget(null, true)).toBe('draft');
  });

  it('异常数据（删除前状态为回收站）同样回落为草稿', () => {
    expect(resolveRestoreTarget('trashed', true)).toBe('draft');
  });
});
