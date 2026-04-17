import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  icon: LucideIcon;
  heading: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({ icon: Icon, heading, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center gap-4 py-16 text-center", className)}>
      <div className="rounded-xl bg-primary-light p-4">
        <Icon className="size-8 text-primary" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{heading}</h3>
        {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
