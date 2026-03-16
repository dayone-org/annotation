import { useEffect } from 'react'
import { generateSelector } from '../selector'
import { useAnnotation } from '../useAnnotation'
import { measureRect } from '../utils'

function getSelectableElement(target: EventTarget | null): HTMLElement | null {
  if (!target) {
    return null
  }

  const node = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null
  if (!node) {
    return null
  }

  if (node.closest('[data-review-overlay-root="true"]')) {
    return null
  }

  if (node === document.body || node === document.documentElement) {
    return null
  }

  return node
}

export function InteractionLayer() {
  const { commentMode, selectElement, setHoveredRect } = useAnnotation()

  useEffect(() => {
    if (!commentMode) {
      setHoveredRect(null)
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const target = getSelectableElement(event.target)
      if (!target) {
        setHoveredRect(null)
        return
      }

      setHoveredRect(measureRect(target))
    }

    const handleClick = (event: MouseEvent) => {
      const target = getSelectableElement(event.target)
      if (!target) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      const selector = generateSelector(target)
      const rect = measureRect(target)
      selectElement(selector, rect)
    }

    document.addEventListener('pointermove', handlePointerMove, true)
    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('pointermove', handlePointerMove, true)
      document.removeEventListener('click', handleClick, true)
    }
  }, [commentMode, selectElement, setHoveredRect])

  return null
}
