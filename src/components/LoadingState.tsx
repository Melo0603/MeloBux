import { memo, type ReactNode } from "react";

export const EmptyState = memo(function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
});

export const PageSkeleton = memo(function PageSkeleton() {
  return (
    <main className="content-shell" aria-label="Carregando">
      <div className="skeleton-block">
        <span className="skeleton-line skeleton-title" />
        <span className="skeleton-line" />
        <span className="skeleton-line" />
      </div>
    </main>
  );
});
