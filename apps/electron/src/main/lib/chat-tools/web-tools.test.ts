import { describe, expect, test } from 'bun:test'
import {
  executeWebTool,
  extractWebImages,
  collectWebImages,
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

describe('extractWebImages', () => {
  test('Given 网页返回图片 URL Then 只保留合法地址并关联来源网页', () => {
    const images = extractWebImages(
      ['https://img.example.com/a.jpg', 'javascript:alert(1)', 'https://img.example.com/a.jpg'],
      { title: 'Example Page', url: 'https://example.com/page' },
    )
    expect(images).toHaveLength(1)
    expect(images[0]?.title).toBe('Example Page')
    expect(images[0]?.thumbnailUrl).toBe('https://img.example.com/a.jpg')
    expect(images[0]?.link).toBe('https://example.com/page')
    expect(images[0]?.source).toBe('example.com')
  })

  test('Given 图片对象带描述 Then 使用描述作为标题', () => {
    const images = extractWebImages(
      [{ url: 'https://img.example.com/b.png', description: '产品示意图' }],
      { title: 'Example', url: 'https://www.example.com' },
    )
    expect(images[0]?.title).toBe('产品示意图')
  })

  test('Given 没有图片 Then 返回空数组', () => {
    expect(extractWebImages(undefined, { url: 'https://example.com' })).toEqual([])
    expect(extractWebImages([], { url: 'https://example.com' })).toEqual([])
  })

  test('Given 图片数量超过上限 Then 只保留前 N 张', () => {
    const items = Array.from({ length: 12 }, (_, index) => `https://img.example.com/${index}.jpg`)
    expect(extractWebImages(items, {}, 3)).toHaveLength(3)
  })
})

describe('collectWebImages', () => {
  test('Given 多个网页结果 Then 合并图片并去重', () => {
    const images = collectWebImages([
      { title: 'A', url: 'https://a.com', images: ['https://img.example.com/1.jpg'] },
      { title: 'B', url: 'https://b.com', images: ['https://img.example.com/1.jpg', 'https://img.example.com/2.jpg'] },
    ])
    expect(images.map((image) => image.originalUrl)).toEqual([
      'https://img.example.com/1.jpg',
      'https://img.example.com/2.jpg',
    ])
    expect(images[0]?.source).toBe('a.com')
    expect(images[1]?.source).toBe('b.com')
  })
})

describe('executeWebTool 网页图片', () => {
  test('Given WebSearch 返回 per-result images Then 请求带 include_images 且结果带 images', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchFn = (async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        results: [{
          title: 'NASA',
          url: 'https://nasa.gov/article',
          content: 'Article',
          images: ['https://images.nasa.gov/photo.jpg'],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof globalThis.fetch

    const result = await executeWebTool(
      { id: 'web-1', name: WEB_SEARCH_TOOL_NAME, arguments: { query: 'NASA' } },
      { fetchFn, apiKey: 'tvly-test' },
    )
    expect(requestBody?.include_images).toBe(true)
    expect(result.images?.[0]?.originalUrl).toBe('https://images.nasa.gov/photo.jpg')
    expect(result.images?.[0]?.link).toBe('https://nasa.gov/article')
  })

  test('Given WebFetch 返回图片 Then 请求带 include_images 且结果带 images', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchFn = (async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        results: [{
          url: 'https://example.com/article',
          title: 'Article',
          raw_content: '正文',
          images: ['https://example.com/cover.jpg'],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof globalThis.fetch

    const result = await executeWebTool(
      { id: 'fetch-1', name: WEB_FETCH_TOOL_NAME, arguments: { url: 'https://example.com/article' } },
      { fetchFn, apiKey: 'tvly-test' },
    )
    expect(requestBody?.include_images).toBe(true)
    expect(result.images?.[0]?.originalUrl).toBe('https://example.com/cover.jpg')
  })

  test('Given 网页没有图片 Then 结果不携带 images', async () => {
    const fetchFn = (async () => new Response(JSON.stringify({
      results: [{ title: 'Text only', url: 'https://example.com', content: 'No images' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof globalThis.fetch

    const result = await executeWebTool(
      { id: 'web-2', name: WEB_SEARCH_TOOL_NAME, arguments: { query: 'text only' } },
      { fetchFn, apiKey: 'tvly-test' },
    )
    expect(result.images).toEqual([])
  })
})
