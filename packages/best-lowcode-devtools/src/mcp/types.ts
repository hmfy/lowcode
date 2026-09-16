export type DiagnosticLevel = 'error' | 'warning' | 'info'

export type DiagnosticRecovery = {
  command: string
  requiresUserApproval: boolean
  retryTool: string
}

export type Diagnostic = {
  code: string
  message: string
  level: DiagnosticLevel
  path?: string
  recovery?: DiagnosticRecovery
}

export type CapabilityDefinition = {
  description?: string
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export type CapabilityManifest = {
  version: number
  services?: Record<string, CapabilityDefinition>
  dictionaries?: string[]
  actions?: string[]
  slots?: string[]
  access?: string[]
}

export type ProjectConfig = {
  version: 1
  allowedPaths: string[]
  manifestPaths: string[]
  schemaFilePattern?: string
  verificationCommands?: string[]
}

export type CapabilityContext = {
  manifestPath: string
  manifest: CapabilityManifest
}

export type AgentTask = {
  version: 1
  request: string
  allowedPaths: string[]
  relatedCapabilities: string[]
  capabilityGroups: {
    services: string[]
    dictionaries: string[]
    actions: string[]
    slots: string[]
    access: string[]
    builtIn: string[]
  }
  requiredArchitecture: {
    kind: 'best-crud' | 'none'
    component?: 'BestCrudPage'
    files: string[]
  }
  requirementCoverage: RequirementCoverage[]
  pageContext: {
    pageName?: string
    targetRoute?: string
    pageDir?: string
    schemaPath?: string
    registryPath?: string
    manifestPath?: string
    targetFiles: string[]
    generatedFiles: string[]
    recommendedTemplate?: 'crud'
    createCommand?: string
  }
  verificationCommands: string[]
  blockedQuestions: string[]
  acceptance: string[]
  questions: string[]
}

export type RequirementCoverage = {
  requirement: string
  status:
    | 'native-supported'
    | 'slot-supported'
    | 'extension-required'
    | 'runtime-not-supported'
  implementation: {
    schemaPaths: string[]
    registryKeys: string[]
    runtimeFeatures: string[]
  }
  reason?: string
  fallback?: {
    attemptedRuntimeCapability: string[]
    limitation: string
    slotEvaluation: string
    selectedFallback:
      | 'none'
      | 'runtime-slot'
      | 'runtime-extension'
      | 'handwritten-component'
  }
}

export type TaskSelection = {
  relatedCapabilities: string[]
  allowedPaths: string[]
}

export type CandidatePreview = {
  targetPath: string
  exists: boolean
  diff: {
    before: string | null
    after: string
  }
  diagnostics: Diagnostic[]
}

export type CandidateLanguage = 'auto' | 'ts' | 'json'

export type VerificationResult = {
  ok: boolean
  diagnostics: Diagnostic[]
}

export type ManifestDiscoveryResult = {
  written: boolean
  pages: string[]
  preview?: CandidatePreview
  diagnostics: Diagnostic[]
}

/**
 * Future bridge to best-lowcode-runtime. The MCP package stays independent until the runtime package is
 * available; its adapter supplies the source of truth for runtime-specific validation.
 */
export type LowcodeAdapter = {
  builtInCapabilities?: () => string[]
  validateSchema?: (candidate: Record<string, unknown>) => Promise<Diagnostic[]> | Diagnostic[]
  verifyProject?: (rootDir: string) => Promise<Diagnostic[]> | Diagnostic[]
}
