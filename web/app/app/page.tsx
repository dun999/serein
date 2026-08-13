import { OverviewSection } from "@/components/app/sections/overview";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          FXRP on Flare, governed by a policy only your browser and FCC can read.
        </p>
      </div>
      <OverviewSection />
    </>
  );
}
