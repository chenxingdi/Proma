import { describe, expect, test } from 'bun:test'
import {
  WEB_FETCH_TOOL_NAME,
  WEB_SEARCH_API_KEY_ENV,
  WEB_SEARCH_TOOL_NAME,
  formatExtractedPage,
  formatSearchResults,
  isWebToolCall,
  isWebToolsAvailable,
  resolveApiKey,
} from './web-tools'

describe('resolveApiKey', () => {
  test('Given 用户配置了 apiKey Then 优先使用用户配置', () => {
    expect(resolveApiKey({ apiKey: ' tvly-user ' }, {})).toBe('tvly-user')
  })

  test('Given 没有配置凭据但有环境变量 Then 使用环境变量', () => {
    expect(resolveApiKey(undefined, { [WEB_SEARCH_API_KEY_ENV]: 'tvly-env' })).toBe('tvly-env')
  })

  test('Given 用户配置优先于环境变量 Then 使用配置值', () => {
    expect(resolveApiKey({ apiKey: 'tvly-user' }, { [WEB_SEARCH_API_KEY_ENV]: 'tvly-env' })).toBe('tvly-user')
  })

  test('Given 配置与环境变量都是空白 Then 返回 undefined', () => {
    expect(resolveApiKey(undefined, {})).toBeUndefined()
    expect(resolveApiKey({ apiKey: '   ' }, { [WEB_SEARCH_API_KEY_ENV]: '  ' })).toBeUndefined()
  })

  test('Given 没有任何密钥 Then 联网工具不可用', () => {
    expect(isWebToolsAvailable(undefined, {})).toBe(false)
  })

  test('Given 存在可用密钥 Then 联网工具判定为可用', () => {
    expect(isWebToolsAvailable({ apiKey: 'tvly-user' }, {})).toBe(true)
  })
})

describe('isWebToolCall', () => {
  test('Given 联网工具名称 Then 命中', () => {
    expect(isWebToolCall(WEB_SEARCH_TOOL_NAME)).toBe(true)
    expect(isWebToolCall(WEB_FETCH_TOOL_NAME)).toBe(true)
  })

  test('Given 非联网工具名称 Then 不命中', () => {
    expect(isWebToolCall('suggest_agent_mode')).toBe(false)
    expect(isWebToolCall('Bash')).toBe(false)
  })
})

describe('formatSearchResults', () => {
  test('Given 正常结果 Then 编号列出标题、链接与摘要', () => {
    const text = formatSearchResults([
      { title: 'Tavily Docs', url: 'https://docs.tavily.com', content: 'Search API reference' },
    ])
    expect(text).toContain('1. Tavily Docs')
    expect(text).toContain('https://docs.tavily.com')
    expect(text).toContain('Search API reference')
  })

  test('Given 结果数超过上限 Then 只输出请求数量', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ title: `R${i}`, url: `https://e.com/${i}`, content: 'x' }))
    const text = formatSearchResults(items, 2)
    expect(text).toContain('R0')
    expect(text).toContain('R1')
    expect(text).not.toContain('R2')
  })

  test('Given maxResults 越界 Then 收敛到合法区间', () => {
    const items = Array.from({ length: 8 }, (_, i) => ({ title: `R${i}`, url: `https://e.com/${i}` }))
    expect(formatSearchResults(items, 0)).toContain('R0')
    expect(formatSearchResults(items, 999).split('\n\n')).toHaveLength(8)
  })

  test('Given 空结果 Then 明确说明没有找到', () => {
    expect(formatSearchResults([])).toBe('没有找到相关结果。')
  })

  test('Given 缺少标题与链接 Then 不产生空行噪音', () => {
    const text = formatSearchResults([{ content: '只有摘要' }])
    expect(text).toContain('1. （无标题）')
    expect(text).toContain('只有摘要')
  })

  test('Given 摘要过长 Then 截断并标注', () => {
    const text = formatSearchResults([{ title: 'T', url: 'https://e.com', content: 'a'.repeat(2000) }])
    expect(text).toContain('内容已截断')
  })
})

describe('formatExtractedPage', () => {
  test('Given 正常正文 Then 带上来源与标题', () => {
    const text = formatExtractedPage(
      { url: 'https://example.com', title: 'Example Domain', raw_content: '正文内容' },
      'https://example.com',
    )
    expect(text).toContain('来源: https://example.com')
    expect(text).toContain('标题: Example Domain')
    expect(text).toContain('正文内容')
  })

  test('Given 没有正文 Then 提示换一个来源', () => {
    const text = formatExtractedPage({ url: 'https://example.com', raw_content: '' }, 'https://example.com')
    expect(text).toContain('没有得到正文内容')
  })

  test('Given 结果缺失 URL Then 回落到请求的 URL', () => {
    const text = formatExtractedPage({ raw_content: '正文' }, 'https://fallback.com')
    expect(text).toContain('来源: https://fallback.com')
  })

  test('Given 超长正文 Then 截断到上限', () => {
    const text = formatExtractedPage({ raw_content: 'a'.repeat(50) }, 'https://e.com', 10)
    expect(text).toContain('内容已截断')
  })
})
