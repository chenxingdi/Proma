import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

type ServiceModule = typeof import('./web-image-service-settings')

let service: ServiceModule
let tempHome: string
const originalHome = process.env.HOME
const originalPromaDev = process.env.PROMA_DEV
const originalTavilyKey = process.env.PROMA_TAVILY_API_KEY
const originalSerpKey = process.env.PROMA_SERPAPI_KEY

const fetchMock = mock(async (_url: string | URL, _init?: RequestInit) => new Response('{}', { status: 200 }))

mock.module('node:os', () => ({ ...os, homedir: () => tempHome }))
mock.module('./proxy-fetch', () => ({ getFetchFn: () => fetchMock }))
mock.module('./proxy-settings-service', () => ({ getEffectiveProxyUrl: async () => undefined }))

mock.module('electron', () => ({
  app: {
    isPackaged: true,
    getPath: () => join(process.env.HOME ?? tempHome, 'Library', 'Application Support'),
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`enc:${value}`),
    decryptString: (value: Buffer) => value.toString('utf-8').slice(4),
  },
}))

beforeAll(async () => {
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-web-image-service-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  delete process.env.PROMA_TAVILY_API_KEY
  delete process.env.PROMA_SERPAPI_KEY
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
  service = await import('./web-image-service-settings')
})

beforeEach(() => {
  rmSync(join(tempHome, '.proma'), { recursive: true, force: true })
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
})

afterAll(() => {
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  if (originalPromaDev === undefined) delete process.env.PROMA_DEV
  else process.env.PROMA_DEV = originalPromaDev
  if (originalTavilyKey === undefined) delete process.env.PROMA_TAVILY_API_KEY
  else process.env.PROMA_TAVILY_API_KEY = originalTavilyKey
  if (originalSerpKey === undefined) delete process.env.PROMA_SERPAPI_KEY
  else process.env.PROMA_SERPAPI_KEY = originalSerpKey
  rmSync(tempHome, { recursive: true, force: true })
})

describe('图片来源服务凭据', () => {
  test('Given 未配置 Then 两个服务都显示未配置', () => {
    const settings = service.getWebImageServiceSettings()
    expect(settings.tavily.configured).toBe(false)
    expect(settings.serpApi.configured).toBe(false)
  })

  test('Given 保存 Tavily Key Then 写入 Chat 工具凭据并脱敏展示', () => {
    const settings = service.updateWebImageServiceApiKey('tavily', 'tvly-1234')
    expect(settings.tavily.configured).toBe(true)
    expect(settings.tavily.keyHint).toBe('••••1234')
    const chatTools = JSON.parse(readFileSync(join(tempHome, '.proma', 'chat-tools.json'), 'utf-8'))
    expect(chatTools.toolCredentials['web-search'].apiKey).toBe('tvly-1234')
  })

  test('Given 保存 SerpAPI Key Then 加密写入 settings.json 并脱敏展示', () => {
    const settings = service.updateWebImageServiceApiKey('serpapi', 'secret-5678')
    expect(settings.serpApi.configured).toBe(true)
    expect(settings.serpApi.keyHint).toBe('••••5678')
    const appSettings = JSON.parse(readFileSync(join(tempHome, '.proma', 'settings.json'), 'utf-8'))
    expect(Buffer.from(appSettings.serpApi.apiKey, 'base64').toString('utf-8')).toBe('enc:secret-5678')
  })

  test('Given 没有 API Key Then 测试连接返回失败提示', async () => {
    const result = await service.testWebImageServiceApiKey('tavily')
    expect(result.success).toBe(false)
    expect(result.message).toContain('API Key')
  })

  test('Given 传入草稿 Key Then keyHint 只显示尾号', () => {
    expect(service.keyHint('abcdef')).toBe('••••cdef')
    expect(service.keyHint('abc')).toBe('••••')
  })

  test('Given Tavily 草稿 Key Then 测试按钮向 Tavily 搜索接口发起最小请求', async () => {
    fetchMock.mockClear()
    const result = await service.testWebImageServiceApiKey('tavily', 'tvly-draft')
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit | undefined]
    expect(String(url)).toBe('https://api.tavily.com/search')
    expect(String(init?.headers && new Headers(init.headers).get('Authorization'))).toBe('Bearer tvly-draft')
    expect(String(init?.body)).toContain('"max_results":1')
  })

  test('Given SerpAPI 草稿 Key Then 测试按钮向 Google Images 接口发起最小请求', async () => {
    fetchMock.mockClear()
    const result = await service.testWebImageServiceApiKey('serpapi', 'serp-draft')
    expect(result.success).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url] = fetchMock.mock.calls[0] as [string | URL, RequestInit | undefined]
    const parsed = new URL(String(url))
    expect(parsed.origin + parsed.pathname).toBe('https://serpapi.com/search.json')
    expect(parsed.searchParams.get('engine')).toBe('google_images')
    expect(parsed.searchParams.get('api_key')).toBe('serp-draft')
  })
})
