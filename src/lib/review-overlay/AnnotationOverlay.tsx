import { createPortal } from 'react-dom'
import { AnnotationProvider } from './AnnotationContext'
import type { AnnotationOverlayProps } from './types'
import { HighlightBox } from './components/HighlightBox'
import { InteractionLayer } from './components/InteractionLayer'
import { CommentMarkers } from './components/CommentMarkers'
import { AnnotationPanel } from './components/AnnotationPanel'
import { useAnnotation } from './useAnnotation'

function AnnotationOverlayScene() {
  const { commentMode, composer, flashRect, hoveredRect } = useAnnotation()

  return createPortal(
    <div className="relative z-[2147483600]" data-review-overlay-root="true">
      <InteractionLayer />
      <CommentMarkers />
      <HighlightBox rect={hoveredRect} variant="hover" />
      <HighlightBox rect={flashRect} variant="focus" />
      {commentMode && !composer ? (
        <div className="fixed bottom-7 left-1/2 z-[2147483602] -translate-x-1/2 rounded-full border border-border/70 bg-popover/95 px-4 py-2 text-sm font-medium text-popover-foreground shadow-lg backdrop-blur">
          Comment mode active
        </div>
      ) : null}
      <AnnotationPanel />
    </div>,
    document.body,
  )
}

export function AnnotationOverlay(props: AnnotationOverlayProps) {
  if (typeof document === 'undefined') {
    return null
  }

  return (
    <AnnotationProvider {...props}>
      <AnnotationOverlayScene />
    </AnnotationProvider>
  )
}
