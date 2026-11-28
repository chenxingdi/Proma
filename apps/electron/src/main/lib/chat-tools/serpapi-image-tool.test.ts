import { describe, expect, test } from 'bun:test'
import {
  SERPAPI_IMAGE_TOOL_NAME,
  executeSerpApiImageSearch,
  formatImageResults,
  isSerpApiImageToolCall,
  parseSerpApiImages,
} from './serpapi-image-tool'

describe('parseSerpApiImages', () => {
  test('Given SerpAPI 标准响应 Then 提取图片字段', () => {
    const images = parseSerpApiImages({
      images_results: [
        {
          title: 'Example',
          thumbnail: 'https://serpapi.com/thumb.jpg',
          original: 'https://example.com/original.jpg',
          link: 'https://example.com/page',
          source: 'example.com',
        },
      ],
    })
    expect(images).toHaveLength(1)
    expect(images[0]?.title).toBe('Example')
    expect(images[0]?.thumbnailUrl).toBe('https://serpapi.com/thumb.jpg')
    expect(images[0]?.originalUrl).toBe('https://example.com/original.jpg')
  })

  test('Given 缺失缩略图 Then 回退到原图', () => {
    const images = parseSerpApiImages({
      images_results: [{ title: 'Only original', original: 'https://example.com/a.jpg' }],
    })
    expect(images[0]?.thumbnailUrl).toBe('https://example.com/a.jpg')
  })

  test('Given 不安全或无 URL 的结果 Then 过滤掉', () => {
    const images = parseSerpApiImages({
      images_results: [
        { title: 'Unsafe', thumbnail: 'https://e.com/u.jpg', unsafe: true },
        { title: 'No URL' },
        { title: 'Valid', thumbnail: 'https://e.com/v.jpg' },
      ],
    })
    expect(images).toHaveLength(1)
    expect(images[0]?.title).toBe('Valid')
  })

  test('Given limit 参数 Then 不超过上限', () => {
    const images = parseSerpApiImages({
      images_results: Array.from({ length: 10 }, (_, i) => ({ title: `I${i}`, thumbnail: `https://e.com/${i}.jpg` })),
    }, 2)
    expect(images).toHaveLength(2)
  })
})

describe('formatImageResults', () => {
  test('Given 图片列表 Then 编号输出并显示来源', () => {
    const text = formatImageResults([{
      title: 'Cat', thumbnailUrl: 'https://e.com/t.jpg', originalUrl: 'https://e.com/o.jpg', link: 'https://e.com', source: 'e.com',
    }])
    expect(text).toContain('1. Cat')
    expect(text).toContain('https://e.com/o.jpg')
    expect(text).toContain('来源: e.com')
  })

  test('Given 空列表 Then 明确说明没有找到', () => {
    expect(formatImageResults([])).toBe('没有找到相关图片。')
  })
})

describe('isSerpApiImageToolCall', () => {
  test('Given 图片工具名 Then 命中', () => {
    expect(isSerpApiImageToolCall(SERPAPI_IMAGE_TOOL_NAME)).toBe(true)
  })
  test('Given 其他工具名 Then 不命中', () => {
    expect(isSerpApiImageToolCall('WebSearch')).toBe(false)
  })
})

describe('executeSerpApiImageSearch', () => {
  const baseCall = { id: 'call-1', name: SERPAPI_IMAGE_TOOL_NAME, arguments: { query: 'coffee' } }

  test('Given 缺少 query Then 返回参数错误', async () => {
    const result = await executeSerpApiImageSearch(
      { ...baseCall, arguments: {} },
      { apiKey: 'k', fetchFn: (() => { throw new Error('不应发起请求') }) as unknown as typeof fetch },
    )
    expect(result.isError).toBe(true)
    expect(result.content).toContain('缺少 query')
  })

  test('Given 正常响应 Then 返回文本和结构化图片', async () => {
    const fakeFetch = (async (url: string | URL | Request) => {
      const urlString = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url
      const parsed = new URL(urlString)
      expect(parsed.searchParams.get('engine')).toBe('google_images')
      expect(parsed.searchParams.get('q')).toBe('coffee')
      expect(parsed.searchParams.get('api_key')).toBe('secret-key')
      return new Response(JSON.stringify({
        images_results: [{ title: 'Coffee', thumbnail: 'https://e.com/t.jpg', original: 'https://e.com/o.jpg' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }) as unknown as typeof fetch

    const result = await executeSerpApiImageSearch(baseCall, { apiKey: 'secret-key', fetchFn: fakeFetch })
    expect(result.isError).toBe(false)
    expect(result.content).toContain('Coffee')
    expect(result.images).toHaveLength(1)
  })

  test('Given SerpAPI 返回 error 字段 Then 返回错误结果', async () => {
    const fakeFetch = (async () => new Response(
      JSON.stringify({ error: 'Invalid API key' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )) as unknown as typeof fetch
    const result = await executeSerpApiImageSearch(baseCall, { apiKey: 'bad', fetchFn: fakeFetch })
    expect(result.isError).toBe(true)
    expect(result.content).toContain('Invalid API key')
  })
})
