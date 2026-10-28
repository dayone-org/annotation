import { useAnnotation } from "../useAnnotation";
import { splitMentions } from "../utils";

// Comment text with "@Name" highlighted for each mentioned person. Names come from the staff
// directory, so guests (no directory) see plain text.
export function MentionText({ mentions, text }: { mentions: string[]; text: string }) {
  const { directory } = useAnnotation();
  const names = mentions.length
    ? directory
        .filter((person) => mentions.includes(person.person_id))
        .map((person) => person.display_name)
    : [];

  return splitMentions(text, names).map((part, index) =>
    part.mention ? (
      <span
        className="annotation:rounded annotation:bg-primary/40 annotation:px-0.5 annotation:font-medium annotation:text-foreground"
        key={index}
      >
        {part.text}
      </span>
    ) : (
      part.text
    ),
  );
}
