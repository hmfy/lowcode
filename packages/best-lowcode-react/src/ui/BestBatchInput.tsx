import { Input } from 'antd'
import type { TextAreaProps } from 'antd/es/input'
import { useImperativeHandle, useMemo, useState } from 'react'

export type BestBatchInputRef = {
  getParsedValue: () => string[][]
}

export type BestBatchInputProps = Omit<TextAreaProps, 'onChange'> & {
  ref?: React.Ref<BestBatchInputRef>
  separator?: string
  onChange?: (value: string, parsed: string[][]) => void
}

function parse(value: string, separator: string) {
  const escaped = separator.replace(/[\\\]\-^]/g, '\\$&')
  const delimiter = new RegExp(`[${escaped}]`)
  return value
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => row.split(delimiter).map((cell) => cell.trim()))
}

export function BestBatchInput({
  ref,
  separator = '|',
  value,
  defaultValue,
  onChange,
  ...props
}: BestBatchInputProps) {
  const [innerValue, setInnerValue] = useState(String(defaultValue ?? ''))
  const currentValue = value == null ? innerValue : String(value)
  const parsed = useMemo(() => parse(currentValue, separator), [currentValue, separator])

  useImperativeHandle(ref, () => ({ getParsedValue: () => parsed }), [parsed])

  return (
    <Input.TextArea
      {...props}
      value={currentValue}
      onChange={(event) => {
        const nextValue = event.target.value
        if (value == null) setInnerValue(nextValue)
        onChange?.(nextValue, parse(nextValue, separator))
      }}
    />
  )
}
