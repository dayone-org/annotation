import { useEffect } from 'react'
import { generateSelector } from '../selector'
import { useAnnotation } from '../useAnnotation'
import { measurePoint } from '../utils'

function getSelectableElement(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null
  if (!node || node.closest('[data-annotation-overlay-root="true"]')) {
    return null
  }

  if (node === document.body || node === document.documentElement) {
    return null
  }

  return node
}

export function InteractionLayer() {
  const { commentMode, selectElement } = useAnnotation()

  useEffect(() => {
    if (!commentMode) {
      return
    }

    const handleClick = (event: MouseEvent) => {
      const target = getSelectableElement(event.target)
      if (!target) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      selectElement(generateSelector(target), measurePoint(event.clientX, event.clientY, target))
    }

    document.addEventListener('click', handleClick, true)

    return () => {
      document.removeEventListener('click', handleClick, true)
    }
  }, [commentMode, selectElement])

  return null
}
