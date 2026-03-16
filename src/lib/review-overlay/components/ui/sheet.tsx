import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'
import * as React from 'react'
import { cn } from '../../cn'

const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetPortal = Dialog.Portal
const SheetClose = Dialog.Close

const SheetOverlay = React.forwardRef<ElementRef<typeof Dialog.Overlay>, ComponentPropsWithoutRef<typeof Dialog.Overlay>>(
  ({ className, ...props }, ref) => (
    <Dialog.Overlay
      className={cn('pointer-events-none fixed inset-0 z-[2147483601] bg-transparent', className)}
      ref={ref}
      {...props}
    />
  ),
)
SheetOverlay.displayName = Dialog.Overlay.displayName

const SheetContent = React.forwardRef<ElementRef<typeof Dialog.Content>, ComponentPropsWithoutRef<typeof Dialog.Content>>(
  ({ className, children, ...props }, ref) => (
    <SheetPortal>
      <SheetOverlay />
      <Dialog.Content
        className={cn(
          'fixed right-4 top-4 bottom-4 z-[2147483602] flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-overlay outline-none',
          'data-[state=closed]:translate-x-[calc(100%+1rem)] data-[state=open]:translate-x-0 transition-transform duration-200',
          'max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:w-full max-md:rounded-b-none max-md:rounded-t-2xl',
          'max-md:data-[state=closed]:translate-y-full max-md:data-[state=open]:translate-y-0',
          className,
        )}
        ref={ref}
        {...props}
      >
        {children}
        <SheetClose className="absolute right-3 top-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetClose>
      </Dialog.Content>
    </SheetPortal>
  ),
)
SheetContent.displayName = Dialog.Content.displayName

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 pr-8', className)} {...props} />
}

function SheetTitle({ className, ...props }: ComponentPropsWithoutRef<typeof Dialog.Title>) {
  return <Dialog.Title className={cn('text-xl font-semibold text-slate-950', className)} {...props} />
}

function SheetDescription({ className, ...props }: ComponentPropsWithoutRef<typeof Dialog.Description>) {
  return <Dialog.Description className={cn('text-sm text-slate-500', className)} {...props} />
}

export { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger }
