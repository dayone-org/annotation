const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

// Project ID from its name, valid for annotation_admin_set_project; null if the name yields none.
export function projectIdFromName(name: string): string | null {
  const id = name
    .toLowerCase()
    .replace(/[äöüß]/g, (char) => UMLAUTS[char])
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 63)
    .replace(/-$/, "");
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(id) ? id : null;
}
