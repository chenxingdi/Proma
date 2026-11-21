/**
 * Agent 模式推荐工具模块（Chat 模式）
 *
 * 只在任务确实超出 Chat 工具能力边界时建议用户切换。
 * 工具本身不执行切换，只产出推荐数据（reason + suggestedPrompt），
 * 由渲染进程的 AgentRecommendBanner 负责展示和执行迁移。
 */

import type { ToolCall, ToolResult, ToolDefinition } from '@proma/core'
import type { ChatToolMeta } from '@proma/shared'

// ===== 工具元数据 =====

export const AGENT_RECOMMEND_TOOL_META: ChatToolMeta = {
  id: 'agent-mode-recommend',
  name: 'Agent 模式推荐',
  description: '仅在任务需要本地文件、命令行或项目级多步操作时，建议切换到 Agent 模式',
  params: [
    { name: 'reason', type: 'string', description: '推荐理由', required: true },
    { name: 'suggestedPrompt', type: 'string', description: '建议的 Agent 初始提示词', required: true },
  ],
  icon: 'Sparkles',
  category: 'builtin',
  executorType: 'builtin',
  systemPromptAppend: `
<agent_mode_recommendation>
你有能力推荐用户切换到 Agent 模式，但**默认不要推荐**。绝大多数对话在当前模式就能完成，先把任务做完，确实做不到时才推荐。

## 先在当前模式完成

你当前已经具备联网搜索、抓取网页正文、处理附件文档和调用外部 HTTP 工具的能力。以下任务直接自己完成，不要推荐切换：

- 查资料、核实事实、对比多个来源、读某个网页的正文
- 整理、总结、改写、翻译、结构化输出
- 写方案、写报告、写邮件、写文档内容
- 解释概念、分析利弊、给出建议
- 基于用户附件做的阅读与提取
- 可以直接在对话里给出的程序片段、脚本、正则、SQL

## 只在以下情况推荐

任务**必须**落到用户本机，而你无法在对话中完成时才推荐：

1. 读写或修改用户本地的文件、目录、项目代码
2. 执行 shell 命令、安装依赖、跑测试、构建、启动服务
3. 需要跨多个文件、多轮迭代持续改动的开发工作
4. 需要连接用户已配置的 MCP 服务器或调用本机工具链

判断标准：产出是**一段可以直接复制使用的文字**，就自己做；产出必须是**本机文件或命令执行结果**，才推荐。

## 推荐时的要求

- reason 要具体说明为什么当前模式做不到、Agent 模式能补上什么，结合用户真实任务，不要泛泛而谈
- suggestedPrompt 概括用户的核心任务，作为 Agent 会话的起始提示
- 每轮对话最多推荐一次，避免反复打扰
</agent_mode_recommendation>`,
}

// ===== 工具定义（ToolDefinition 格式，传给 Provider） =====

export const AGENT_RECOMMEND_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'suggest_agent_mode',
    description: 'Recommend switching to Agent mode ONLY when the task requires reading or writing files on the user machine, running shell commands, building or testing a project, or anything whose result must exist on the local disk. Never call this for research, web reading, summarizing or writing, whose output is text you can produce directly.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Specific explanation of how Agent mode can better help the user achieve their goal',
        },
        suggestedPrompt: {
          type: 'string',
          description: 'Suggested initial prompt for the Agent session, summarizing the user\'s core task',
        },
      },
      required: ['reason', 'suggestedPrompt'],
    },
  },
]

// ===== 可用性检查 =====

/**
 * Agent 推荐工具始终可用（无需外部凭据）
 */
export function isAgentRecommendAvailable(): boolean {
  return true
}

// ===== 工具执行 =====

/** 推荐工具名称集合 */
const AGENT_RECOMMEND_TOOL_NAMES = new Set(['suggest_agent_mode'])

/**
 * 判断是否为 Agent 推荐工具调用
 */
export function isAgentRecommendToolCall(toolName: string): boolean {
  return AGENT_RECOMMEND_TOOL_NAMES.has(toolName)
}

/**
 * 执行 Agent 推荐工具调用
 *
 * 返回结构化 JSON 数据，供渲染进程解析并展示推荐横幅。
 */
export async function executeAgentRecommendTool(toolCall: ToolCall): Promise<ToolResult> {
  const reason = toolCall.arguments.reason as string | undefined
  const suggestedPrompt = toolCall.arguments.suggestedPrompt as string | undefined

  if (!reason || !suggestedPrompt) {
    return {
      toolCallId: toolCall.id,
      content: '参数缺失: reason 和 suggestedPrompt 均为必填',
      isError: true,
    }
  }

  return {
    toolCallId: toolCall.id,
    content: JSON.stringify({
      type: 'agent_recommendation',
      reason,
      suggestedPrompt,
    }),
  }
}
