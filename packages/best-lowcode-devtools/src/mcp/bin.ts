#!/usr/bin/env node
import { bestLowcodeAdapter } from './adapters/best-lowcode'
import { startBestLowcodeMcpServer } from './server'

// The global MCP process resolves the project per tool call via `projectRoot`.
void startBestLowcodeMcpServer(undefined, bestLowcodeAdapter).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
