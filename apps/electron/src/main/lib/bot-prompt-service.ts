/**
 * Bot 身份提示服务
 *
 * 把一个 Bot 的持久身份渲染成稳定的 system prompt 段。
 * 纯函数，不依赖 time/random，保证同一身份两次渲染逐字节相同，
 * 以便复用 Pi 的提示前缀缓存（对应 DS-Bot 的稳定前缀设计）。
 */

import type { BotIdentity } from '@proma/shared'

/**
 * 生成 Bot 身份提示段。
 * 只包含实际存在的字段，避免空字段段落。
 */
export function buildBotIdentityPrompt(bot: BotIdentity): string {
  const lines: string[] = [
    '## 你的 Bot 身份',
    `你是 ${bot.name}，用户团队中的一个长期 Bot。`,
  ]
  if (bot.role?.trim()) lines.push(`角色：${bot.role.trim()}。`)
  if (bot.instructions?.trim()) lines.push(bot.instructions.trim())

  lines.push('你要以这个身份持续工作；用户通过 IM 与你对话时，也保持同一身份与记忆。')
  return lines.join('\n')
}
