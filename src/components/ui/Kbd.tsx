import { cn } from "@/lib/utils";

type Props = {
  keys: string;
  className?: string;
};

export function Kbd({ keys, className }: Props) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center gap-0.5 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70",
        className,
      )}
    >
      {keys}
    </kbd>
  );
}
