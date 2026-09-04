// @vitest-environment jsdom
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useEffect,
  useState
} from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BestProvider } from '../src/runtime'

type TestForm = ReturnType<typeof createForm>
const formContext = createContext<TestForm | undefined>(undefined)

function readPath(values: Record<string, unknown>, path: string | number | (string | number)[]) {
  const parts = Array.isArray(path) ? path : [path]
  return parts.reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') return (current as Record<string, unknown>)[part]
    return undefined
  }, values)
}

function createForm(initialValues: Record<string, unknown> = {}) {
  let values = initialValues
  const listeners = new Set<() => void>()
  const notify = () => {
    listeners.forEach((listener) => {
      listener()
    })
  }
  const writePath = (path: string | number | (string | number)[], nextValue: unknown) => {
    const parts = Array.isArray(path) ? path : [path]
    const nextValues: Record<string, unknown> = { ...values }
    let cursor: Record<string, unknown> = nextValues
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        cursor[part] = nextValue
        return
      }
      const current = cursor[part]
      const nextCursor =
        current && typeof current === 'object'
          ? Array.isArray(current)
            ? [...current]
            : { ...(current as Record<string, unknown>) }
          : typeof parts[index + 1] === 'number'
            ? []
            : {}
      cursor[part] = nextCursor
      cursor = nextCursor as Record<string, unknown>
    })
    values = nextValues
  }
  return {
    getValues: () => values,
    setFieldsValue: (nextValues: Record<string, unknown>) => {
      values = { ...values, ...nextValues }
      notify()
    },
    setValue: (name: string | number | (string | number)[], value: unknown) => {
      writePath(name, value)
      notify()
    },
    setFieldValue: vi.fn((name: string | number | (string | number)[], value: unknown) => {
      writePath(name, value)
      notify()
    }),
    validateFields: vi.fn(async () => values),
    submit: vi.fn(),
    resetFields: vi.fn(),
    getFieldValue: vi.fn((name: string | number | (string | number)[]) => readPath(values, name)),
    isFieldTouched: vi.fn(() => false),
    isFieldsTouched: vi.fn(() => false),
    getFieldsValue: vi.fn(() => values),
    setFields: vi.fn(),
    scrollToField: vi.fn(),
    getFieldError: vi.fn(() => []),
    getFieldsError: vi.fn(() => []),
    isFieldsValidating: vi.fn(() => false),
    validateTrigger: 'onChange',
    getInternalHooks: vi.fn(),
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
}

let latestForm: TestForm | undefined

vi.mock('antd', async () => {
  const Form = ({
    children,
    form,
    initialValues
  }: {
    children: ReactNode
    form: TestForm
    initialValues?: Record<string, unknown>
  }) => {
    const formState = form as TestForm & { initialized?: boolean }
    if (!formState.initialized) {
      Object.entries(initialValues ?? {}).forEach(([name, value]) => {
        form.setValue(name, value)
      })
      formState.initialized = true
    }
    return <formContext.Provider value={form}>{children}</formContext.Provider>
  }
  Form.useForm = () => {
    latestForm = createForm()
    return [latestForm]
  }
  Form.useWatch = (_: unknown, { form }: { form: TestForm }) => {
    const [, setVersion] = useState(0)
    useEffect(() => form.subscribe(() => setVersion((version) => version + 1)), [form])
    return form.getValues()
  }
  Form.Item = ({
    children,
    name
  }: {
    children: ReactNode
    name?: string | number | (string | number)[]
  }) => {
    const form = useContext(formContext)
    if (!form) throw new Error('Form context is missing')
    const [, setVersion] = useState(0)
    useEffect(() => form.subscribe(() => setVersion((version) => version + 1)), [form])
    if (name === undefined) return <div>{children}</div>
    const path = Array.isArray(name) ? name : [name ?? '']
    const child = isValidElement<{
      value?: unknown
      onChange?: (event: { target: { value: unknown } } | unknown) => void
    }>(children)
      ? cloneElement(children, {
          value: readPath(form.getValues(), path),
          onChange: (next: { target: { value: unknown } } | unknown) =>
            form.setValue(
              path,
              next && typeof next === 'object' && 'target' in next
                ? (next as { target: { value: unknown } }).target.value
                : next
            )
        })
      : children
    return <div>{child}</div>
  }
  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => {
    const { allowClear, ...inputProps } = props as React.InputHTMLAttributes<HTMLInputElement> & {
      allowClear?: boolean
    }
    return <input {...inputProps} value={inputProps.value ?? ''} />
  }
  const DatePicker = Object.assign(
    ({ disabledDate }: { disabledDate?: (current: dayjs.Dayjs) => boolean }) => (
      <button
        type='button'
        data-disabled-future={disabledDate?.({ isAfter: () => true } as never) ? 'true' : 'false'}
      />
    ),
    {
      RangePicker: ({ disabledDate }: { disabledDate?: (current: dayjs.Dayjs) => boolean }) => (
        <button
          type='button'
          data-disabled-future={disabledDate?.({ isAfter: () => true } as never) ? 'true' : 'false'}
        />
      )
    }
  )
  return {
    Button: ({ children }: { children: ReactNode }) => <button type='button'>{children}</button>,
    Col: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ConfigProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
    DatePicker,
    Form,
    Input: Object.assign(Input, { TextArea: () => <textarea /> }),
    InputNumber: ({
      value,
      onChange,
      ...inputProps
    }: React.InputHTMLAttributes<HTMLInputElement> & {
      value?: number | string | null
      onChange?: (nextValue: number | null) => void
    }) => (
      <input
        {...inputProps}
        type='number'
        value={value === undefined || value === null ? '' : value}
        onChange={(event) => {
          const nextValue = event.target.value === '' ? null : Number(event.target.value)
          onChange?.(Number.isNaN(nextValue) ? null : nextValue)
        }}
      />
    ),
    Select: ({
      options = [],
      value,
      onChange
    }: {
      options?: Array<{ label: ReactNode; value: string | number }>
      value?: string | number
      onChange?: (nextValue: string) => void
    }) => (
      <select
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {String(option.label)}
          </option>
        ))}
      </select>
    ),
    Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Space: ({ children }: { children: ReactNode }) => <div>{children}</div>
  }
})

