import { getBuiltinCapabilities, validateUnknownCrudPageSchema } from 'best-lowcode-runtime/dev'
import type { Diagnostic, LowcodeAdapter } from '../types'

function toMcpDiagnostic(input: { path?: string; code: string; message: string }): Diagnostic {
  return {
    level: 'error',
    code: `schema.${input.code}`,
    message: input.message,
    path: input.path
  }
}

/** Adapts the current best-lowcode-runtime development entry without importing its React runtime. */
export const bestLowcodeAdapter: LowcodeAdapter = {
  builtInCapabilities: getBuiltinCapabilities,
  validateSchema: (candidate) =>
    validateUnknownCrudPageSchema(candidate).diagnostics.map(toMcpDiagnostic)
}
