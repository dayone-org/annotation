import type { HTMLAttributes } from 'react'
import { cn } from '../../cn'

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('h-px w-full bg-slate-200', className)} {...props} />
}
