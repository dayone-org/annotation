import { useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { querySelectorSafely } from '../selector'
import { useAnnotation } from '../useAnnotation'
import type { MarkerPosition } from '../types'
import { getMarkerPosition, getThreadCount, getTopLevelComments, markerPositionsEqual, measureRect } from '../utils'

export function CommentMarkers() {
  const { activeThreadId, comments, openThreadComposer, showResolved } = useAnnotation()
  const [positions, setPositions] = useState<Record<string, MarkerPosition>>({})

  const topLevelComments = useMemo(() => {
    return getTopLevelComments(comments).filter((comment) => showResolved || !comment.resolved)
  }, [comments, showResolved])

  const stackedOffsets = useMemo(() => {
    const groups = new Map<string, string[]>()

    for (const comment of topLevelComments) {
      const position = positions[comment.id]
      if (!position) {
        continue
      }

      const key = `${Math.round(position.x)}:${Math.round(position.y)}`
      const group = groups.get(key)
      if (group) {
        group.push(comment.id)
      } else {
        groups.set(key, [comment.id])
      }
    }

    const nextOffsets: Record<string, { x: number; y: number }> = {}

    for (const ids of groups.values()) {
      ids.forEach((id, index) => {
        const column = index % 3
        const row = Math.floor(index / 3)

        nextOffsets[id] = {
          x: column * 10,
          y: row * 10,
        }
      })
    }

    return nextOffsets
  }, [positions, topLevelComments])

  const updateMarkers = useCallback(() => {
    setPositions((previous) => {
      const nextPositions = { ...previous }
      const visibleIds = new Set<string>()
      let hasChanges = false

      for (const comment of topLevelComments) {
        visibleIds.add(comment.id)

        const nextPosition = getMarkerPosition(comment.rect, querySelectorSafely(comment.selector))

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

    const schedule = () => {
      if (frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(() => {
        frameId = 0
        updateMarkers()
      })
    }

    schedule()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.cancelAnimationFrame(frameId)
    }
  }, [topLevelComments, updateMarkers])

  return (
    <div className="pointer-events-none fixed inset-0 z-2147483601">
      {topLevelComments.map((comment) => {
        const position = positions[comment.id]
        if (!position) {
          return null
        }

        const threadCount = getThreadCount(comments, comment.id)
        const offsetX = 10
        const offsetY = 10
        const stackedOffset = stackedOffsets[comment.id] ?? { x: 0, y: 0 }

        return (
          <button
            key={comment.id}
            className={cn(
              'pointer-events-auto fixed left-0 top-0 inline-flex size-8 items-center justify-center rounded-full border border-background/80 text-[11px] font-semibold shadow-lg transition cursor-pointer',
              comment.id === activeThreadId ? 'bg-primary text-primary-foreground' : 'bg-foreground text-background',
              comment.resolved && 'opacity-35',
            )}
            onClick={(event) => openThreadComposer(comment.id, measureRect(event.currentTarget))}
            style={{
              transform: `translate(${position.x + offsetX + stackedOffset.x}px, ${position.y + offsetY + stackedOffset.y}px)`,
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
