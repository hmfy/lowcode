import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { realpath } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createBestLowcodeMcpService } from './service'
import type { LowcodeAdapter } from './types'

type ToolArgs = Record<string, unknown>

function textResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] }
}

function stringArg(args: ToolArgs | undefined, key: string) {
  const value = args?.[key]
  return typeof value === 'string' ? value : undefined
}

function stringArrayArg(args: ToolArgs | undefined, key: string) {
  const value = args?.[key]
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined
}

function booleanArg(args: ToolArgs | undefined, key: string) {
  const value = args?.[key]
  return typeof value === 'boolean' ? value : undefined
}

async function resolveProjectRoot(value: unknown) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error('projectRoot 必须是绝对路径')
  }
  try {
    return await realpath(resolve(value))
  } catch {
    throw new Error(`projectRoot 不存在或不可访问：${value}`)
  }
}

export function createBestLowcodeMcpServer(rootDir: string | undefined, adapter?: LowcodeAdapter) {
  const fixedService = rootDir ? createBestLowcodeMcpService(rootDir, adapter) : undefined
  const getService = async (args: ToolArgs | undefined) => {
    if (fixedService) return fixedService
    const projectRoot = await resolveProjectRoot(args?.projectRoot)
    return createBestLowcodeMcpService(projectRoot, adapter)
  }
  const server = new Server(
    { name: 'best-lowcode-devtools', version: '0.2.0' },
    { capabilities: { tools: {} } }
  )
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'best_configure_project',
        description:
          '生成或更新 BEST 项目 Config 与空 Manifest 的候选 diff。仅在用户显式选择 BEST low-code 时使用；write=true 前必须先展示候选并取得用户确认。',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' },
            allowedPaths: { type: 'array', items: { type: 'string' }, description: '当前 Agent 选择的项目相对写入目录' },
            manifestPaths: { type: 'array', items: { type: 'string' }, description: '项目相对 Manifest 文件路径' },
            verificationCommands: { type: 'array', items: { type: 'string' }, description: '项目验证命令' },
            write: { type: 'boolean', description: '仅在用户确认候选 diff 后设为 true' }
          },
          required: rootDir ? [] : ['projectRoot'],
          additionalProperties: false
        }
      },
      {
        name: 'best_get_context',
        description: '读取低代码项目配置、能力 Manifest 与内置能力。',
        inputSchema: {
          type: 'object',
          properties: { projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' } },
          required: rootDir ? [] : ['projectRoot'],
          additionalProperties: false
        }
      },
      {
        name: 'best_prepare_task',
        description:
          '从项目 Config、Manifest 和内置能力生成确定性的 AgentTask，不写入文件。仅在用户明确要求 BEST low-code 时使用。',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' },
            request: { type: 'string', description: '自然语言页面需求' }
          },
          required: rootDir ? ['request'] : ['projectRoot', 'request'],
          additionalProperties: false
        }
      },
      {
        name: 'best_validate_selection',
        description:
          '校验 Agent 选择的能力 ID 和允许修改路径，并生成受控 AgentTask；不做自然语言分类、不写入文件。仅在用户明确要求 BEST low-code 时使用。',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' },
            request: { type: 'string', description: '原始页面需求' },
            relatedCapabilities: {
              type: 'array',
              items: { type: 'string' },
              description: '当前 Agent 从 Manifest 或内置能力中选择的能力 ID'
            },
            allowedPaths: {
              type: 'array',
              items: { type: 'string' },
              description: '当前 Agent 计划修改的项目相对路径'
            }
          },
          required: rootDir
            ? ['request', 'relatedCapabilities', 'allowedPaths']
            : ['projectRoot', 'request', 'relatedCapabilities', 'allowedPaths'],
          additionalProperties: false
        }
      },
      {
        name: 'best_preview_change',
        description: '校验并预览候选 TypeScript 或 JSON Schema，不写入文件。',
        inputSchema: {
          type: 'object',
          properties: {
            projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' },
            targetPath: {
              type: 'string',
              description:
                '相对于仓库根目录的目标文件；Schema/业务文件须位于 allowedPaths，配置中的 Manifest 可直接修改'
            },
            candidate: { type: 'string', description: '候选 TypeScript 或 JSON Schema 内容' },
            language: {
              type: 'string',
              enum: ['auto', 'ts', 'json'],
              description:
                '候选内容语言；默认对 .ts/.tsx 优先按静态 TypeScript 解析，失败后回退 JSON'
            }
          },
          required: rootDir ? ['targetPath', 'candidate'] : ['projectRoot', 'targetPath', 'candidate'],
          additionalProperties: false
        }
      },
      {
        name: 'best_discover_manifest',
        description: '全项目发现 BestCrudPage，并预览可安全合并的 Manifest 候选项；不写入文件。',
        inputSchema: {
          type: 'object',
          properties: { projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' } },
          required: rootDir ? [] : ['projectRoot'],
          additionalProperties: false
        }
      },
      {
        name: 'best_verify',
        description: '校验项目配置、Manifest 和已注入的运行时适配器规则。',
        inputSchema: {
          type: 'object',
          properties: { projectRoot: { type: 'string', description: '当前项目根目录（绝对路径）' } },
          required: rootDir ? [] : ['projectRoot'],
          additionalProperties: false
        }
      }
    ]
  }))
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments as ToolArgs | undefined
    switch (request.params.name) {
      case 'best_configure_project': {
        const allowedPaths = stringArrayArg(args, 'allowedPaths')
        const manifestPaths = stringArrayArg(args, 'manifestPaths')
        const verificationCommands = stringArrayArg(args, 'verificationCommands')
        const write = booleanArg(args, 'write') ?? false
        return textResult(
          await (await getService(args)).configureProject(
            {
              ...(allowedPaths ? { allowedPaths } : {}),
              ...(manifestPaths ? { manifestPaths } : {}),
              ...(verificationCommands ? { verificationCommands } : {})
            },
            write
          )
        )
      }
      case 'best_get_context':
        return textResult(await (await getService(args)).getContext())
      case 'best_prepare_task': {
        const taskRequest = stringArg(args, 'request')
        return taskRequest
          ? textResult(await (await getService(args)).prepareTask(taskRequest))
          : textResult({ error: 'request 必须是字符串' })
      }
      case 'best_validate_selection': {
        const taskRequest = stringArg(args, 'request')
        const relatedCapabilities = stringArrayArg(args, 'relatedCapabilities')
        const allowedPaths = stringArrayArg(args, 'allowedPaths')
        return taskRequest && relatedCapabilities && allowedPaths
          ? textResult(
              await (await getService(args)).validateSelection(taskRequest, {
                relatedCapabilities,
                allowedPaths
              })
            )
          : textResult({ error: 'request、relatedCapabilities 和 allowedPaths 必须有效' })
      }
      case 'best_preview_change': {
        const targetPath = stringArg(args, 'targetPath')
        const candidate = stringArg(args, 'candidate')
        const language = stringArg(args, 'language')
        return targetPath && candidate
          ? textResult(
              await (await getService(args)).previewChange(
                targetPath,
                candidate,
                language === 'ts' || language === 'json' || language === 'auto' ? language : 'auto'
              )
            )
          : textResult({ error: 'targetPath 和 candidate 必须是字符串' })
      }
      case 'best_discover_manifest':
        return textResult(await (await getService(args)).discoverManifest())
      case 'best_verify':
        return textResult(await (await getService(args)).verify())
      default:
        return textResult({ error: `不支持的工具：${request.params.name}` })
    }
  })
  return server
}

export async function startBestLowcodeMcpServer(rootDir: string | undefined, adapter?: LowcodeAdapter) {
  const server = createBestLowcodeMcpServer(rootDir, adapter)
  await server.connect(new StdioServerTransport())
}
