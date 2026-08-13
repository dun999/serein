"use client";

import {
  ArrowLeftRightIcon,
  CoinsIcon,
  GaugeIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/site/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { COSTON2 } from "@/lib/chain";

/**
 * Real routes, one per section.
 *
 * Treasury state lives in TreasuryProvider above the router, so moving between
 * sections is a navigation rather than a reload: the chain is not re-read on
 * every click, and an action taken on one page is visible on the next.
 */
const sections = [
  { href: "/app", label: "Overview", icon: GaugeIcon },
  { href: "/app/funds", label: "Add funds", icon: CoinsIcon },
  { href: "/app/pay", label: "Pay", icon: ArrowLeftRightIcon },
  { href: "/app/cash-out", label: "Cash out to XRP", icon: ShieldCheckIcon },
  { href: "/app/rules", label: "Rules", icon: ScrollTextIcon },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex h-8 items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* Goes home, but carries no hover background: it is the masthead,
              not a menu item, and lighting it up like one made it read as a
              fifth navigation entry. Hidden on the rail rather than truncated,
              which would leave a stray letter. */}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:hidden"
          >
            <LogoMark className="size-5 shrink-0" />
            <span className="font-heading text-base leading-none tracking-tight">Serein</span>
          </Link>
          <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:ml-0" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Treasury</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    tooltip={label}
                    isActive={pathname === href}
                    render={<Link href={href} />}
                  >
                    <Icon />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <p className="px-2 pb-1 text-[0.6875rem] leading-relaxed text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          Testnet · {COSTON2.name}
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
