import { Code2 } from "lucide-react";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  textClassName?: string;
}

export function Logo({
  size = "md",
  showText = true,
  textClassName = "",
}: LogoProps) {
  const box =
    size === "lg"
      ? "h-14 w-14 rounded-2xl"
      : size === "sm"
        ? "h-8 w-8 rounded-lg"
        : "h-10 w-10 rounded-xl";
  const icon = size === "lg" ? 28 : size === "sm" ? 16 : 20;
  const text =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${box} flex shrink-0 items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-400 shadow-lg shadow-indigo-500/30`}
      >
        <Code2 size={icon} className="text-white" strokeWidth={2.5} />
      </div>
      {showText && (
        <span
          className={`font-semibold tracking-tight text-foreground ${text} ${textClassName}`}
        >
          GitHub Code Explorer
        </span>
      )}
    </div>
  );
}
