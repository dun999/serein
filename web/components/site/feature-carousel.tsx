"use client";

import { useCallback, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { FlareMark } from "@/components/site/flare-mark";
import { cn } from "@/lib/utils";

/**
 * What the product actually runs on.
 *
 * Only integrations that exist in this repository are listed. Every entry here
 * maps to a private-vault or SDK path — putting a
 * protocol on the page because it would look good is the kind of claim the
 * Evidence section exists to make impossible.
 */
const FEATURES = [
  {
    name: "FAssets / FXRP",
    desc: "XRP enters as FXRP through FAssets and can direct-mint straight to an isolated vault. Redemption settles only to its committed XRPL address.",
    Art: FxrpArt,
    flare: true,
  },
  {
    name: "Flare Data Connector",
    desc: "FAssets uses FDC payment proofs to verify the underlying XRP deposit. The vault SDK produces the exact 32-byte direct-mint destination memo.",
    Art: ProofArt,
    flare: true,
  },
  {
    name: "FTSOv2",
    desc: "Every authorization is valued from the live XRP/USD feed. The vault re-prices on-chain and rejects an FCC result from a different price epoch.",
    Art: FeedArt,
    flare: true,
  },
  {
    name: "Confidential Compute",
    desc: "FCC decrypts recipients, dollar limits, and passkey data inside a registered TEE. It signs only the exact action that satisfies the private policy.",
    Art: EnclaveArt,
    flare: true,
  },
];

type ArtProps = { className?: string };

/**
 * One frame for every icon, so they read as a set rather than seven drawings.
 *
 * A 24-unit grid, drawn from at most four shapes each, so every icon says one
 * thing and reads at a glance. The stroke is set for the size they actually
 * render at — 1.25 on this grid lands at about 5px on screen, heavy enough to
 * hold its own against the headline and light enough not to look like clipart.
 */
function Frame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("size-full", className)}
    >
      {children}
    </svg>
  );
}

/** FXRP: a coin worth exactly one XRP. The equals is the whole claim. */
function FxrpArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 10.5h7M8.5 14h7" />
    </Frame>
  );
}

/** Confidential Compute: a closed enclosure with a key inside it. */
function EnclaveArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <rect x="3.5" y="8.5" width="17" height="12" rx="2.5" />
      <path d="M7.5 8.5V6a4.5 4.5 0 019 0v2.5" />
      <circle cx="12" cy="14" r="1.6" />
      <path d="M12 15.6v2.2" />
    </Frame>
  );
}

/** FDC: a cross-chain message receiving a cryptographic check. */
function ProofArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M3 7.5h12M3 11.5h8" />
      <path d="M13 16l2.5 2.5L21 13" />
      <path d="M6 16H3V4h15v5" />
    </Frame>
  );
}

/** FTSOv2: a price, moving. The feed the caps are measured against.
 *
 * The head is a square bracket, so it is symmetric about 45 degrees: the
 * closing segment has to run at exactly 45 degrees or the head reads as
 * rotated against its own shaft. The glyph is also centred on the 24-unit
 * box so it sits level with the other three. */
function FeedArt(props: ArtProps) {
  return (
    <Frame {...props}>
      <path d="M3.5 14L8.5 10L12 13L20 5" />
      <path d="M20 5h-4.5M20 5v4.5" />
      <path d="M3 19h18" opacity={0.4} />
    </Frame>
  );
}

export function FeatureCarousel() {
  const [index, setIndex] = useState(0);
  const count = FEATURES.length;

  const go = useCallback(
    (delta: number) => setIndex((current) => (current + delta + count) % count),
    [count],
  );

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex w-full items-center gap-4 sm:gap-10">
        <Arrow direction="left" onClick={() => go(-1)} />

        {/* Fixed height so stepping through does not jolt the page. */}
        <div className="relative min-h-[19rem] flex-1 sm:min-h-[17rem]">
          {FEATURES.map((feature, i) => {
            const Art = feature.Art;
            return (
              <div
                key={feature.name}
                aria-hidden={i !== index}
                className={cn(
                  "absolute inset-0 flex flex-col items-center gap-5 text-center transition-opacity duration-300",
                  i === index ? "opacity-100" : "pointer-events-none opacity-0",
                )}
              >
                <div className="flex items-center gap-2.5">
                  {feature.flare ? <FlareMark className="h-[1.125rem] w-[1.125rem]" /> : null}
                  <h3 className="text-[1.375rem] font-semibold tracking-tight">{feature.name}</h3>
                </div>
                <Art className="h-24 w-24 text-accent" />
                <p className="max-w-[46ch] text-[0.9375rem] text-muted-foreground">
                  {feature.desc}
                </p>
              </div>
            );
          })}
        </div>

        <Arrow direction="right" onClick={() => go(1)} />
      </div>

      <div className="flex items-center gap-2">
        {FEATURES.map((feature, i) => (
          <button
            key={feature.name}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={feature.name}
            aria-current={i === index}
            className={cn(
              "h-1 rounded-full transition-all duration-200",
              i === index ? "w-6 bg-accent" : "w-1.5 bg-foreground/25 hover:bg-foreground/45",
            )}
          />
        ))}
      </div>
    </div>
  );
}

/** Frameless by request: the glyph alone, nothing around it. */
function Arrow({ direction, onClick }: { direction: "left" | "right"; onClick: () => void }) {
  const Icon = direction === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "left" ? "Previous feature" : "Next feature"}
      className="shrink-0 rounded-sm p-4 text-muted-foreground transition-colors duration-150 hover:text-foreground"
    >
      <Icon className="size-7" strokeWidth={1.5} />
    </button>
  );
}
