import type { HTMLAttributes } from 'react'
import { cn } from '../../cn'

export function Avatar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white',
        className,
      )}
      {...props}
    />
  )
}
