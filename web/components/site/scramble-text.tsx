"use client";

import { useEffect, useRef, useState } from "react";

const GLYPHS = "abcdefghijklmnopqrstuvwxyz";
/** Characters still churning ahead of the settle point. */
const WAVE = 10;
/** How often a churning character picks a new glyph. Faster reads as strobing. */
const ROLL_MS = 40;

/**
 * Settles a line out of noise, left to right, once on mount.
 *
 * Three things have to be true for this to look smooth, and each of them is a
 * mistake I made getting here.
 *
 * 1. The line must never re-wrap. Substituting spaces for characters that have
 *    not arrived changes every word boundary, so the text reflows on each frame
 *    and the whole headline jitters. Each word is therefore its own inline-block
 *    whose width is pinned by an invisible copy of the real word, and the
 *    animated glyphs are painted over that fixed box. Nothing can move.
 *
 * 2. Glyphs must churn on their own clock, not once per animation frame.
 *    Re-rolling at the display's refresh rate reads as static rather than as
 *    text arriving.
 *
 * 3. Only a short window ahead of the settle point should churn. Scrambling the
 *    entire remaining line means nothing appears to be resolving.
 *
 * The real sentence is always in the DOM for assistive tech, and reduced motion
 * skips the effect entirely.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  const [shown, setShown] = useState<string[] | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const chars = [...text];
    const duration = Math.min(1600, 320 + chars.length * 14);
    const start = performance.now();
    let lastRoll = 0;
    let rolled = chars.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out so the line lands gently rather than stopping dead.
      const settled = (1 - (1 - t) ** 3) * chars.length;

      if (now - lastRoll >= ROLL_MS) {
        lastRoll = now;
        rolled = rolled.map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]);
      }

      // Rebuild per word so the renderer can keep each word's box fixed.
      const next: string[] = [];
      let index = 0;
      for (const word of words) {
        let out = "";
        for (const char of word) {
          if (index < settled) out += char;
          else if (index < settled + WAVE) out += rolled[index];
          // Past the wave the word has not arrived: blank, but its box is held
          // open by the invisible copy so nothing shifts.
          else out += " ";
          index += 1;
        }
        next.push(out);
        index += 1; // the space that followed this word
      }

      setShown(next);
      if (t < 1) frame.current = requestAnimationFrame(tick);
      else setShown(null);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // The sentence is static for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {words.map((word, i) => (
          <span key={`${word}-${i}`}>
            {shown ? (
              <span className="relative inline-block align-baseline">
                {/* Pins the box to the real word's width. */}
                <span className="invisible">{word}</span>
                <span className="absolute inset-0 whitespace-pre">{shown[i]}</span>
              </span>
            ) : (
              // Not animating: the plain word. Rendering only the pinned box
              // here would leave the headline invisible before JS runs.
              word
            )}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </span>
  );
}
