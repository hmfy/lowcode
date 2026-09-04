import { Button, Image, List, Typography } from 'antd'

export type BestFileItem = {
  url: string
  name?: string
  mimeType?: string
}

export type BestFilePreviewProps = {
  files: BestFileItem[]
  onDownload?: (file: BestFileItem) => void
}

function isImage(file: BestFileItem) {
  return (
    file.mimeType?.startsWith('image/') ||
    /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|[?#])/i.test(file.url)
  )
}

export function BestFilePreview({ files, onDownload }: BestFilePreviewProps) {
  return (
    <List
      dataSource={files}
      renderItem={(file) => (
        <List.Item
          actions={[
            <Button key='download' type='link' onClick={() => onDownload?.(file)}>
              下载
            </Button>
          ]}
        >
          {isImage(file) ? (
            <Image alt={file.name ?? '文件预览'} height={48} preview src={file.url} width={48} />
          ) : null}
          <Typography.Text ellipsis style={{ marginInlineStart: isImage(file) ? 12 : 0 }}>
            {file.name ?? file.url}
          </Typography.Text>
        </List.Item>
      )}
    />
  )
}
