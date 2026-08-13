import { AppSidebar } from "@/components/app/app-sidebar";
import { DeploymentStatus } from "@/components/app/deployment-status";
import { TreasuryGuard } from "@/components/app/treasury-guard";
import { WalletBadge } from "@/components/app/wallet-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CovenantProvider } from "@/lib/covenant-provider";
import { TreasuryProvider } from "@/lib/treasury-provider";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <CovenantProvider>
      <TreasuryProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 bg-background/80 px-4 backdrop-blur-xl">
              <span className="ml-auto flex items-center gap-3">
                <DeploymentStatus compact />
                <WalletBadge />
                <span className="hidden text-[0.75rem] text-muted-foreground sm:inline">
                  Flare Coston2
                </span>
                <ThemeToggle />
              </span>
            </header>

            {/* Wide by design: the treasury is a dashboard, and stacking it into
              one narrow column wasted most of the screen. */}
            <div className="flex flex-1 flex-col gap-6 px-4 pt-2 pb-16 md:px-6">
              <TreasuryGuard>{children}</TreasuryGuard>
            </div>
          </SidebarInset>
        </SidebarProvider>
      </TreasuryProvider>
    </CovenantProvider>
  );
}
