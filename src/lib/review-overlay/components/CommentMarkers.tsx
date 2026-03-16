import { useCallback, useEffect, useMemo, useState } from 'react'
import { querySelectorSafely } from '../selector'
import { cn } from '../cn'
import { useAnnotation } from '../useAnnotation'
import type { MarkerPosition } from '../types'
import { getMarkerPosition, getThreadCount, getTopLevelComments, markerPositionsEqual } from '../utils'

export function CommentMarkers() {
  const { activeThreadId, comments, scrollToComment, showResolved } = useAnnotation()
  const [positions, setPositions] = useState<Record<string, MarkerPosition>>({})

  const topLevelComments = useMemo(() => {
    return getTopLevelComments(comments).filter((comment) => showResolved || !comment.resolved)
  }, [comments, showResolved])

  const updateMarkers = useCallback(() => {
    setPositions((previous) => {
      const nextPositions = { ...previous }
      const visibleIds = new Set<string>()
      let hasChanges = false

      for (const comment of topLevelComments) {
        visibleIds.add(comment.id)

        const target = querySelectorSafely(comment.selector)
        const targetRect = target?.getBoundingClientRect()
        const nextPosition = targetRect
          ? {
              x: targetRect.left,
              y: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
              connected: true,
            }
          : getMarkerPosition(comment.rect)

        if (!nextPosition) {
          if (comment.id in nextPositions) {
            delete nextPositions[comment.id]
            hasChanges = true
          }
          continue
        }

        if (!markerPositionsEqual(previous[comment.id], nextPosition)) {
          nextPositions[comment.id] = nextPosition
          hasChanges = true
        }
      }

      for (const id of Object.keys(previous)) {
        if (!visibleIds.has(id)) {
          delete nextPositions[id]
          hasChanges = true
        }
      }

      return hasChanges ? nextPositions : previous
    })
  }, [topLevelComments])

  useEffect(() => {
    let frameId = 0
    let timeoutId = 0

    const schedule = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        updateMarkers()
      })
    }

    const observer = new MutationObserver(() => {
      window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(schedule, 32)
    })

    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    })

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [topLevelComments, updateMarkers])

  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483601]">
      {topLevelComments.map((comment) => {
        const position = positions[comment.id]
        if (!position) {
          return null
        }

        const threadCount = getThreadCount(comments, comment.id)
        const offsetX = Math.min(Math.max(position.width - 36, 12), 28)
        const offsetY = Math.min(Math.max(position.height - 36, 10), 18)

        return (
          <button
            key={comment.id}
            className={cn(
              'pointer-events-auto fixed left-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/70 text-[11px] font-semibold text-white shadow-lg shadow-slate-900/20 transition',
              comment.id === activeThreadId ? 'bg-blue-600' : 'bg-slate-900',
              comment.resolved && 'opacity-35',
              !position.connected && 'bg-amber-700',
            )}
            onClick={() => scrollToComment(comment.id)}
            style={{
              transform: `translate(${position.x + offsetX}px, ${position.y + offsetY}px)`,
            }}
            title={`${comment.author} · ${comment.resolved ? 'Resolved' : 'Open'} · ${threadCount} message${
              threadCount === 1 ? '' : 's'
            }`}
            type="button"
          >
            <span>{threadCount}</span>
          </button>
        )
      })}
    </div>
  )
}
