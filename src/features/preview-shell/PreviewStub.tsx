/**
 * Placeholder for a new-shell screen that isn't built yet. Keeps the frame
 * navigable (so the whole shell can be walked) while each destination is filled
 * in increment by increment. Server component — no interactivity.
 */
export function PreviewStub({
  title,
  description,
  Icon,
}: {
  title: string;
  description: string;
  Icon: React.ElementType;
}) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface-inset text-muted">
        <Icon className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      <p className="mt-4 inline-block rounded-full bg-brand-orange-light px-3 py-1 text-xs font-bold text-brand-orange">
        Building next
      </p>
    </div>
  );
}
