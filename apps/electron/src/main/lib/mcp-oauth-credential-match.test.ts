import { describe, expect, test } from 'bun:test'
import { credentialProvidesClientSecret } from './mcp-oauth-credential-match'

const GITHUB_MCP = 'https://api.githubcopilot.com/mcp/'

describe('credentialProvidesClientSecret', () => {
  test('Given 已保存匹配该 URL 的 Secret When 查询 Then 返回 true', () => {
    expect(credentialProvidesClientSecret({ serverUrl: GITHUB_MCP, hasClientSecret: true }, GITHUB_MCP)).toBe(true)
  })

  test('Given 未保存任何凭据 When 查询 Then 返回 false', () => {
    expect(credentialProvidesClientSecret(undefined, GITHUB_MCP)).toBe(false)
  })

  test('Given 凭据存在但没有 Secret（只有 OAuth token）When 查询 Then 返回 false', () => {
    expect(credentialProvidesClientSecret({ serverUrl: GITHUB_MCP, hasClientSecret: false }, GITHUB_MCP)).toBe(false)
  })

  test('Given Secret 绑定的 URL 与当前配置不同 When 查询 Then 返回 false', () => {
    // 换过 endpoint 后绝不能复用旧客户端密钥去交换授权码。
    expect(credentialProvidesClientSecret({ serverUrl: 'https://old.example.com/mcp', hasClientSecret: true }, GITHUB_MCP)).toBe(false)
  })

  test('Given 凭据缺少 serverUrl When 查询 Then 返回 false', () => {
    expect(credentialProvidesClientSecret({ hasClientSecret: true }, GITHUB_MCP)).toBe(false)
  })

  test('Given 当前配置的 URL 无法解析 When 查询 Then 返回 false 且不抛错', () => {
    expect(credentialProvidesClientSecret({ serverUrl: GITHUB_MCP, hasClientSecret: true }, 'not-a-url')).toBe(false)
  })

  test('Given URL 仅写法不同（等价规范化）When 查询 Then 仍视为匹配', () => {
    // 凭据按 normalizeMcpResource 存储，显式默认端口等价写法必须一致。
    expect(credentialProvidesClientSecret({ serverUrl: 'https://api.githubcopilot.com/mcp/', hasClientSecret: true }, 'https://api.githubcopilot.com/mcp/')).toBe(true)
  })
})
