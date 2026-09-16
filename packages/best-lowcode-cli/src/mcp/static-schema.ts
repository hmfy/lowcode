import ts from 'typescript'
import { diagnostic } from './diagnostics'
import type { Diagnostic } from './types'

export type StaticSchemaValue =
  | string
  | number
  | boolean
  | null
  | StaticSchemaValue[]
  | { [key: string]: StaticSchemaValue }

const IDENTIFIERS: Record<string, StaticSchemaValue> = {
  CRUD_SCHEMA_ID: 'https://best.dev/schema/crud/v1',
  CRUD_SCHEMA_VERSION: 1,
  TABBED_PAGE_SCHEMA_ID: 'https://best.dev/schema/tabs/v1',
  TABBED_PAGE_SCHEMA_VERSION: 1
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text
  return undefined
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression
  }
  return node
}

function collectStaticDeclarations(sourceFile: ts.SourceFile) {
  const declarations = new Map<string, ts.Expression>()
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        declarations.set(declaration.name.text, declaration.initializer)
      }
    }
  }
  return declarations
}

function createStaticEvaluator(declarations: Map<string, ts.Expression>) {
  const resolving = new Set<string>()
  function evaluate(node: ts.Expression): StaticSchemaValue | undefined {
    node = unwrap(node)
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false
    if (node.kind === ts.SyntaxKind.NullKeyword) return null
    if (ts.isIdentifier(node)) {
      if (node.text in IDENTIFIERS) return IDENTIFIERS[node.text]
      const declaration = declarations.get(node.text)
      if (!declaration || resolving.has(node.text)) return undefined
      resolving.add(node.text)
      const value = evaluate(declaration)
      resolving.delete(node.text)
      return value
    }
    if (ts.isArrayLiteralExpression(node)) {
      const values: StaticSchemaValue[] = []
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) return undefined
        const value = evaluate(element)
        if (value === undefined) return undefined
        values.push(value)
      }
      return values
    }
    if (ts.isObjectLiteralExpression(node)) {
      const value: Record<string, StaticSchemaValue> = {}
      for (const property of node.properties) {
        if (!ts.isPropertyAssignment(property)) return undefined
        const name = propertyName(property.name)
        const propertyValue = evaluate(property.initializer)
        if (!name || propertyValue === undefined) return undefined
        value[name] = propertyValue
      }
      return value
    }
    return undefined
  }
  return evaluate
}

function looksLikePageSchema(node: ts.Expression) {
  node = unwrap(node)
  return (
    ts.isObjectLiteralExpression(node) &&
    node.properties.some((property) => {
      if (!ts.isPropertyAssignment(property)) return false
      const name = propertyName(property.name)
      const initializer = unwrap(property.initializer)
      return (
        name === '$schema' ||
        (name === 'kind' &&
          ts.isStringLiteral(initializer) &&
          (initializer.text === 'crud' || initializer.text === 'tabs'))
      )
    })
  )
}

export function parseStaticCrudSchemas(content: string, fileName: string) {
  const diagnostics: Diagnostic[] = []
  const sourceFile = ts.createSourceFile(
    fileName,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const parseDiagnostics =
    ts.transpileModule(content, {
      compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
      reportDiagnostics: true,
      fileName
    }).diagnostics ?? []
  for (const item of parseDiagnostics) {
    diagnostics.push(
      diagnostic(
        'error',
        'schema.scan.parse',
        ts.flattenDiagnosticMessageText(item.messageText, '\n'),
        fileName
      )
    )
  }

  const schemas: Array<Record<string, StaticSchemaValue>> = []
  const evaluate = createStaticEvaluator(collectStaticDeclarations(sourceFile))
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!declaration.initializer || !looksLikePageSchema(declaration.initializer)) continue
      const value = evaluate(declaration.initializer)
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        diagnostics.push(
          diagnostic(
            'error',
            'schema.static.unsupported',
            'Schema 仅支持静态对象、数组、字面量和 CRUD_SCHEMA_ID/CRUD_SCHEMA_VERSION；不能包含函数、变量或展开语法',
            fileName
          )
        )
      } else {
        schemas.push(value as Record<string, StaticSchemaValue>)
      }
    }
  }
  return { schemas, diagnostics }
}
