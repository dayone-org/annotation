import { useState } from 'react'
import { useAnnotation } from '../useAnnotation'
import { Button } from './ui/button'
import { Input } from './ui/input'

export function AuthorGate() {
  const { setAuthor } = useAnnotation()
  const [value, setValue] = useState('')

  return (
    <form
      className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setAuthor(value)
      }}
    >
      <div className="grid gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Annotator name</p>
        <h3 className="text-lg font-semibold text-slate-950">What&apos;s your name?</h3>
        <p className="text-sm text-slate-500">Stored locally and attached to every annotation you create.</p>
      </div>

      <label className="grid gap-2 text-sm font-medium text-slate-700">
        <span>Name</span>
        <Input
          autoFocus
          maxLength={48}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Jane Doe"
          value={value}
        />
      </label>

      <Button disabled={!value.trim()} type="submit">
        Continue
      </Button>
    </form>
  )
}
