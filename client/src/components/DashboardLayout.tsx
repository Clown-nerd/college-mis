import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  Activity,
  Award,
  BadgeDollarSign,
  BookOpenCheck,
  CalendarClock,
  ClipboardPenLine,
  FileCheck2,
  GraduationCap,
  ChartNoAxesCombined,
  LayoutDashboard,
  LogOut,
  PanelLeft,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { LocalAccessSelector, LocalRoleSwitcher, LocalRoleUrlBootstrap } from "./LocalAccessSelector";
import { Button } from "./ui/button";

const SIDEBAR_WIDTH_KEY = "college-mis-sidebar-width";
const DEFAULT_WIDTH = 276;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

const roleLabels: Record<string, string> = {
  admin: "Administrator",
  applicant: "Prospective student",
  registrar: "Registrar",
  faculty: "Teaching staff",
  student: "Student",
  user: "Student",
  finance: "Finance staff",
  non_teaching: "Non-teaching staff",
};

const menuItems = [
  { icon: LayoutDashboard, label: "Command centre", path: "/", roles: ["admin", "registrar", "faculty", "student", "user", "finance", "non_teaching", "applicant"] },
  { icon: ClipboardPenLine, label: "My application", path: "/apply", roles: ["applicant"] },
  { icon: UsersRound, label: "Student registry", path: "/students", roles: ["admin", "registrar"] },
  { icon: ClipboardPenLine, label: "Admissions", path: "/admissions", roles: ["admin", "registrar"] },
  { icon: ShieldCheck, label: "Application confirmations", path: "/confirmations", roles: ["admin"] },
  { icon: BookOpenCheck, label: "Academic catalogue", path: "/academics", roles: ["admin", "registrar", "faculty"] },
  { icon: CalendarClock, label: "Teaching operations", path: "/teaching", roles: ["admin", "registrar", "faculty"] },
  { icon: ChartNoAxesCombined, label: "Learning progress", path: "/learning", roles: ["admin", "registrar", "faculty", "student", "user"] },
  { icon: CalendarClock, label: "Timetable", path: "/timetable", roles: ["admin", "registrar", "faculty"] },
  { icon: GraduationCap, label: "My academic record", path: "/my-record", roles: ["student", "user"] },
  { icon: Award, label: "My progression", path: "/my-progression", roles: ["student", "user"] },
  { icon: CalendarClock, label: "My schedule", path: "/my-schedule", roles: ["student", "user"] },
  { icon: BadgeDollarSign, label: "Finance hub", path: "/finance", roles: ["admin", "finance", "student", "user"] },
  { icon: FileCheck2, label: "Requests & records", path: "/requests", roles: ["admin", "registrar", "non_teaching", "student", "user"] },
  { icon: ShieldCheck, label: "Governance", path: "/governance", roles: ["admin"] },
  { icon: UsersRound, label: "Staff provisioning", path: "/staff", roles: ["admin"] },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    const parsed = saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH;
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, MIN_WIDTH), MAX_WIDTH) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) return <><LocalRoleUrlBootstrap /><DashboardLayoutSkeleton /></>;

  if (!user) {
    return <><LocalRoleUrlBootstrap />
      <div className="min-h-screen bg-[#f5f2ea] px-6 py-12 text-[#14243c]">
        <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
          <div className="mb-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0f2740] text-[#d9c27b] shadow-[0_18px_40px_rgba(15,39,64,0.18)]">
            <GraduationCap className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#98764a]">College MIS</p>
          <h1 className="font-serif text-4xl leading-[1.05] tracking-[-0.035em]">Institutional work, thoughtfully connected.</h1>
          <p className="mt-5 max-w-sm text-[15px] leading-7 text-[#5f6875]">
            Sign in to access the secure workspace assigned to your institutional role.
          </p>
          <Button onClick={() => startLogin()} size="lg" className="mt-8 h-12 rounded-xl bg-[#0f2740] px-5 text-white hover:bg-[#193957]">
            Sign in securely
          </Button>
          <LocalAccessSelector />
        </div>
      </div>
    </>;
  }

  return <><LocalRoleUrlBootstrap />
    <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}>
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent>
    </SidebarProvider>
  </>;
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isCollapsed = state === "collapsed";
  const currentRole = user?.role ?? "student";
  const visibleItems = menuItems.filter(item => item.roles.includes(currentRole));
  const activeMenuItem = visibleItems.find(item => item.path === location);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = event.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0 bg-[#0f2740] text-[#e8edf1]" disableTransition={isResizing}>
          <SidebarHeader className="h-[88px] justify-center px-3">
            <div className="flex w-full items-center gap-3">
              <button
                onClick={toggleSidebar}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-[#d9c27b] transition-[transform,background] duration-150 hover:bg-white/14 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c27b]"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="font-serif text-[19px] leading-none tracking-[-0.025em] text-white">College MIS</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a9b8c7]">Institutional workspace</p>
                </div>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2">
            {!isCollapsed && <p className="px-3 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#7890a8]">Workspace</p>}
            <SidebarMenu className="gap-1">
              {visibleItems.map(item => {
                const isActive = item.path === location;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 rounded-xl px-3 text-[13px] text-[#c8d2db] transition-[transform,background,color] duration-150 hover:bg-white/9 hover:text-white active:scale-[0.98] ${
                        isActive ? "bg-[#d9c27b] text-[#10243b] hover:bg-[#e5d28f] hover:text-[#10243b]" : ""
                      }`}
                    >
                      <item.icon className="h-[17px] w-[17px]" aria-hidden="true" />
                      <span className="font-medium">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            <div className="mb-3 rounded-xl border border-white/8 bg-white/5 px-3 py-2.5 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-[11px] text-[#b9c5d0]"><Activity className="h-3.5 w-3.5 text-[#6fc8ba]" aria-hidden="true" /> Systems normal</div>
              <p className="mt-1 text-[10px] text-[#7890a8]">Secure institutional session</p>
            </div>
            <LocalRoleSwitcher />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c27b] group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 shrink-0 border border-white/10 bg-[#27455f]">
                    <AvatarFallback className="bg-[#27455f] text-xs font-semibold text-[#f3e5b5]">{user?.name?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium leading-none text-white">{user?.name || "Institutional user"}</p>
                    <p className="mt-1.5 truncate text-[11px] text-[#a9b8c7]">{roleLabels[currentRole]}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl">
                <DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out securely
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-[#d9c27b]/40 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => !isCollapsed && setIsResizing(true)}
        />
      </div>

      <SidebarInset className="bg-[#f5f2ea]">
        {isMobile && (
          <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[#d9d4ca] bg-[#f5f2ea]/95 px-4 backdrop-blur">
            <SidebarTrigger className="h-9 w-9 rounded-xl bg-white shadow-sm" />
            <div className="min-w-0">
              <p className="font-serif text-lg leading-none text-[#14243c]">{activeMenuItem?.label ?? "College MIS"}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#857a68]">{roleLabels[currentRole]}</p>
            </div>
          </header>
        )}
        <main className="min-h-screen flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
