import type { ReactNode } from "react";

interface Props {
  title: string;
  children: ReactNode;
}

/** A labelled block inside the store detail dialog. */
export function DetailSection({ title, children }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
}
