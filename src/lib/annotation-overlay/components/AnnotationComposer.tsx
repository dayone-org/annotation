import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

type AnnotationComposerProps = {
  errorMessage?: string | null;
  onSubmit: (text: string) => Promise<boolean>;
};

export function AnnotationComposer({ errorMessage = null, onSubmit }: AnnotationComposerProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className="flex flex-col"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim()) {
          return;
        }

        setIsSubmitting(true);
        const didSave = await onSubmit(value);
        if (didSave) {
          setValue("");
        }
        setIsSubmitting(false);
      }}
    >
      <Textarea
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
            return;
          }

          event.preventDefault();
          event.currentTarget.form?.requestSubmit();
        }}
        placeholder="Annotate..."
        rows={1}
        value={value}
        className="resize-none border-0 bg-transparent"
      />

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button disabled={isSubmitting || !value.trim()} type="submit" size="icon">
          {isSubmitting ? <Spinner /> : <PaperPlaneRightIcon />}
        </Button>
      </div>
    </form>
  );
}
