export default function MobileViewerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-surface">
      <div className="mx-auto flex min-h-full max-w-lg flex-col px-4 py-6">{children}</div>
    </div>
  );
}
