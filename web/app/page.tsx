import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { FeatureCarousel } from "@/components/site/feature-carousel";
import { DeploymentStatus } from "@/components/app/deployment-status";
import { Reveal } from "@/components/site/reveal";
import { ScrambleText } from "@/components/site/scramble-text";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Button } from "@/components/ui/button";
import {
  FCC_TEE_ADDRESS,
  FXRP_ADDRESS,
  INSTRUCTION_SENDER_ADDRESS,
  PRIVATE_VAULT_CONFIGURED,
  VAULT_FACTORY_ADDRESS,
  explorerAddress,
  shorten,
} from "@/lib/chain";

export default function Home() {
  return (
    <>
      <div className="band">
        <SiteHeader />

        <section className="shell flex min-h-[78vh] flex-col justify-center gap-12 pt-24 pb-28 md:min-h-[86vh] md:gap-16 md:pt-32 md:pb-40">
          <div className="flex max-w-3xl flex-col gap-6">
            <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight text-balance md:text-6xl">
              <ScrambleText text="Private rules for programmable XRP." />
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground text-pretty">
              Serein is an isolated FXRP vault whose limits and approved recipients stay
              encrypted. Your wallet proposes a payment; Flare Confidential Compute verifies
              the private policy and a passkey before the vault can execute it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button nativeButton={false} render={<Link href="/app" />}>
              Open a treasury
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            {PRIVATE_VAULT_CONFIGURED ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <a href={explorerAddress(VAULT_FACTORY_ADDRESS)} target="_blank" rel="noreferrer" />
                }
              >
                Read the contracts
              </Button>
            ) : (
              <Button variant="outline" nativeButton={false} render={<a href="#flare" />}>
                See the architecture
              </Button>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-8 gap-y-8 pt-4 md:grid-cols-4">
            <Figure label="Asset" value="FXRP" hint="FAssets, 1:1 with XRP" />
            <Figure label="Priced by" value="FTSOv2" hint="XRP/USD, on-chain" />
            <Figure label="Private policy" value="FCC" hint="encrypted in hardware" />
            <Figure label="Network" value="Coston2" hint="Flare testnet" />
          </dl>
        </section>
      </div>

      <main className="flex flex-col">
        <section id="how" className="shell flex flex-col gap-12 py-20 md:py-28">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              A wallet signature is a proposal, not permission.
            </h2>
            <p className="text-muted-foreground text-pretty">
              An EVM approval can give an application authority over every token in a wallet.
              Serein moves the protected balance into a vault that has no generic approval
              path and requires two independent authorities for every exit.
              <br />
              <br />
              The wallet still submits the transaction, but a registered FCC machine also
              has to approve the exact operation, destination, amount, live FTSO price epoch,
              nonce, policy version, and deadline. Large actions additionally require the
              passkey enrolled in the encrypted policy.
            </p>
          </div>

          <Reveal>
            <ol className="grid gap-x-10 gap-y-8 md:grid-cols-2">
              <Step
                n="01"
                title="Open an isolated vault"
                body="Each owner gets a dedicated contract. FXRP can be deposited or direct-minted from XRP straight to that address."
              />
              <Step
                n="02"
                title="Encrypt the policy"
                body="Recipients, dollar caps, and the passkey credential are encrypted to FCC. Only a commitment and ciphertext reach the public chain."
              />
              <Step
                n="03"
                title="Request, verify, execute"
                body="An on-chain instruction routes to FCC. The enclave independently reads Flare state, verifies the policy, and returns one-use authorization."
              />
              <Step
                n="04"
                title="Recover without bypassing policy"
                body="A guardian can lock the vault. Delayed emergency recovery redeems the full balance only to the precommitted XRPL address."
              />
            </ol>
          </Reveal>
        </section>

        <section id="flare" className="shell flex flex-col gap-10 py-20 md:py-28">
          <div className="flex max-w-2xl flex-col gap-3">
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
              What we use from Flare.
            </h2>
            <p className="text-muted-foreground text-pretty">
              Two bounty tracks, one coherent transaction path: FAssets plus FDC move XRP
              across chains; FTSOv2 and FCC govern what may leave the vault.
            </p>
          </div>
          <FeatureCarousel />
        </section>

        <section id="evidence" className="shell py-20 md:py-28">
          <div className="flex flex-col gap-8 rounded-2xl bg-accent/[0.04] p-8 md:p-12">
            <div className="flex max-w-2xl flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                  Evidence, not integration badges.
                </h2>
                <DeploymentStatus />
              </div>
              <p className="text-muted-foreground text-pretty">
                Every authorization starts in an on-chain FCC instruction, and every vault
                verifies the registered TEE signature plus the current FTSOv2 price.
              </p>
            </div>

            <dl className="flex flex-col gap-1">
              <Record label="Vault factory" value={VAULT_FACTORY_ADDRESS} />
              <Record label="FCC instruction sender" value={INSTRUCTION_SENDER_ADDRESS} />
              <Record label="FCC machine" value={FCC_TEE_ADDRESS} />
              <Record label="FXRP" value={FXRP_ADDRESS} />
            </dl>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-xl font-semibold tracking-tight">{value}</dd>
      <dd className="text-xs text-muted-foreground">{hint}</dd>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-5">
      <span className="mt-1 font-mono text-xs text-accent tabular-nums">{n}</span>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-medium">{title}</h3>
        <p className="text-sm text-muted-foreground text-pretty">{body}</p>
      </div>
    </li>
  );
}

function Record({ label, value }: { label: string; value: string }) {
  const pending = value === "0x0000000000000000000000000000000000000000";
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>
        {pending ? (
          <span className="text-xs text-muted-foreground">Not published</span>
        ) : (
          <a
            className="font-mono text-xs underline underline-offset-2 hover:text-accent"
            href={explorerAddress(value)}
            target="_blank"
            rel="noreferrer"
          >
            {shorten(value, 10, 8)}
          </a>
        )}
      </dd>
    </div>
  );
}
