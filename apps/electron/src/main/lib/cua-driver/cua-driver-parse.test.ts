import { describe, expect, test } from 'bun:test'
import { parseCheckUpdateOutput } from './cua-driver-parse'

const REAL_OUTPUT = JSON.stringify({
  cache_hit: false,
  checked_at: '2026-11-20T09:19:59Z',
  current_channel: 'stable',
  current_version: '0.47.7',
  error: null,
  install_command: 'irm https://cua.ai/driver/install.ps1 | iex',
  latest_version: '0.55.0',
  release_notes_url: 'https://github.com/trycua/cua/releases/tag/cua-driver-rs-v0.55.0',
  selected_channel: 'stable',
  source: 'github_releases',
  update_available: true,
})

describe('Cua Driver check-update 输出解析', () => {
  test('Given 官方真实 JSON When 解析 Then 得到结构化结果', () => {
    const result = parseCheckUpdateOutput(REAL_OUTPUT)

    expect(result).not.toBeNull()
    expect(result?.current_version).toBe('0.47.7')
    expect(result?.latest_version).toBe('0.55.0')
    expect(result?.update_available).toBe(true)
    expect(result?.source).toBe('github_releases')
    expect(result?.install_command).toContain('cua.ai/driver/install.ps1')
  })

  test('Given 已是最新版本的 JSON When 解析 Then update_available 为 false', () => {
    const output = REAL_OUTPUT.replace('"update_available":true', '"update_available":false')
    expect(parseCheckUpdateOutput(output)?.update_available).toBe(false)
  })

  test('Given 非 JSON 文本 When 解析 Then 返回 null 而不抛错', () => {
    expect(() => parseCheckUpdateOutput('not json')).not.toThrow()
    expect(parseCheckUpdateOutput('not json')).toBeNull()
  })

  test('Given 缺少版本字段的 JSON When 解析 Then 返回 null', () => {
    expect(parseCheckUpdateOutput('{"update_available":true}')).toBeNull()
  })

  test('Given 部分字段缺失的 JSON When 解析 Then 用默认值补全', () => {
    const result = parseCheckUpdateOutput('{"current_version":"1.0.0","latest_version":"1.1.0"}')
    expect(result?.error).toBeNull()
    expect(result?.source).toBe('')
    expect(result?.current_channel).toBe('')
  })
})
