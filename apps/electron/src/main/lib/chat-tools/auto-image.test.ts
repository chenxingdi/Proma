import { describe, expect, test } from 'bun:test'
import type { ToolCall, ToolResult } from '@proma/core'
import { resolveAutoImageQuery } from './auto-image'
import { WEB_SEARCH_TOOL_NAME } from './web-tools'
import { SERPAPI_IMAGE_TOOL_NAME } from './serpapi-image-tool'

function searchCall(query = '量子计算'): ToolCall {
  return { id: 'search-1', name: WEB_SEARCH_TOOL_NAME, arguments: { query } }
}

function result(id: string, content = '1. 量子计算进展\n   https://example.com', isError = false): ToolResult {
  return { toolCallId: id, content, isError }
}

describe('联网搜索自动附带图片', () => {
  test('Given WebSearch 成功且图片工具可用 Then 用首条来源标题作为图片关键词', () => {
    const query = resolveAutoImageQuery(
      [searchCall('量子计算')],
      [result('search-1')],
      true,
      true,
    )
    expect(query).toBe('量子计算进展')
  })

  test('Given WebSearch 结果无标题 Then 回退到搜索关键词', () => {
    const query = resolveAutoImageQuery(
      [searchCall('量子计算')],
      [result('search-1', '没有找到相关结果。')],
      true,
      true,
    )
    expect(query).toBe('量子计算')
  })

  test('Given WebSearch 失败 Then 不自动附带图片', () => {
    const query = resolveAutoImageQuery(
      [searchCall()],
      [result('search-1', '执行失败', true)],
      true,
      true,
    )
    expect(query).toBeUndefined()
  })

  test('Given 图片工具未启用 Then 不自动附带图片', () => {
    const query = resolveAutoImageQuery([searchCall()], [result('search-1')], false, true)
    expect(query).toBeUndefined()
  })

  test('Given 没有 SerpAPI Key Then 不自动附带图片', () => {
    const query = resolveAutoImageQuery([searchCall()], [result('search-1')], true, false)
    expect(query).toBeUndefined()
  })

  test('Given 本轮已显式调用图片搜索 Then 不重复触发', () => {
    const calls: ToolCall[] = [
      searchCall(),
      { id: 'image-1', name: SERPAPI_IMAGE_TOOL_NAME, arguments: { query: '量子计算' } },
    ]
    const query = resolveAutoImageQuery(calls, [result('search-1')], true, true)
    expect(query).toBeUndefined()
  })

  test('Given 只有 WebFetch 调用 Then 不自动附带图片', () => {
    const calls: ToolCall[] = [{ id: 'fetch-1', name: 'WebFetch', arguments: { url: 'https://example.com' } }]
    expect(resolveAutoImageQuery(calls, [result('fetch-1')], true, true)).toBeUndefined()
  })

  test('Given 成功与失败的 WebSearch 并存 Then 选择成功的结果', () => {
    const calls: ToolCall[] = [
      searchCall('失败关键词'),
      { id: 'search-2', name: WEB_SEARCH_TOOL_NAME, arguments: { query: '成功关键词' } },
    ]
    const results = [result('search-1', '失败', true), result('search-2', '1. 成功来源\n   https://example.com')]
    expect(resolveAutoImageQuery(calls, results, true, true)).toBe('成功来源')
  })
})
