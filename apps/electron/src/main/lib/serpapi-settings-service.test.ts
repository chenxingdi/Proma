import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

type ServiceModule = typeof import('./serpapi-settings-service')

let service: ServiceModule
let tempHome: string
const originalHome = process.env.HOME
const originalPromaDev = process.env.PROMA_DEV
const originalSerpApiKey = process.env.PROMA_SERPAPI_KEY

mock.module('node:os', () => ({ ...os, homedir: () => tempHome }))

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
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-serpapi-settings-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  delete process.env.PROMA_SERPAPI_KEY
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
  service = await import('./serpapi-settings-service')
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
  if (originalSerpApiKey === undefined) delete process.env.PROMA_SERPAPI_KEY
  else process.env.PROMA_SERPAPI_KEY = originalSerpApiKey
  rmSync(tempHome, { recursive: true, force: true })
})

function readSettings(): { serpApi?: { apiKey?: string } } {
  return JSON.parse(readFileSync(join(tempHome, '.proma', 'settings.json'), 'utf-8'))
}

describe('SerpAPI 设置服务', () => {
  test('保存密钥时加密落盘，且只返回脱敏尾号', () => {
    const result = service.updateSerpApiSettings({ apiKey: 'secret-1234' })
    expect(result.configured).toBe(true)
    expect(result.keyHint).toBe('••••1234')
    expect(Buffer.from(readSettings().serpApi?.apiKey ?? '', 'base64').toString('utf-8')).toBe('enc:secret-1234')
    expect(service.getSerpApiKey()).toBe('secret-1234')
  })

  test('未传 apiKey 时保留已有密钥', () => {
    service.updateSerpApiSettings({ apiKey: 'secret-1234' })
    const result = service.updateSerpApiSettings({})
    expect(result.configured).toBe(true)
    expect(service.getSerpApiKey()).toBe('secret-1234')
  })

  test('传入空字符串可清除密钥', () => {
    service.updateSerpApiSettings({ apiKey: 'secret-1234' })
    const result = service.updateSerpApiSettings({ apiKey: '' })
    expect(result.configured).toBe(false)
    expect(service.getSerpApiKey()).toBeUndefined()
  })

  test('没有落盘密钥时回退到环境变量', () => {
    const env = { PROMA_SERPAPI_KEY: 'env-key' }
    expect(service.getSerpApiKey(env)).toBe('env-key')
    expect(service.getPublicSerpApiSettings(env).environmentConfigured).toBe(true)
  })

  test('落盘密钥优先于环境变量', () => {
    service.updateSerpApiSettings({ apiKey: 'stored-key' })
    expect(service.getSerpApiKey({ PROMA_SERPAPI_KEY: 'env-key' })).toBe('stored-key')
  })
})
