/**
 * OAuth Client Secret 匹配的纯策略函数。
 *
 * 不依赖 Electron / 文件系统，便于单元测试。凭据按 `serverUrl` 绑定，
 * 配置里的 URL 一旦改变，旧 Secret 必须视为不存在，否则会拿错误的
 * 客户端密钥去交换授权码。
 */

/** 与 `normalizeMcpResource` 保持一致的规范化方式。 */
export function normalizeCredentialServerUrl(serverUrl: string): string {
  return new URL(serverUrl).toString()
}

export interface OAuthCredentialIdentity {
  /** 凭据绑定的服务地址；缺失表示尚未记录，不能视为匹配。 */
  serverUrl?: string
  /** 是否持有可用的 client secret。 */
  hasClientSecret: boolean
}

/**
 * 判断已持久化的凭据能否为该 serverUrl 提供 Client Secret。
 *
 * 只回答布尔：调用方拿不到 secret 本体，避免密钥误入渲染进程或日志。
 */
export function credentialProvidesClientSecret(
  credential: OAuthCredentialIdentity | undefined,
  serverUrl: string,
): boolean {
  if (!credential || !credential.hasClientSecret) return false
  if (!credential.serverUrl) return false
  let expected: string
  try {
    expected = normalizeCredentialServerUrl(serverUrl)
  } catch {
    // 无法解析的 URL 不能与任何凭据建立绑定。
    return false
  }
  return credential.serverUrl === expected
}
