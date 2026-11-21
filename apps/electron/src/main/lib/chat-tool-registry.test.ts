/**
 * chat-tool-registry 测试
 *
 * 聚焦 getAllToolIds：验证它覆盖内置工具与自定义工具，且不检查开关/凭据。
 * 通过 mock 隔离工具配置，避免依赖真实用户 ~/.proma/chat-tools.json。
 */

import { describe, expect, test, mock } from 'bun:test'
import type { ChatToolMeta } from '@proma/shared'

// 构造两个自定义工具元数据，供 getAllToolIds 采集 id
const customMeta = (id: string): ChatToolMeta => ({
  id,
  name: id,
  description: `自定义工具 ${id}`,
  params: [],
  category: 'custom',
  executorType: 'http',
})

// 隔离配置：固定返回两个自定义工具；工具开关全部关闭也应被 getAllToolIds 忽略开关
mock.module('./chat-tool-config', () => ({
  getChatToolsConfig: () => ({
    toolStates: {
      'agent-mode-recommend': { enabled: false },
      'custom-alpha': { enabled: false },
      'custom-beta': { enabled: false },
    },
    toolCredentials: {},
    customTools: [customMeta('custom-alpha'), customMeta('custom-beta')],
  }),
}))

const { getAllToolIds } = await import('./chat-tool-registry')

describe('chat-tool-registry', () => {
  test('Given 内置工具与两个自定义工具 When getAllToolIds Then 返回全部工具 id，忽略开关状态', () => {
    const ids = getAllToolIds()
    expect(ids).toContain('agent-mode-recommend')
    expect(ids).toContain('custom-alpha')
    expect(ids).toContain('custom-beta')
    expect(ids).toHaveLength(3)
  })

  test('Given 工具 id 列表 When getAllToolIds Then 结果均为字符串且无重复', () => {
    const ids = getAllToolIds()
    expect(ids.every((id) => typeof id === 'string')).toBe(true)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
