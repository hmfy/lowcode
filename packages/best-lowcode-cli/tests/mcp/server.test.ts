import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createBestLowcodeMcpServer } from '../../src/mcp/server'

async function connectServer() {
  const root = await mkdtemp(join(tmpdir(), 'best-lowcode-mcp-server-'))
  await writeFile(
    join(root, 'best.lowcode.config.json'),
    JSON.stringify({ version: 1, allowedPaths: ['apps/demo'], manifestPaths: ['manifest.json'] })
  )
  await writeFile(join(root, 'manifest.json'), JSON.stringify({ version: 1 }))
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair()
  const server = createBestLowcodeMcpServer(root)
  const client = new Client({ name: 'best-lowcode-cli-test', version: '1.0.0' })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

async function close(connection: Awaited<ReturnType<typeof connectServer>>) {
  await connection.client.close()
  await connection.server.close()
}

function readText(result: unknown) {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content
  const item = content?.[0]
  if (item?.type !== 'text' || !item.text) throw new Error('MCP 返回了无效的文本结果')
  return JSON.parse(item.text) as Record<string, unknown>
}

describe('best lowcode MCP server', () => {
  const connections: Array<Awaited<ReturnType<typeof connectServer>>> = []

  afterEach(async () => {
    await Promise.all(connections.splice(0).map(close))
  })

  it('publishes controlled tools with strict input schemas', async () => {
    const connection = await connectServer()
    connections.push(connection)

    const tools = await connection.client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'best_configure_project',
      'best_get_context',
      'best_prepare_task',
      'best_validate_selection',
      'best_preview_change',
      'best_discover_manifest',
      'best_verify'
    ])
    expect(
      tools.tools.find((tool) => tool.name === 'best_prepare_task')?.inputSchema
    ).toMatchObject({
      additionalProperties: false,
      required: ['request']
    })
    expect(
      tools.tools.find((tool) => tool.name === 'best_preview_change')?.inputSchema
    ).toMatchObject({
      properties: { language: { enum: ['auto', 'ts', 'json'] } }
    })
    expect(
      tools.tools.find((tool) => tool.name === 'best_validate_selection')?.inputSchema
    ).toMatchObject({
      additionalProperties: false,
      required: ['request', 'relatedCapabilities', 'allowedPaths']
    })
  })

  it('returns controlled errors for invalid tool arguments and unknown tools', async () => {
    const connection = await connectServer()
    connections.push(connection)

    const missingRequest = readText(
      await connection.client.callTool({ name: 'best_prepare_task', arguments: {} })
    )
    expect(missingRequest).toEqual({ error: 'request 必须是字符串' })

    const invalidSelection = readText(
      await connection.client.callTool({
        name: 'best_validate_selection',
        arguments: { request: '新增页面', relatedCapabilities: [], allowedPaths: 'apps/demo' }
      })
    )
    expect(invalidSelection).toEqual({ error: 'request、relatedCapabilities 和 allowedPaths 必须有效' })

    const unknownTool = readText(
      await connection.client.callTool({ name: 'unknown_tool', arguments: {} })
    )
    expect(unknownTool).toEqual({ error: '不支持的工具：unknown_tool' })
  })

  it('validates an Agent selection through the MCP transport', async () => {
    const connection = await connectServer()
    connections.push(connection)

    const result = readText(
      await connection.client.callTool({
        name: 'best_validate_selection',
        arguments: {
          request: '新增 customer-list 页面',
          relatedCapabilities: [],
          allowedPaths: ['apps/demo']
        }
      })
    )

    expect(result.diagnostics).toEqual([])
    expect(result.task).toMatchObject({
      allowedPaths: ['apps/demo'],
      pageContext: { pageDir: 'apps/demo/src/pages/customer-list' }
    })
  })

  it('previews project configuration updates through the MCP transport', async () => {
    const connection = await connectServer()
    connections.push(connection)

    const result = readText(
      await connection.client.callTool({
        name: 'best_configure_project',
        arguments: { allowedPaths: ['apps/customer/src/pages'] }
      })
    )

    expect(result.written).toBe(false)
    expect((result.files as Record<string, unknown>[])[0]).toMatchObject({
      path: 'best.lowcode.config.json',
      action: 'update'
    })
    expect(result.config).toMatchObject({ allowedPaths: ['apps/customer/src/pages'] })
  })
})
