import { cn } from '@/lib/utils'
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
          ? 'border-2 border-ring/80 bg-ring/10'
          : 'border-2 border-primary/80 bg-primary/10 shadow-[0_0_0_9999px_var(--overlay-scrim)]',
      )}
      style={{
        transform: `translate(${rect.left}px, ${rect.top}px)`,
        width: rect.width,
        height: rect.height,
      }}
    />
  )
}
