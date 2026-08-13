import { RulesSection } from "@/components/app/sections/rules";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Rules</h1>
        <p className="text-sm text-muted-foreground">Encrypted limits, recipients, and passkey step-up.</p>
      </div>
      <RulesSection />
    </>
  );
}
