import { Button, Result } from 'antd'
import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return <Result status="404" title="404" subTitle="抱歉，访问的页面不存在。" extra={<Button type="primary"><Link to="/">返回工作台</Link></Button>} />
}
