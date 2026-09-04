import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export const CODEX_RULES_FILE = 'AGENTS.md'
export const CODEX_RULES_START = '<!-- best-lowcode:start -->'
export const CODEX_RULES_END = '<!-- best-lowcode:end -->'

export type AgentRulesInitResult = {
  files: Array<{
    path: string
    exists: boolean
    action: 'create' | 'update' | 'unchanged'
    diff: { before: string | null; after: string }
  }>
  written: boolean
}

export function createCodexLowcodeRules() {
  return [
    CODEX_RULES_START,
    '## BEST lowcode',
    '',
    '涉及 `BestCrudPage`、`schema.ts`、`registry.ts`、`lowcode.manifest.json`，',
    '或用户提出新增/修改 CRUD 列表、表单、筛选、表格操作时，先调用',
    '`best_prepare_task(projectRoot, request)`。',
    '',
    '按返回的 `AgentTask` 实施；有 `questions` 或不支持的能力时先向用户澄清。',
    '完成后调用 `best_verify`。MCP 不可用时才回退 CLI。',
    '',
    CODEX_RULES_END
  ].join('\n')
}

function replaceManagedRules(existing: string | undefined, rules: string) {
  if (existing === undefined) return `${rules}\n`
  const start = existing.indexOf(CODEX_RULES_START)
  const end = existing.indexOf(CODEX_RULES_END)
  if (start === -1 && end === -1) return `${existing.trimEnd()}\n\n${rules}\n`
  if (start === -1 || end === -1 || end < start) {
    throw new Error('AGENTS.md 的 BEST 低代码规则标记不完整，拒绝覆盖。')
  }
  const after = end + CODEX_RULES_END.length
  return `${existing.slice(0, start)}${rules}${existing.slice(after)}`
}

async function readExistingRules(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export async function initializeCodexAgentRules(
  rootDir: string,
  write = false
): Promise<AgentRulesInitResult> {
  const path = resolve(rootDir, CODEX_RULES_FILE)
  const before = await readExistingRules(path)
  const after = replaceManagedRules(before, createCodexLowcodeRules())
  const action = before === undefined ? 'create' : before === after ? 'unchanged' : 'update'
  const written = write && action !== 'unchanged'
  if (written) await writeFile(path, after, 'utf8')
  return {
    files: [
      {
        path: CODEX_RULES_FILE,
        exists: before !== undefined,
        action,
        diff: { before: before ?? null, after }
      }
    ],
    written
  }
}
