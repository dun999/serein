import { FundsSection } from "@/components/app/sections/funds";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add funds</h1>
        <p className="text-sm text-muted-foreground">Move FXRP into the treasury, where the limits apply.</p>
      </div>
      <FundsSection />
    </>
  );
}
