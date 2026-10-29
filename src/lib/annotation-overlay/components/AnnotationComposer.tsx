import { PaperclipIcon, PaperPlaneRightIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StaffMember } from "../types";
import { ACCEPTED_TYPES, MAX_IMAGES, prepareImage, type PreparedImage } from "../images";
import { splitMentions } from "../utils";

type AnnotationComposerProps = {
  /** Staff for the mention picker; empty (guests) means "@" is plain text. */
  directory?: StaffMember[];
  errorMessage?: string | null;
  onSubmit: (text: string, mentionIds: string[], images: PreparedImage[]) => Promise<boolean>;
};

type Attachment = PreparedImage & { previewUrl: string };

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
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  // Free the preview blobs when the composer goes away.
  useEffect(
    () => () => attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)),
    [],
  );

  const attach = async (files: File[]) => {
    setAttachError(null);
    setIsPreparing(true);
    const added: Attachment[] = [];
    // shortcut: files beyond the fifth image are ignored without a hint (the paperclip is disabled at five).
    for (const file of files.slice(0, MAX_IMAGES - attachmentsRef.current.length)) {
      try {
        const prepared = await prepareImage(file);
        added.push({
          ...prepared,
          previewUrl: URL.createObjectURL(prepared.blob),
        });
      } catch (error) {
        setAttachError(error instanceof Error ? error.message : "Image could not be read.");
      }
    }
    setAttachments((previous) => [...previous, ...added]);
    setIsPreparing(false);
  };

  const detach = (previewUrl: string) => {
    URL.revokeObjectURL(previewUrl);
    setAttachments((previous) => previous.filter((item) => item.previewUrl !== previewUrl));
    setAttachError(null);
  };

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
      // The popover keeps the composer open on Escape while this is set (text survives a failed send).
      aria-busy={isSubmitting}
      className="annotation:flex annotation:flex-col"
      onSubmit={async (event) => {
        event.preventDefault();
        // Enter calls requestSubmit, which skips the disabled Send button.
        if (isPreparing || isSubmitting || !value.trim()) {
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
        try {
          const didSave = await onSubmit(value, mentionIds, attachments);
          if (didSave) {
            setValue("");
            setPicked([]);
            attachments.forEach((item) => URL.revokeObjectURL(item.previewUrl));
            setAttachments([]);
            setAttachError(null);
          }
        } finally {
          setIsSubmitting(false);
        }
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

      {attachments.length ? (
        <div className="annotation:flex annotation:flex-wrap annotation:gap-2 annotation:px-2 annotation:pb-2">
          {attachments.map((item, index) => (
            <div className="annotation:relative annotation:size-12" key={item.previewUrl}>
              <img
                alt={`Attachment ${index + 1}`}
                className="annotation:size-full annotation:rounded-md annotation:border annotation:border-border annotation:object-cover"
                src={item.previewUrl}
              />
              <button
                aria-label={`Remove attachment ${index + 1}`}
                className="annotation:absolute annotation:-top-1.5 annotation:-right-1.5 annotation:flex annotation:size-5 annotation:items-center annotation:justify-center annotation:rounded-full annotation:bg-foreground annotation:text-background annotation:outline-none annotation:focus-visible:ring-2 annotation:focus-visible:ring-ring"
                disabled={isSubmitting}
                onClick={() => detach(item.previewUrl)}
                type="button"
              >
                <XIcon className="annotation:size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {attachError ? (
        <div
          className="annotation:rounded-lg annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive"
          role="alert"
        >
          {attachError}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="annotation:rounded-lg annotation:border annotation:border-destructive/30 annotation:bg-destructive/10 annotation:px-3 annotation:py-2 annotation:text-sm annotation:text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="annotation:flex annotation:items-center annotation:justify-end annotation:gap-2">
        <input
          accept={ACCEPTED_TYPES.join(",")}
          className="annotation:hidden"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            // Same file again must fire a change next time.
            event.target.value = "";
            void attach(files);
          }}
          ref={fileInputRef}
          tabIndex={-1}
          type="file"
        />
        <Button
          aria-label="Attach image"
          disabled={isSubmitting || isPreparing || attachments.length >= MAX_IMAGES}
          onClick={() => fileInputRef.current?.click()}
          size="icon"
          type="button"
          variant="ghost"
        >
          {isPreparing ? <Spinner /> : <PaperclipIcon />}
        </Button>
        <Button
          aria-label="Send"
          disabled={isSubmitting || isPreparing || !value.trim()}
          type="submit"
          size="icon"
        >
          {isSubmitting ? <Spinner /> : <PaperPlaneRightIcon />}
        </Button>
      </div>
    </form>
  );
}
