import { cn } from "@/lib/utils";

type Props = {
  value: number | string;
  className?: string;
};

export function PlayNumberBadge({ value, className }: Props) {
  const raw = String(value);
  const text = raw.length < 2 ? raw.padStart(2, "0") : raw;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] min-w-[28px] items-center justify-center rounded-[4px] bg-primary px-1.5 font-mono text-[12px] font-bold leading-none tracking-wider tabular-nums text-white shadow-sm",
        className,
      )}
    >
      {text}
    </span>
  );
}
