import { useState } from 'react'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { useAnnotation } from '../useAnnotation'

export function AuthorGate() {
  const { setAuthor } = useAnnotation()
  const [value, setValue] = useState('')

  return (
    <form
      className="grid gap-4 rounded-xl border border-border bg-muted/40 p-4"
      onSubmit={(event) => {
        event.preventDefault()
        setAuthor(value)
      }}
    >
      <div className="grid gap-1">
        <h3 className="text-lg font-semibold text-foreground">What&apos;s your name?</h3>
      </div>

      <label className="grid gap-2 text-sm font-medium text-foreground">
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
