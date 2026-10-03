export const SCHEMA_CARD_ID = "schema-card";

export function focusSchemaCard(doc: Pick<Document, "getElementById">) {
  const card = doc.getElementById(SCHEMA_CARD_ID);
  card?.focus();
  card?.scrollIntoView?.({ block: "nearest" });
}

export function SchemaIssuesLink({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={() => focusSchemaCard(document)}
      className="text-xs text-destructive underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {count} schema issue{count === 1 ? "" : "s"} — go to schema
    </button>
  );
}
