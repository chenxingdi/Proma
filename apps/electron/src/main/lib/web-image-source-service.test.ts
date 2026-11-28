import { afterAll, beforeAll, beforeEach, describe, expect, test, mock } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

type ServiceModule = typeof import('./web-image-source-service')

let service: ServiceModule
let tempHome: string
const originalHome = process.env.HOME
const originalPromaDev = process.env.PROMA_DEV

mock.module('node:os', () => ({ ...os, homedir: () => tempHome }))

beforeAll(async () => {
  tempHome = mkdtempSync(join(os.tmpdir(), 'proma-web-image-source-'))
  process.env.HOME = tempHome
  process.env.PROMA_DEV = '0'
  mkdirSync(join(tempHome, '.proma'), { recursive: true })
  service = await import('./web-image-source-service')
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
  rmSync(tempHome, { recursive: true, force: true })
})

describe('联网图片来源服务设置', () => {
  test('Given 未配置 Then 默认使用 Tavily', () => {
    expect(service.getWebImageSource()).toBe('tavily')
  })

  test('Given 选择 SerpAPI Then 持久化并读取 SerpAPI', () => {
    expect(service.updateWebImageSource('serpapi')).toBe('serpapi')
    expect(service.getWebImageSource()).toBe('serpapi')
    const settings = JSON.parse(readFileSync(join(tempHome, '.proma', 'settings.json'), 'utf-8'))
    expect(settings.webImageSource).toBe('serpapi')
  })

  test('Given 未知配置值 Then 回退到 Tavily', () => {
    const settingsPath = join(tempHome, '.proma', 'settings.json')
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(settingsPath, JSON.stringify({ webImageSource: 'unknown' }))
    expect(service.getWebImageSource()).toBe('tavily')
  })

  test('Given 更新为非法值 Then 归一化为 Tavily', () => {
    expect(service.updateWebImageSource('unknown' as 'tavily')).toBe('tavily')
  })
})
