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
      className="annotation:flex annotation:flex-col"
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
        className="annotation:resize-none annotation:border-0 annotation:bg-transparent"
      />

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
