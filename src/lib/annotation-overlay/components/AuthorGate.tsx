import { useState } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useAnnotation } from "../useAnnotation";

export function AuthorGate() {
  const { setAuthor } = useAnnotation();
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setAuthor(value);
      }}
      className="flex flex-col gap-4"
    >
      <Field>
        <FieldLabel>What&apos;s your name?</FieldLabel>
        <Input
          autoFocus
          maxLength={48}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Jane Doe"
          value={value}
        />
      </Field>
      <Button disabled={!value.trim()} type="submit">
        Continue
      </Button>
    </form>
  );
}
