import { useContext } from 'react'
import { AnnotationContext } from './annotation-context'

export function useAnnotation() {
  const value = useContext(AnnotationContext)

  if (!value) {
    throw new Error('useAnnotation must be used within AnnotationProvider')
  }

  return value
}
