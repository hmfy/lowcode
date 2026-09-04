import { useState } from 'react'
import { Button, Modal, Select, Typography } from 'antd'
import type { BestSlotContext } from 'best-lowcode-runtime'

export function AssignButton({ record }: BestSlotContext) {
  const [open, setOpen] = useState(false)
  const [customer, setCustomer] = useState<string>()
  return <>
    <Button type='link' size='small' onClick={() => setOpen(true)}>分配</Button>
    <Modal title='分配客户' open={open} onCancel={() => setOpen(false)} onOk={() => setOpen(false)} okText='确定' cancelText='取消'>
      <div style={{ background: '#f7f8fa', padding: 14, marginBottom: 18 }}>
        <Typography.Text strong>预警信息</Typography.Text>
        <div style={{ marginTop: 10, lineHeight: 2 }}>预警ID：{String(record?.warningId ?? '-')}<br />Descriptor：{String(record?.registeredDescriptor ?? '-')}<br />预警类型：{String(record?.warningType ?? '-')}</div>
      </div>
      <Typography.Text type='secondary'>选择客户</Typography.Text>
      <Select value={customer} onChange={setCustomer} placeholder='请选择客户' style={{ width: '100%', marginTop: 8 }} options={[{ label: '产品演示', value: 'demo' }, { label: 'zhangchengcheng', value: 'zhang' }]} />
    </Modal>
  </>
}
