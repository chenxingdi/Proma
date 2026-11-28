/**
 * 联网结果附带图片画廊
 *
 * 图片来自 Tavily 从来源网页提取出的 URL，只做展示，不代表 Proma 或当前模型生成的内容。
 */
import * as React from 'react'
import { ExternalLink, ImageIcon } from 'lucide-react'
import type { WebImageResult } from '@proma/shared'
import { ImageLightbox } from '@/components/ui/image-lightbox'

interface WebImageGalleryProps {
  images: WebImageResult[]
}

export function WebImageGallery({ images }: WebImageGalleryProps): React.ReactElement {
  const [lightboxIndex, setLightboxIndex] = React.useState(0)
  const [lightboxOpen, setLightboxOpen] = React.useState(false)
  const lightboxImages = React.useMemo(() => images.map((image) => ({
    src: image.originalUrl || image.thumbnailUrl,
    alt: image.title,
  })), [images])

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
        <ImageIcon className="size-3" />
        {images.length} 张来源网页图片 · 版权归原作者所有
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => (
          <div key={`${image.originalUrl || image.thumbnailUrl}-${index}`} className="rounded-md bg-muted/20 p-1.5 space-y-1">
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
