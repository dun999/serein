import { cn } from "@/lib/utils";

/** Two authorities, with the approved overlap filled. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="512" height="512" rx="128" fill="#E62359" />
      <circle cx="208" cy="256" r="112" stroke="#FFFFFF" strokeWidth="24" />
      <circle
        cx="304"
        cy="256"
        r="112"
        stroke="#FFFFFF"
        strokeOpacity="0.48"
        strokeWidth="24"
      />
      <path
        d="M256 154.8A112 112 0 0 1 256 357.2A112 112 0 0 1 256 154.8Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-baseline gap-2", className)}>
      <LogoMark className="size-[1.125rem] translate-y-[0.1875rem]" />
      <span className="font-heading text-[1.25rem] leading-none tracking-tight">
        Serein
      </span>
    </span>
  );
}
