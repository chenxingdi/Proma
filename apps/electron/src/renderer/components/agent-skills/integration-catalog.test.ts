import { expect, test } from 'bun:test'
import { MCP_INTEGRATION_CATALOG, compareCatalogConnectionCards, resolveCatalogOAuthPrerequisite, type CatalogCredentialIntegration } from './integration-catalog'

function credentialIntegration(id: string): CatalogCredentialIntegration {
  const integration = MCP_INTEGRATION_CATALOG.find((item) => item.id === id)
  if (!integration || integration.kind !== 'credential') throw new Error(`missing credential integration: ${id}`)
  return integration
}

test('Given the MCP connection catalog When listing search providers Then Brave and Tavily require only their API key with official console links', () => {
  const brave = credentialIntegration('brave-search-mcp')
  const tavily = credentialIntegration('tavily-search-mcp')

  expect(brave.entry).toEqual({
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@brave/brave-search-mcp-server', '--transport', 'stdio'],
    enabled: false,
  })
  expect(brave.credential).toMatchObject({
    envName: 'BRAVE_API_KEY',
    credentialStorageUrl: 'https://api.search.brave.com/',
    acquisitionUrl: 'https://api-dashboard.search.brave.com/app/keys',
  })

  expect(tavily.entry).toEqual({ type: 'http', url: 'https://mcp.tavily.com/mcp', enabled: false })
  expect(tavily.credential).toMatchObject({
    headerName: 'Authorization',
    valuePrefix: 'Bearer ',
    credentialStorageUrl: 'https://mcp.tavily.com/mcp',
    acquisitionUrl: 'https://app.tavily.com/home',
  })
})

test('搜索服务目录顺序固定为飞书、钉钉、企业微信、Tavily、Brave，再到其他集成', () => {
  const expected = ['feishu-cli', 'dingtalk-cli', 'wecom-cli', 'tavily-search-mcp', 'brave-search-mcp']
  const actual = [...MCP_INTEGRATION_CATALOG]
    .sort((left, right) => compareCatalogConnectionCards(
      { priority: left.priority, placement: left.placement, featured: left.featured, statusRank: 1 },
      { priority: right.priority, placement: right.placement, featured: right.featured, statusRank: 1 },
    ))
    .map((integration) => integration.id)

  expect(actual.slice(0, expected.length)).toEqual(expected)
})

test('Given 服务端要求 Client Secret 且本机尚未保存 When 判断 OAuth 前置条件 Then 必须先让用户安全录入', () => {
  // GitHub 远程 MCP 属于这一类：不提供 dynamic client registration。
  expect(resolveCatalogOAuthPrerequisite({ clientSecretRequired: true, hasStoredClientSecret: false }))
    .toBe('need-client-secret')
})

test('Given 服务端要求 Client Secret 且本机已保存 When 判断 OAuth 前置条件 Then 可以直接授权', () => {
  expect(resolveCatalogOAuthPrerequisite({ clientSecretRequired: true, hasStoredClientSecret: true }))
    .toBe('authorize')
})

test('Given 服务端不要求 Client Secret When 判断 OAuth 前置条件 Then 可以直接授权', () => {
  expect(resolveCatalogOAuthPrerequisite({ clientSecretRequired: false, hasStoredClientSecret: false }))
    .toBe('authorize')
})

test('Given 目录中的 GitHub 卡片 When 读取 OAuth 元数据 Then 要求 Client Secret 且不带 registrationEndpoint', () => {
  const github = MCP_INTEGRATION_CATALOG.find((item) => item.id === 'github-mcp')
  if (!github || github.kind !== 'mcp') throw new Error('missing github catalog integration')
  expect(github.entry.oauth?.clientSecretRequired).toBe(true)
  expect(github.entry.oauth?.registrationEndpoint).toBeUndefined()
})
