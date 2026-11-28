/**
 * SerpApiImageSearch 工具结果渲染器 — 图片卡片画廊
 *
 * 图片来自公开网络搜索，只做展示，不代表 Proma 或当前模型生成的内容。
 * 缩略图用 SerpAPI 缓存地址，点击可用系统浏览器打开原图或来源页面。
 */

import * as React from 'react'
import { ExternalLink, ImageIcon } from 'lucide-react'
import type { WebImageResult } from '@proma/shared'
import { ImageLightbox } from '@/components/ui/image-lightbox'

interface ImageSearchResultRendererProps {
  images?: WebImageResult[]
  result: string
  isError: boolean
}

function parseImages(result: string): WebImageResult[] {
  try {
    const parsed: unknown = JSON.parse(result)
    if (Array.isArray(parsed)) return parsed as WebImageResult[]
  } catch {
    // 结果不是 JSON 时只展示文本
  }
  return []
}

export function ImageSearchResultRenderer({ images, result, isError }: ImageSearchResultRendererProps): React.ReactElement {
  if (isError) {
    return (
      <pre className="rounded-md p-3 text-[12px] font-mono text-destructive/80 bg-destructive/5 whitespace-pre-wrap break-all overflow-x-auto">
        {result}
      </pre>
    )
  }

  const gallery = images?.length ? images : parseImages(result)
  if (gallery.length === 0) {
    return <pre className="rounded-md p-3 text-[12px] font-mono text-foreground/60 bg-muted/30 whitespace-pre-wrap break-all overflow-x-auto">{result}</pre>
  }

  const [lightboxIndex, setLightboxIndex] = React.useState(0)
  const [lightboxOpen, setLightboxOpen] = React.useState(false)
  const lightboxImages = React.useMemo(() => gallery.map((image) => ({
    src: image.originalUrl || image.thumbnailUrl,
    alt: image.title,
  })), [gallery])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
        <ImageIcon className="size-3" />
        {gallery.length} 张公开网络图片 · 版权归原作者所有
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {gallery.map((image, index) => (
          <div key={`${image.thumbnailUrl}-${index}`} className="rounded-md bg-muted/20 p-1.5 space-y-1">
            <button
              type="button"
              onClick={() => { setLightboxIndex(index); setLightboxOpen(true) }}
              className="block w-full overflow-hidden rounded"
            >
              <img
                src={image.thumbnailUrl || image.originalUrl}
                alt={image.title}
                className="h-24 w-full object-cover"
                loading="lazy"
              />
            </button>
            <div className="line-clamp-2 text-[11px] text-foreground/80" title={image.title}>{image.title}</div>
            {image.source && <div className="truncate text-[10px] text-muted-foreground/60">{image.source}</div>}
            {image.link && (
              <button
                type="button"
                onClick={() => window.electronAPI.openExternal(image.link)}
                className="flex items-center gap-1 text-[10px] text-primary/70 hover:underline"
              >
                <ExternalLink className="size-2.5" /> 来源页面
              </button>
            )}
          </div>
        ))}
      </div>
      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
      />
    </div>
  )
}
