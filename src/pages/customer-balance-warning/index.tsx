import { DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { BestCrudPage, BestProvider } from 'best-lowcode-runtime'
import { Button, Card, Col, Form, Input, InputNumber, message, Radio, Row, Select, Tabs, Typography } from 'antd'
import { useEffect, useState } from 'react'
import 'best-lowcode-runtime/style.css'
import { getGlobalConfig, type BalanceWarningConfig, updateGlobalConfig } from './adapter'
import { balanceWarningRegistry } from './registry'
import { customerConfigSchema, warningRecordSchema } from './schema'

const frequencyOptions = [{ label: '每天定时通知', value: 'daily' }, { label: '每周定时通知', value: 'weekly' }]
const weekdayOptions = [{ label: '周一', value: 'monday' }, { label: '周二', value: 'tuesday' }, { label: '周三', value: 'wednesday' }, { label: '周四', value: 'thursday' }, { label: '周五', value: 'friday' }]

function GlobalConfig() {
  const [form] = Form.useForm<BalanceWarningConfig>()
  const [editing, setEditing] = useState(false)
  useEffect(() => { void getGlobalConfig({}).then((value) => form.setFieldsValue(value as BalanceWarningConfig)) }, [form])
  const save = async () => { await form.validateFields(); await updateGlobalConfig(form.getFieldsValue()); setEditing(false); message.success('配置已保存（静态演示）') }
  return <Card title='预警模型配置' extra={editing ? null : <Button type='primary' icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑配置</Button>}>
    <Form form={form} layout='vertical' disabled={!editing}>
      <Row gutter={16}><Col span={6}><Form.Item name='historyDays' label='历史天数（M）' extra='用于分析的历史数据天数'><InputNumber min={1} /></Form.Item></Col><Col span={6}><Form.Item name='forecastDays' label='预测天数（N）' extra='预测未来开销的天数'><InputNumber min={1} /></Form.Item></Col><Col span={6}><Form.Item name='warningFactor' label='预警系数' extra='预警触发的敏感度系数'><InputNumber min={0} step={0.1} /></Form.Item></Col><Col span={6}><Form.Item name='minimumBalance' label='预警最小金额（$）' extra='模型值低于此值时使用该基线'><InputNumber min={0} /></Form.Item></Col></Row>
      <Card size='small' className='config-section' title='通知配置'><Form.Item name='frequency' label='通知频率'><Radio.Group options={frequencyOptions} /></Form.Item><Form.Item noStyle shouldUpdate={(previous, current) => previous.frequency !== current.frequency}>{({ getFieldValue }) => getFieldValue('frequency') === 'weekly' ? <Form.Item name='weekday' label='每周通知日'><Select options={weekdayOptions} style={{ width: 180 }} /></Form.Item> : null}</Form.Item><Form.List name='timePoints'>{(fields, { add, remove }) => <Form.Item label='通知时间点' extra='最多添加 10 个通知时间点'><div className='time-list'>{fields.map((field) => <Form.Item key={field.key} required={false}><Form.Item name={field.name} noStyle><Input placeholder='HH:mm' style={{ width: 120 }} /></Form.Item><Button type='link' danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>删除</Button></Form.Item>)}</div><Button type='link' icon={<PlusOutlined />} onClick={() => add('09:00')}>添加时间点</Button></Form.Item>}</Form.List><Typography.Paragraph type='secondary'>同一客户在同一自然日内最多发送 1 次通知，每日 0:00 重置去重计数。</Typography.Paragraph></Card>
      {editing && <div className='form-footer'><Button onClick={() => setEditing(false)}>取消</Button><Button type='primary' icon={<SaveOutlined />} onClick={() => void save()}>保存配置</Button></div>}
    </Form>
  </Card>
}

export function CustomerBalanceWarningPage() {
  return <BestProvider registry={balanceWarningRegistry}><div className='balance-alert-page'><Tabs items={[{ key: 'global', label: '全局配置', children: <GlobalConfig /> }, { key: 'customer', label: '客户配置', children: <BestCrudPage schema={customerConfigSchema} /> }, { key: 'records', label: '预警记录', children: <BestCrudPage schema={warningRecordSchema} /> }]} /></div></BestProvider>
}
