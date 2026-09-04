import { Button, Card, Col, Row, Statistic, Typography } from 'antd'
import { Link } from 'react-router-dom'

const statistics = [{ title: '应用总数', value: 12 }, { title: '今日发布', value: 3 }, { title: '活跃用户', value: 284 }]

export function DashboardPage() {
  return <section>
    <div className="page-heading"><div><Typography.Title level={2}>工作台</Typography.Title><Typography.Paragraph type="secondary">集中查看客户服务和业务运营状态。</Typography.Paragraph></div><Button type="primary"><Link to="/customers">查看客户</Link></Button></div>
    <Row gutter={[16, 16]}>{statistics.map((statistic) => <Col xs={24} md={8} key={statistic.title}><Card><Statistic {...statistic} /></Card></Col>)}</Row>
    <Card title="快速开始" className="section-card"><Typography.Paragraph>通过客户管理查看客户资料和当前服务状态。</Typography.Paragraph><Button type="link" className="inline-link"><Link to="/customers">进入客户管理</Link></Button></Card>
  </section>
}
