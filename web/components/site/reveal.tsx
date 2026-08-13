"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** useLayoutEffect warns during SSR; there is nothing to measure on the server. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Lifts a section into place the first time it is scrolled to.
 *
 * Progressive enhancement, deliberately. The server renders the content plainly
 * visible, and it is only hidden once JavaScript has mounted and taken
 * responsibility for showing it again. Starting hidden is the obvious way to
 * write this and it is wrong: if the bundle is slow, blocked, or disabled, the
 * page keeps permanent holes where its sections should be.
 *
 * Hiding runs in a layout effect so it lands before paint and no flash of the
 * final state escapes.
 *
 * The movement is small on purpose — 10px, 500ms. Anything larger reads as a
 * slideshow rather than a page, and the point is only to stop long sections
 * landing dead.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"static" | "hidden" | "shown">("static");

  useIsomorphicLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("hidden");
  }, []);

  useEffect(() => {
    if (phase !== "hidden") return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setPhase("shown");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [phase]);

  return (
    <div
      ref={ref}
      style={phase === "shown" ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        phase !== "static" &&
          "transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none",
        phase === "hidden" ? "translate-y-2.5 opacity-0" : "translate-y-0 opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}
