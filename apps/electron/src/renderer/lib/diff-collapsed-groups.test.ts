import { describe, expect, test } from 'bun:test'
import {
  MAX_COLLAPSED_GROUPS_PER_SESSION,
  isGroupExpanded,
  pruneCollapsedGroups,
  readCollapsedGroupIds,
  sanitizeCollapsedGroups,
  setGroupExpanded,
} from './diff-collapsed-groups'
import type { DiffCollapsedGroupsState } from './diff-collapsed-groups'

describe('改动面板折叠状态', () => {
  test('未记录的分组使用调用方给定的默认值', () => {
    const state: DiffCollapsedGroupsState = {}
    expect(isGroupExpanded(state, 'session-a', 'repo:/src', true)).toBe(true)
    expect(isGroupExpanded(state, 'session-a', 'non-git:更早', false)).toBe(false)
  })

  test('写入后按会话隔离，不互相影响', () => {
    let state = setGroupExpanded({}, 'session-a', 'repo:/src', false)
    state = setGroupExpanded(state, 'session-b', 'repo:/src', true)
    expect(isGroupExpanded(state, 'session-a', 'repo:/src', true)).toBe(false)
    expect(isGroupExpanded(state, 'session-b', 'repo:/src', false)).toBe(true)
  })

  test('重复写入相同值时返回原对象', () => {
    const state = setGroupExpanded({}, 'session-a', 'repo:/src', false)
    expect(setGroupExpanded(state, 'session-a', 'repo:/src', false)).toBe(state)
  })

  test('折叠集合只包含显式折叠的目录', () => {
    let state = setGroupExpanded({}, 'session-a', 'repo:/src', false)
    state = setGroupExpanded(state, 'session-a', 'repo:/lib', true)
    const collapsed = readCollapsedGroupIds(state, 'session-a')
    expect(collapsed.has('repo:/src')).toBe(true)
    expect(collapsed.has('repo:/lib')).toBe(false)
  })

  test('单个会话的记录有上限，保留最近写入的分组', () => {
    let state: DiffCollapsedGroupsState = {}
    for (let index = 0; index < MAX_COLLAPSED_GROUPS_PER_SESSION + 5; index += 1) {
      state = setGroupExpanded(state, 'session-a', `group-${index}`, false)
    }
    const record = state['session-a']!
    expect(Object.keys(record)).toHaveLength(MAX_COLLAPSED_GROUPS_PER_SESSION)
    expect(record['group-0']).toBeUndefined()
    expect(record[`group-${MAX_COLLAPSED_GROUPS_PER_SESSION + 4}`]).toBe(false)
  })

  test('清理已删除会话的记录', () => {
    let state = setGroupExpanded({}, 'session-a', 'repo:/src', false)
    state = setGroupExpanded(state, 'session-b', 'repo:/src', false)
    const pruned = pruneCollapsedGroups(state, new Set(['session-b']))
    expect(Object.keys(pruned)).toEqual(['session-b'])
    expect(pruneCollapsedGroups(state, new Set(['session-a', 'session-b']))).toBe(state)
  })

  test('丢弃存储中的非法结构', () => {
    expect(sanitizeCollapsedGroups(null)).toBeUndefined()
    expect(sanitizeCollapsedGroups(['session-a'])).toBeUndefined()
    expect(sanitizeCollapsedGroups({ 'session-a': ['repo:/src'] })).toEqual({})
    expect(sanitizeCollapsedGroups({
      'session-a': { 'repo:/src': false, 'repo:/lib': 'yes' },
      'session-b': { 'repo:/src': true },
    })).toEqual({ 'session-a': { 'repo:/src': false }, 'session-b': { 'repo:/src': true } })
  })
})