import dayjs from 'dayjs'
import {
  BestForm,
  evaluateCondition,
  getDefaultValues,
  mergeDefinedValues,
  serializeDatePickerValue,
  serializeDateRangePickerValue,
  toAntRules,
  toDatePickerValue,
  toDateRangePickerValue
} from '../src/ui/BestForm'
import { BestSearch } from '../src/ui/BestSearch'

const require = createRequire(import.meta.url)

function loadAsyncValidator() {
  const antdPackageJson = require.resolve('antd/package.json')
  const validatorPath = require.resolve('@rc-component/async-validator/lib/index.js', {
    paths: [dirname(antdPackageJson)]
  })
  return require(validatorPath).default as new (
    rules: Record<string, unknown>
  ) => {
    validate: (values: Record<string, unknown>) => Promise<Record<string, unknown>>
  }
}

afterEach(() => {
  cleanup()
  latestForm = undefined
})

describe('BestForm', () => {
  it('collects only declared field defaults', () => {
    expect(
      getDefaultValues([
        { field: 'status', label: '状态', component: 'select', defaultValue: 'active' },
        { field: 'keyword', label: '关键词', component: 'input' }
      ])
    ).toEqual({ status: 'active' })
  })

  it('does not let undefined overwrite defined defaults', () => {
    expect(
      mergeDefinedValues(
        { status: 'active', count: 3 },
        { status: undefined, count: undefined, keyword: 'retail' }
      )
    ).toEqual({ status: 'active', count: 3, keyword: 'retail' })
  })

  it('omits undefined validator rule keys before AntD validates numbers', async () => {
    const [requiredRule, numberRule, integerRule, stringRule] =
      toAntRules([
        { required: true, message: 'required' },
        { required: true, type: 'number', min: 1, max: 3, message: 'number' },
        { type: 'integer', message: 'integer' },
        { type: 'string', minLength: 2, maxLength: 4, pattern: '^ab', message: 'string' }
      ]) ?? []

    expect(requiredRule).toEqual({ required: true, message: 'required' })
    expect(numberRule).toMatchObject({
      required: true,
      type: 'number',
      min: 1,
      max: 3,
      message: 'number'
    })
    expect(integerRule).toHaveProperty('validator')
    expect(stringRule).toMatchObject({
      min: 2,
      max: 4,
      pattern: /^ab/,
      message: 'string'
    })
    ;[requiredRule, numberRule, integerRule, stringRule].forEach((rule) => {
      expect(Object.values(rule as Record<string, unknown>)).not.toContain(undefined)
    })

    const AsyncValidator = loadAsyncValidator()
    await expect(
      new AsyncValidator({ price: [requiredRule] }).validate({ price: 1 })
    ).resolves.toEqual({ price: 1 })
  })

  it('normalizes date picker values for display and submit', () => {
    const date = toDatePickerValue('2026-08-18')
    expect(dayjs.isDayjs(date)).toBe(true)
    expect(date?.format('YYYY-MM-DD')).toBe('2026-08-18')
    expect(serializeDatePickerValue(date, '2026-08-18')).toBe('2026-08-18')
  })

  it('blocks future dates in form date pickers when maxDate is today', () => {
    render(
      <BestForm
        fields={[
          { field: 'startDate', label: '开始日期', component: 'date', maxDate: 'today' },
          {
            field: 'range',
            label: '日期范围',
            component: 'dateRange',
            maxDate: 'today'
          }
        ]}
        onSubmit={() => undefined}
      />
    )

    expect(
      screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-disabled-future'))
        .map((button) => button.getAttribute('data-disabled-future'))
    ).toEqual(['true', 'true'])
  })

  it('normalizes date range picker values for display and submit', () => {
    const range = toDateRangePickerValue(['2026-08-18', '2026-08-19'])
    expect(dayjs.isDayjs(range?.[0])).toBe(true)
    expect(dayjs.isDayjs(range?.[1])).toBe(true)
    expect(range?.[0]?.format('YYYY-MM-DD')).toBe('2026-08-18')
    expect(range?.[1]?.format('YYYY-MM-DD')).toBe('2026-08-19')
    expect(serializeDateRangePickerValue(range, ['2026-08-18', '2026-08-19'])).toEqual([
      '2026-08-18',
      '2026-08-19'
    ])
  })

  it('evaluates nested condition fields through dotted paths', () => {
    expect(
      evaluateCondition(
        { operator: 'notEmpty', field: 'customer.name' },
        { customer: { name: 'Alice' } },
        'create'
      )
    ).toBe(true)
  })

  it('re-renders form slots with the current watched values', async () => {
    const { rerender } = render(
      <BestForm
        fields={[
          { field: 'mode', label: '模式', component: 'input' },
          {
            field: 'preview',
            label: '预览',
            component: 'slot',
            render: ({ values }) => <output>{String(values.mode)}</output>
          }
        ]}
        initialValues={{ mode: 'draft' }}
        onSubmit={() => undefined}
      />
    )

    expect(screen.getByText('draft')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'published' } })
    expect(screen.getByText('published')).toBeTruthy()

    rerender(
      <BestForm
        fields={[
          { field: 'mode', label: '模式', component: 'input' },
          {
            field: 'preview',
            label: '预览',
            component: 'slot',
            render: ({ values }) => <output>{String(values.mode)}</output>
          }
        ]}
        initialValues={{ mode: 'archived' }}
        onSubmit={() => undefined}
      />
    )
    await waitFor(() => expect(screen.getByText('archived')).toBeTruthy())
  })

  it('updates number fields without manual setFieldValue or validateFields calls', async () => {
    render(
      <BestForm
        fields={[{ field: 'amount', label: '金额', component: 'number', required: true }]}
        onSubmit={() => undefined}
      />
    )

    const input = screen.getByRole('spinbutton') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12' } })

    await waitFor(() => {
      expect(input.value).toBe('12')
    })
    expect(latestForm?.getValues().amount).toBe(12)
    expect(latestForm?.setFieldValue).not.toHaveBeenCalled()
    expect(latestForm?.validateFields).not.toHaveBeenCalled()
  })

  it('keeps BestSearch default values on mount and clears omitted controlled values', async () => {
    const { rerender } = render(
      <BestSearch
        fields={[
          { field: 'tag', label: '标签', component: 'input' },
          { field: 'status', label: '状态', component: 'input' }
        ]}
        defaultValues={{ tag: 'retail', status: 'active' }}
        onSearch={() => undefined}
      />
    )

    await waitFor(() =>
      expect(
        screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)
      ).toEqual(['retail', 'active'])
    )

    rerender(
      <BestSearch
        fields={[
          { field: 'tag', label: '标签', component: 'input' },
          { field: 'status', label: '状态', component: 'input' }
        ]}
        value={{ tag: 'wholesale' }}
        defaultValues={{ tag: 'retail', status: 'active' }}
        onSearch={() => undefined}
      />
    )

    await waitFor(() =>
      expect(
        screen.getAllByRole('textbox').map((input) => (input as HTMLInputElement).value)
      ).toEqual(['wholesale', ''])
    )
  })

  it('restores the current remote select label when it is not in the first page', async () => {
    const search = vi.fn().mockImplementation(async (params: Record<string, unknown>) => {
      if ('id' in params) return { items: [{ id: 'user-1', name: 'Alice' }] }
      return { items: [] }
    })

    render(
      <BestProvider registry={{ services: { 'user.search': search } }}>
        <BestForm
          fields={[
            {
              field: 'owner',
              label: '负责人',
              component: 'remoteSelect',
              remoteService: 'user.search',
              labelField: 'name',
              valueField: 'id'
            }
          ]}
          initialValues={{ owner: 'user-1' }}
          onSubmit={() => undefined}
        />
      </BestProvider>
    )

    await waitFor(() => {
      const option = screen.getByRole('combobox').querySelector('option[value="user-1"]')
      expect(option?.textContent).toBe('Alice')
    })
  })
})
