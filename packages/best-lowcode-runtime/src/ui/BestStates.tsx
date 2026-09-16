import { Empty, Result, Spin } from 'antd'

export function BestLoading({ description = '加载中' }: { description?: string }) {
  return (
    <div style={{ display: 'grid', minHeight: 160, placeItems: 'center' }}>
      <Spin tip={description} />
    </div>
  )
}

export function BestEmpty({ description = '暂无数据' }: { description?: string }) {
  return <Empty description={description} />
}

export function BestError({ description = '加载失败' }: { description?: string }) {
  return <Result status='error' title={description} />
}
