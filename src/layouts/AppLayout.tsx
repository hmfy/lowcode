import { AppstoreOutlined, MenuFoldOutlined, MenuUnfoldOutlined, TeamOutlined, WarningOutlined, ApiOutlined } from '@ant-design/icons'
import { Breadcrumb, Button, Layout, Menu, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { useMemo, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { navigationItems } from '../shared/config/navigation'

const iconMap = { dashboard: <AppstoreOutlined />, customers: <TeamOutlined />, warnings: <WarningOutlined />, providers: <ApiOutlined /> }

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const selectedKeys = useMemo(() => [navigationItems.find((item) => item.path === location.pathname)?.key ?? 'dashboard'], [location.pathname])
  const menuItems: MenuProps['items'] = navigationItems.map((item) => ({ key: item.key, icon: iconMap[item.key], label: <Link to={item.path}>{item.label}</Link> }))
  const currentItem = navigationItems.find((item) => item.path === location.pathname)

  return <Layout className="app-shell">
    <Layout.Sider collapsible collapsed={collapsed} trigger={null} width={232} className="app-sider">
      <Link to="/" className="brand"><span className="brand-mark">B</span>{!collapsed && <span>Best Lowcode</span>}</Link>
      <Menu theme="dark" mode="inline" selectedKeys={selectedKeys} items={menuItems} />
    </Layout.Sider>
    <Layout className="app-main-layout">
      <Layout.Header className="app-header">
        <Button type="text" aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'} icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed((value) => !value)} />
        <Typography.Text type="secondary">企业低代码平台</Typography.Text>
        <div className="header-actions"><Typography.Text>管理员</Typography.Text></div>
      </Layout.Header>
      <Layout.Content className="app-content">
        <Breadcrumb items={[{ title: '工作台' }, { title: currentItem?.label ?? '页面不存在' }]} />
        <main className="page-container"><Outlet /></main>
      </Layout.Content>
    </Layout>
  </Layout>
}
