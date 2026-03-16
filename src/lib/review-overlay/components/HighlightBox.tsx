import { cn } from '../cn'
import type { AnnotationRect } from '../types'

type HighlightBoxProps = {
  rect: AnnotationRect | null
  variant: 'hover' | 'focus'
}

export function HighlightBox({ rect, variant }: HighlightBoxProps) {
  if (!rect) {
    return null
  }

  return (
    <div
      className={cn(
        'pointer-events-none fixed left-0 top-0 rounded-md transition-[transform,width,height,opacity] duration-100 ease-out',
        variant === 'hover'
          ? 'border-2 border-sky-500/90 bg-sky-400/10'
          : 'border-2 border-orange-400/90 bg-orange-300/15 shadow-[0_0_0_9999px_rgba(15,23,42,0.08)]',
      )}
      style={{
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}
