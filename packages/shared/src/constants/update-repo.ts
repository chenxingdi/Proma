/**
 * 更新源仓库配置（单一来源）
 *
 * 与 apps/electron/electron-builder.yml 的 publish(owner/repo) 保持一致。
 * 主进程的 Release API 与渲染进程的“前往下载”链接都从这里读取，
 * 避免各处硬编码官方仓库导致自托管版本跳回官方发布页。
 */
export const UPDATE_REPO_OWNER = 'chenxingdi'
export const UPDATE_REPO_NAME = 'Proma'

/** GitHub Releases 页面地址（渲染进程“前往下载”兜底链接）。 */
export const GITHUB_RELEASES_URL = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases`
