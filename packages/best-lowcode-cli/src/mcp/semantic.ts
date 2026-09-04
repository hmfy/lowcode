import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SemanticResolver, SemanticSelection } from './types'

const outputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['relatedCapabilities', 'allowedPaths', 'questions'],
  properties: {
    relatedCapabilities: { type: 'array', items: { type: 'string' } },
    allowedPaths: { type: 'array', items: { type: 'string' } },
    questions: { type: 'array', items: { type: 'string' } }
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function parseSelection(value: unknown): SemanticSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Codex 没有返回 JSON 对象')
  }
  const result = value as Record<string, unknown>
  if (
    !isStringArray(result.relatedCapabilities) ||
    !isStringArray(result.allowedPaths) ||
    !isStringArray(result.questions)
  ) {
    throw new Error('Codex 返回的语义选择不符合约定')
  }
  return {
    relatedCapabilities: result.relatedCapabilities,
    allowedPaths: result.allowedPaths,
    questions: result.questions
  }
}

function runCodex(args: string[], cwd: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('codex', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('Codex 语义解析超时（60 秒）'))
    }, 60_000)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `codex exec 退出码：${code ?? 'unknown'}`))
    })
  })
}

function buildPrompt(input: Parameters<SemanticResolver>[0]) {
  return [
    '你是受控的低代码需求分类器。只根据下方提供的信息理解需求，不读取文件、不调用工具、不生成代码。',
    '只允许从“可用能力 ID”和“允许路径”中原样选择；不要编造、改写或补充 ID、路径。',
    '需求存在歧义或缺少可用能力时，把需要人类回答的问题写入 questions。',
    '如果需求是创建新页面或脚手架，且没有明确写出现有能力 ID，不要因为名称相似选择已有业务能力。',
    'relatedCapabilities 只选择完成需求确实需要的能力；allowedPaths 只选择可能需要修改的目录。',
    '只输出符合提供 JSON Schema 的 JSON 对象。',
    `需求：${input.request}`,
    `允许路径：${JSON.stringify(input.allowedPaths)}`,
    `可用能力：${JSON.stringify(input.capabilities)}`
  ].join('\n\n')
}

/**
 * Uses the locally authenticated Codex CLI for semantic selection only. It runs in a temporary
 * empty directory, read-only, and receives no project filesystem access beyond the supplied
 * allowlist/Manifest projection in the prompt.
 */
export async function resolveWithLocalCodex(
  _rootDir: string,
  input: Parameters<SemanticResolver>[0]
): Promise<SemanticSelection> {
  const tempDir = await mkdtemp(join(tmpdir(), 'best-lowcode-codex-'))
  const schemaPath = join(tempDir, 'selection.schema.json')
  const outputPath = join(tempDir, 'selection.json')
  try {
    await writeFile(schemaPath, JSON.stringify(outputSchema), 'utf8')
    await runCodex(
      [
        'exec',
        '--sandbox',
        'read-only',
        '--ephemeral',
        '--skip-git-repo-check',
        '--output-schema',
        schemaPath,
        '--output-last-message',
        outputPath,
        buildPrompt(input)
      ],
      tempDir
    )
    return parseSelection(JSON.parse(await readFile(outputPath, 'utf8')) as unknown)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
