/**
 * 改动面板的折叠状态。
 *
 * 目录树节点与「本轮 / 更早」分组共用一份按会话持久化的记录，
 * 让用户重新打开右侧「改动」后仍停留在上次的折叠形态。
 *
 * 记录的是每个分组的显式展开布尔值而非「折叠列表」：目录默认展开、
 * 「更早」分组默认折叠，两种默认值混在一起时，只有显式记录才能分别表达。
 */

/** `{ [sessionId]: { [groupId]: expanded } }`；groupId 形如 `repo:/src/main` 或 `non-git:更早`。 */
export type DiffCollapsedGroupsState = Record<string, Record<string, boolean>>

/** 单个会话最多保留的分组记录，防止长期使用后 localStorage 无限增长。 */
export const MAX_COLLAPSED_GROUPS_PER_SESSION = 500

/** 某个分组是否展开；该会话从未记录过这个分组时使用调用方给定的默认值。 */
export function isGroupExpanded(
  state: DiffCollapsedGroupsState,
  sessionId: string,
  groupId: string,
  defaultExpanded: boolean,
): boolean {
  return state[sessionId]?.[groupId] ?? defaultExpanded
}

/** 当前会话里显式折叠的目录集合，供目录树快速判断。 */
export function readCollapsedGroupIds(state: DiffCollapsedGroupsState, sessionId: string): Set<string> {
  const record = state[sessionId]
  const collapsed = new Set<string>()
  if (!record) return collapsed
  for (const [groupId, expanded] of Object.entries(record)) {
    if (!expanded) collapsed.add(groupId)
  }
  return collapsed
}

/** 写入单个分组的展开状态；状态未变化时原样返回，避免多余渲染。 */
export function setGroupExpanded(
  state: DiffCollapsedGroupsState,
  sessionId: string,
  groupId: string,
  expanded: boolean,
): DiffCollapsedGroupsState {
  const record = state[sessionId]
  if (record?.[groupId] === expanded) return state
  const nextRecord: Record<string, boolean> = { ...record, [groupId]: expanded }
  const entries = Object.entries(nextRecord)
  const trimmed = entries.length > MAX_COLLAPSED_GROUPS_PER_SESSION
    ? Object.fromEntries(entries.slice(-MAX_COLLAPSED_GROUPS_PER_SESSION))
    : nextRecord
  return { ...state, [sessionId]: trimmed }
}

/** 清理已删除会话的折叠记录。 */
export function pruneCollapsedGroups(
  state: DiffCollapsedGroupsState,
  retainedSessionIds: ReadonlySet<string>,
): DiffCollapsedGroupsState {
  const entries = Object.entries(state).filter(([sessionId]) => retainedSessionIds.has(sessionId))
  if (entries.length === Object.keys(state).length) return state
  return Object.fromEntries(entries)
}

/** 还原存储中的原始值；丢弃结构非法的会话与分组记录。 */
export function sanitizeCollapsedGroups(raw: unknown): DiffCollapsedGroupsState | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const restored: DiffCollapsedGroupsState = {}
  for (const [sessionId, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue
    const record: Record<string, boolean> = {}
    for (const [groupId, expanded] of Object.entries(value)) {
      if (typeof expanded === 'boolean') record[groupId] = expanded
    }
    restored[sessionId] = record
  }
  return restored
}
