import { PaySection } from "@/components/app/sections/pay";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pay</h1>
        <p className="text-sm text-muted-foreground">Send FXRP to an address you have already approved.</p>
      </div>
      <PaySection />
    </>
  );
}
