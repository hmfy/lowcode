import { Drawer, Modal } from 'antd'
import type { ReactNode } from 'react'

type OverlayProps = {
  children: ReactNode
  open: boolean
  title: ReactNode
  onClose: () => void
}

export function BestDrawer({ children, open, title, onClose }: OverlayProps) {
  return (
    <Drawer destroyOnHidden open={open} title={title} width={640} onClose={onClose}>
      {children}
    </Drawer>
  )
}

export function BestModal({ children, open, title, onClose }: OverlayProps) {
  return (
    <Modal destroyOnHidden footer={null} open={open} title={title} onCancel={onClose}>
      {children}
    </Modal>
  )
}
