import type { ThemeConfig } from 'antd'
import { ConfigProvider } from 'antd'
import type { ReactNode } from 'react'
import { createContext, useContext, useMemo } from 'react'
import type { BestListService } from '../lowcode/list'

export type BestDictionaryItem = { label: string; value: string | number; disabled?: boolean }
export type BestService = (
  params: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<unknown>
export type BestSlotContext = {
  field?: string
  record?: Record<string, unknown>
  value?: unknown
  values?: Record<string, unknown>
}
export type BestActionContext = BestSlotContext
export type BestAction = (context: BestActionContext) => void | Promise<void>
export type BestSlot = (context: BestSlotContext) => ReactNode

export type BestRegistry = {
  /** List services use the stable low-code pagination contract. */
  listServices: Record<string, BestListService>
  /** Command services, such as create, update and remove. */
  services: Record<string, BestService>
  dictionaries: Record<string, BestDictionaryItem[]>
  actions: Record<string, BestAction>
  slots: Record<string, BestSlot>
  access: (key: string) => boolean
}

export type BestProviderProps = {
  children: ReactNode
  registry?: Partial<Omit<BestRegistry, 'access'>> & { access?: BestRegistry['access'] }
  theme?: ThemeConfig
}

export type BestRegistryLayer = Partial<Omit<BestRegistry, 'access'>> & {
  access?: BestRegistry['access']
}

const emptyRegistry: BestRegistry = {
  listServices: {},
  services: {},
  dictionaries: {},
  actions: {},
  slots: {},
  access: () => true
}

const defaultTheme: ThemeConfig = {
  token: {
    borderRadius: 6,
    controlHeight: 32,
    fontSize: 14
  }
}

const BestRuntimeContext = createContext<BestRegistry>(emptyRegistry)

export function composeBestRegistry(...layers: BestRegistryLayer[]): BestRegistry {
  const result: BestRegistry = {
    listServices: {},
    services: {},
    dictionaries: {},
    actions: {},
    slots: {},
    access: emptyRegistry.access
  }
  const groups = ['listServices', 'services', 'dictionaries', 'actions', 'slots'] as const
  for (const layer of layers) {
    for (const group of groups) {
      for (const [key, value] of Object.entries(layer[group] ?? {})) {
        if (Object.hasOwn(result[group], key)) {
          throw new Error(`Registry key 重复：${group}.${key}`)
        }
        result[group][key] = value as never
      }
    }
    if (layer.access) {
      const previousAccess = result.access
      result.access = (key) => previousAccess(key) && layer.access?.(key) !== false
    }
  }
  return result
}

export function createBestRegistry(registry: BestProviderProps['registry'] = {}): BestRegistry {
  return composeBestRegistry(registry)
}

export function BestProvider({ children, registry, theme }: BestProviderProps) {
  const value = useMemo(() => createBestRegistry(registry), [registry])
  const mergedTheme = useMemo<ThemeConfig>(
    () => ({ ...defaultTheme, ...theme, token: { ...defaultTheme.token, ...theme?.token } }),
    [theme]
  )
  return (
    <BestRuntimeContext.Provider value={value}>
      <ConfigProvider theme={mergedTheme}>{children}</ConfigProvider>
    </BestRuntimeContext.Provider>
  )
}

export function useBestRegistry() {
  return useContext(BestRuntimeContext)
}

export function useBestService(key: string): BestService {
  const service = useBestRegistry().services[key]
  if (!service) throw new Error(`未注册服务：${key}`)
  return service
}

export function useBestListService(key: string): BestListService | undefined {
  return useBestRegistry().listServices[key]
}

export function useBestAccess(key?: string): boolean {
  const registry = useBestRegistry()
  return key ? registry.access(key) : true
}

export function useBestDictionary(key?: string): BestDictionaryItem[] {
  const dictionaries = useBestRegistry().dictionaries
  return key ? (dictionaries[key] ?? []) : []
}

export function useBestAction(key: string): BestAction {
  const action = useBestRegistry().actions[key]
  if (!action) throw new Error(`未注册动作：${key}`)
  return action
}
