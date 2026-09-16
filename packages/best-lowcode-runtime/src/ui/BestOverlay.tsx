import { Drawer, Modal } from 'antd'
import type { ReactNode } from 'react'

type OverlayProps = {
  children: ReactNode
  open: boolean
  title: ReactNode
  onClose: () => void
  width?: number | string
  footer?: ReactNode
}

export function BestDrawer({ children, open, title, onClose, width, footer }: OverlayProps) {
  return (
    <Drawer destroyOnHidden open={open} title={title} width={width ?? 640} footer={footer} onClose={onClose}>
      {children}
    </Drawer>
  )
}

export function BestModal({ children, open, title, onClose, width, footer }: OverlayProps) {
  return (
    <Modal
      destroyOnHidden
      footer={footer ?? null}
      open={open}
      title={title}
      width={width}
      onCancel={onClose}
      styles={{
        root: { minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' },
        body: { minWidth: 0, maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }
      }}
    >
      <div style={{ minWidth: 0, maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}>{children}</div>
    </Modal>
  )
}
