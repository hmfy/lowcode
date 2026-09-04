#!/usr/bin/env node
import { runInstallerCli } from './index'

void runInstallerCli(process.argv.slice(2)).then((exitCode) => {
  process.exitCode = exitCode
})
