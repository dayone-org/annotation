import { PaperPlaneRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { errorMessageClass } from "@/components/ui/styles";
import { useState } from "react";
import { css } from "../stitches";

type AnnotationComposerProps = {
  errorMessage?: string | null;
  onSubmit: (text: string) => Promise<boolean>;
};

const formClass = css({
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
});

const textareaClass = css({
  backgroundColor: "transparent",
  border: 0,
  minHeight: 0,
  padding: 0,
  resize: "none",
  "&:focus": {
    borderColor: "transparent",
    boxShadow: "none",
  },
});

const actionsClass = css({
  display: "flex",
  gap: "0.5rem",
  justifyContent: "flex-end",
});

export function AnnotationComposer({ errorMessage = null, onSubmit }: AnnotationComposerProps) {
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <form
      className={formClass()}
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
        className={textareaClass()}
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
      />

      {errorMessage ? <div className={errorMessageClass()}>{errorMessage}</div> : null}

      <div className={actionsClass()}>
        <Button disabled={isSubmitting || !value.trim()} size="icon" type="submit">
          {isSubmitting ? <Spinner /> : <PaperPlaneRightIcon />}
        </Button>
      </div>
    </form>
  );
}
