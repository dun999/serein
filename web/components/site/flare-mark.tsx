import { cn } from "@/lib/utils";

/**
 * Flare's own mark, taken from their developer hub
 * (dev.flare.network/img/ui/flare-icon.light.svg) rather than redrawn — an
 * approximated logo is worse than none.
 *
 * Kept in Flare's brand colour instead of `currentColor`. It is somebody else's
 * mark and recolouring it per theme would misrepresent it; #e62359 happens to
 * sit within a hair of this site's own accent, so it reads as intentional on
 * both grounds.
 */
export function FlareMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 425.2 425.2"
      fill="#e62359"
      role="img"
      aria-label="Flare"
      className={cn("shrink-0", className)}
    >
      <path d="M299.96,168.13l-177.15-.13c-48.29,0-88.46,38.19-89.72,87.28-.03,1.31,1.04,2.39,2.36,2.4l177.15,.11v.03c48.29,0,88.46-38.19,89.72-87.28,.03-1.31-1.04-2.39-2.36-2.4Z" />
      <path d="M389.74,33.65l-266.93-.13c-48.29,0-88.46,38.19-89.72,87.28-.03,1.31,1.04,2.39,2.36,2.4l266.93,.11v.03c48.29,0,88.46-38.19,89.72-87.28,.03-1.31-1.04-2.39-2.36-2.4Z" />
      <circle cx="77.98" cy="346.79" r="44.89" transform="translate(-126.77 56.24) rotate(-22.5)" />
    </svg>
  );
}
