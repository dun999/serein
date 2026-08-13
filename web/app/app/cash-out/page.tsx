import { CashOutSection } from "@/components/app/sections/cash-out";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Cash out to XRP</h1>
        <p className="text-sm text-muted-foreground">Turn FXRP back into real XRP on the XRP Ledger.</p>
      </div>
      <CashOutSection />
    </>
  );
}
