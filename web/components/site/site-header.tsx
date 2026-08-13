import Link from "next/link";

import { Logo } from "@/components/site/logo";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#rules", label: "Rules" },
  { href: "#evidence", label: "Evidence" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
      <div className="shell flex h-14 items-center gap-8">
        <Link href="/" className="rounded-sm">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-sm text-sm font-medium text-foreground/80 transition-colors duration-150 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggle />
          <Link
            href="/app"
            className="rounded-md bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground transition-opacity duration-150 hover:opacity-90"
          >
            Open app
          </Link>
        </div>
      </div>
    </header>
  );
}
