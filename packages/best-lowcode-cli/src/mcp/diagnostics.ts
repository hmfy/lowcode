import type { Diagnostic, DiagnosticLevel, DiagnosticRecovery } from './types'

export function diagnostic(
  level: DiagnosticLevel,
  code: string,
  message: string,
  path?: string,
  recovery?: DiagnosticRecovery
): Diagnostic {
  return { level, code, message, path, recovery }
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((item) => item.level === 'error')
}
