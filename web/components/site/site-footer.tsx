import Link from "next/link";

import { Logo } from "@/components/site/logo";
import { COSTON2, DOCS_URL, SDK_URL, VAULT_FACTORY_ADDRESS, explorerAddress } from "@/lib/chain";

export function SiteFooter() {
  return (
    <footer className="panel-paper mt-auto">
      {/* Room to breathe, not a second hero. */}
      <div className="shell flex flex-col gap-10 py-20 md:flex-row md:items-center md:justify-between md:py-24">
        <div className="flex max-w-sm flex-col gap-4">
          <Logo />
          <p className="text-[0.9375rem] text-muted-foreground text-pretty">
            Confidential spending controls for FXRP, enforced by Flare and a passkey.
          </p>
        </div>

        <div className="flex flex-col gap-4 text-sm md:items-end">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <FooterLink href={DOCS_URL} external>
              Docs
            </FooterLink>
            <FooterLink href={SDK_URL} external>
              Covenant SDK
            </FooterLink>
            <FooterLink href="/app">Open app</FooterLink>
            {VAULT_FACTORY_ADDRESS !== "0x0000000000000000000000000000000000000000" ? (
              <FooterLink href={explorerAddress(VAULT_FACTORY_ADDRESS)} external>
                Factory
              </FooterLink>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Testnet · {COSTON2.name}
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className =
    "rounded-sm text-foreground transition-colors duration-150 hover:text-accent";

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
