import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CODEX_RULES_END, CODEX_RULES_START, initializeCodexAgentRules } from '../src/agent-init'

describe('Codex agent rule initialization', () => {
  it('updates only the managed low-code rule block', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-agent-'))
    const path = join(root, 'AGENTS.md')
    await writeFile(
      path,
      [
        '# Existing project rules',
        '',
        CODEX_RULES_START,
        'old rule',
        CODEX_RULES_END,
        '',
        'Keep this.'
      ].join('\n')
    )

    const result = await initializeCodexAgentRules(root, true)
    const content = await readFile(path, 'utf8')

    expect(result.written).toBe(true)
    expect(result.files[0]?.action).toBe('update')
    expect(content).toContain('# Existing project rules')
    expect(content).toContain('Keep this.')
    expect(content).toContain('best_prepare_task')
    expect(content).toContain('## BEST lowcode')
    expect(content).toContain('CRUD 列表、表单、筛选、表格操作')
    expect(content).toContain('按返回的 `AgentTask` 实施')
    expect(content).toContain('有 `questions` 或不支持的能力时先向用户澄清')
    expect(content).toContain('MCP 不可用')
    expect(content).toContain('best_verify')
    expect(content).not.toContain('只改一行')
    expect(content).not.toContain('当前项目所有功能开发默认优先使用 BEST 低代码链路')
    expect(content).not.toContain('old rule')
  })

  it('does not rewrite an unchanged managed block', async () => {
    const root = await mkdtemp(join(tmpdir(), 'best-lowcode-agent-'))
    await initializeCodexAgentRules(root, true)
    const result = await initializeCodexAgentRules(root, true)

    expect(result.written).toBe(false)
    expect(result.files[0]?.action).toBe('unchanged')
  })
})
