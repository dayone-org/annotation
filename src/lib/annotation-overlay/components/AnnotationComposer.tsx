import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StaffMember } from "../types";
import { splitMentions } from "../utils";

type AnnotationComposerProps = {
  /** Staff for the mention picker; empty (guests) means "@" is plain text. */
  directory?: StaffMember[];
  errorMessage?: string | null;
  onSubmit: (text: string, mentionIds: string[]) => Promise<boolean>;
};

const MAX_OPTIONS = 6;

// "@query" right before the caret, at the start or after whitespace. Names contain spaces, so the
// query may too; it ends at a line break or a second "@".
function getMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const match = text.slice(0, caret).match(/(?:^|\s)@([^@\n]{0,48})$/);
  if (!match) {
    return null;
  }
  return { start: caret - match[1].length - 1, query: match[1].toLowerCase() };
}

export function AnnotationComposer({
  directory = [],
  errorMessage = null,
  onSubmit,
}: AnnotationComposerProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  // People picked in this draft; only those whose "@Name" is still in the text are sent.
  const [picked, setPicked] = useState<StaffMember[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Caret after an inserted name, set right after React wrote the new value (before the next key).
  const pendingCaret = useRef<number | null>(null);
  const listId = useId();

  useLayoutEffect(() => {
    if (pendingCaret.current !== null) {
      textareaRef.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
      pendingCaret.current = null;
    }
  });

  const mention = directory.length > 0 ? getMentionQuery(value, caret) : null;
  const options =
    mention && mention.start !== dismissedAt
      ? directory
          .filter((person) =>
            person.display_name
              .toLowerCase()
              .split(/\s+/)
              .some((_, index, words) => words.slice(index).join(" ").startsWith(mention.query)),
          )
          .slice(0, MAX_OPTIONS)
      : [];
  const isPickerOpen = options.length > 0;
  const activeOption = options[Math.min(activeIndex, options.length - 1)];

  const pick = (person: StaffMember) => {
    if (!mention) {
      return;
    }
    const inserted = `@${person.display_name} `;
    const next = value.slice(0, mention.start) + inserted + value.slice(caret);
    const nextCaret = mention.start + inserted.length;
    setValue(next);
    setCaret(nextCaret);
    setPicked((previous) =>
      previous.some((entry) => entry.person_id === person.person_id)
        ? previous
        : [...previous, person],
    );
    // Closed until the next keystroke: "@Anna " would still match "Anna Muster".
    setDismissedAt(mention.start);
    pendingCaret.current = nextCaret;
  };

  return (
    <form
      className="annotation:flex annotation:flex-col"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim()) {
          return;
        }

        setIsSubmitting(true);
        // Same matching as the highlighting: whole names only, the longest name wins.
        const mentioned = new Set(
          splitMentions(
            value,
            picked.map((person) => person.display_name),
          )
            .filter((part) => part.mention)
            .map((part) => part.text.slice(1)),
        );
        const mentionIds = picked
          .filter((person) => mentioned.has(person.display_name))
          .map((person) => person.person_id);
        const didSave = await onSubmit(value, mentionIds);
        if (didSave) {
          setValue("");
          setPicked([]);
        }
        setIsSubmitting(false);
      }}
    >
      <Textarea
        aria-activedescendant={isPickerOpen ? `${listId}-${activeOption.person_id}` : undefined}
        aria-autocomplete={directory.length > 0 ? "list" : undefined}
        aria-controls={isPickerOpen ? listId : undefined}
        aria-expanded={directory.length > 0 ? isPickerOpen : undefined}
        autoFocus
        onChange={(event) => {
          setValue(event.target.value);
          setCaret(event.target.selectionStart);
          setActiveIndex(0);
          setDismissedAt(null);
        }}
        onKeyDown={(event) => {
          if (isPickerOpen) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              setActiveIndex(
                (Math.min(activeIndex, options.length - 1) + step + options.length) %
                  options.length,
              );
              return;
            }
            if (
              (event.key === "Enter" || event.key === "Tab") &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              pick(activeOption);
              return;
            }
            if (event.key === "Escape") {
              // Closes only the picker; the popover and the overlay ignore a handled Escape.
              event.preventDefault();
              setDismissedAt(mention?.start ?? null);
              return;
            }
          }

          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }

          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        placeholder="Annotate..."
        ref={textareaRef}
        role={directory.length > 0 ? "combobox" : undefined}
        rows={1}
        value={value}
        className="annotation:resize-none annotation:border-0 annotation:bg-transparent"
      />

      {isPickerOpen ? (
        <div
          className="annotation:flex annotation:flex-col annotation:gap-0.5 annotation:py-1"
          id={listId}
          role="listbox"
        >
          {options.map((person) => (
            <button
              aria-selected={person === activeOption}
              className={cn(
                "annotation:rounded-md annotation:px-3 annotation:py-1.5 annotation:text-left annotation:text-sm",
                person === activeOption && "annotation:bg-muted",
              )}
              id={`${listId}-${person.person_id}`}
              key={person.person_id}
              // Keep the focus in the textarea.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(person)}
              role="option"
              tabIndex={-1}
              type="button"
            >
              {person.display_name}
            </button>
          ))}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="annotation:rounded-lg annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="annotation:flex annotation:items-center annotation:justify-end annotation:gap-2">
        <Button disabled={isSubmitting || !value.trim()} type="submit" size="icon">
          {isSubmitting ? <Spinner /> : <PaperPlaneRightIcon />}
        </Button>
      </div>
    </form>
  );
}
