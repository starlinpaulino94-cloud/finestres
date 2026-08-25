"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Bell,
  ChartPie,
  CreditCard,
  Fingerprint,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Mic,
  Moon,
  Sun,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { signOut, useSession } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { BiometricLock, disableBiometric, enableBiometric, isBiometricEnabled } from "@/components/BiometricLock";
import type { AppNotification } from "@/types/finance";
import { toast } from "sonner";

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/asistente", label: "Asistente", icon: Mic },
  { href: "/movimientos", label: "Movimientos", icon: ListOrdered },
  { href: "/planificacion", label: "Planificación", icon: Target },
  { href: "/cuentas", label: "Cuentas", icon: CreditCard },
  { href: "/reportes", label: "Informes", icon: ChartPie },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [biometric, setBiometric] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBiometric(isBiometricEnabled());
  }, []);

  useEffect(() => {
    if (!isPending && !session) router.replace(`/login?redirect=${pathname}`);
  }, [isPending, session, router, pathname]);

  const loadNotifications = useCallback(async () => {
    const res = await api.get<AppNotification[]>("/api/notifications");
    if (res.ok && res.data) setNotifications(res.data);
    else if (!res.ok) console.error("[AppShell] error cargando alertas:", res.error);
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      await ensureBootstrap();
      if (active) await loadNotifications();
    })();
    const onRefresh = () => loadNotifications();
    window.addEventListener("fintra:refresh", onRefresh);
    return () => {
      active = false;
      window.removeEventListener("fintra:refresh", onRefresh);
    };
  }, [session, loadNotifications]);

  const unread = notifications.filter((n) => n.is_read !== "yes");

  const markAllRead = async () => {
    const res = await api.post<{ updated: number }>("/api/notifications/read", {});
    if (!res.ok) {
      toast.error("No he podido marcar las alertas como leídas");
      console.error("[AppShell] markAllRead error:", res.error);
      return;
    }
    await loadNotifications();
  };

  const toggleBiometric = async (checked: boolean) => {
    if (!session) return;
    if (!checked) {
      disableBiometric();
      setBiometric(false);
      toast.info("Bloqueo biométrico desactivado");
      return;
    }
    try {
      await enableBiometric(session.user.id, session.user.name || session.user.email);
      setBiometric(true);
      toast.success("Bloqueo biométrico activado en este dispositivo");
    } catch (err: any) {
      console.error("[AppShell] biometría no disponible:", err);
      toast.error(err?.message || "Tu dispositivo no permite autenticación biométrica");
    }
  };

  if (isPending || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const initials = (session.user.name || session.user.email || "F").slice(0, 1).toUpperCase();

  return (
    <BiometricLock>
      <div className="min-h-screen lg:flex">
        {/* Barra lateral */}
        <aside className="hidden lg:flex w-[248px] shrink-0 flex-col border-r border-border bg-sidebar px-5 py-7">
          <Link href="/dashboard" className="flex items-center gap-2.5 mb-9">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-display text-lg">
              F
            </span>
            <span className="font-display text-xl">Fintra</span>
          </Link>

          <nav className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto space-y-3 rounded-2xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Fingerprint className="h-3.5 w-3.5" /> Biometría
              </span>
              <Switch checked={biometric} onCheckedChange={toggleBiometric} aria-label="Activar bloqueo biométrico" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                {mounted && theme === "dark" ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                Modo oscuro
              </span>
              <Switch
                checked={mounted ? theme === "dark" : true}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                aria-label="Cambiar tema"
              />
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* Cabecera */}
          <header className="safe-top sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur-xl sm:px-7">
            <Link href="/dashboard" className="lg:hidden flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground font-display">
                F
              </span>
            </Link>
            <div className="hidden sm:block">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {NAV.find((n) => n.href === pathname)?.label || "Fintra"}
              </p>
              <p className="text-sm font-medium">Hola, {session.user.name || session.user.email}</p>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                aria-label="Cambiar tema"
              >
                {mounted && theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative" aria-label="Alertas">
                    <Bell className="h-4 w-4" />
                    {unread.length > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                        {unread.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <p className="text-sm font-medium">Alertas inteligentes</p>
                    {unread.length > 0 && (
                      <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
                        Marcar leídas
                      </button>
                    )}
                  </div>
                  <ScrollArea className="max-h-[min(340px,60dvh)]">
                    {notifications.length === 0 && (
                      <p className="px-4 py-6 text-sm text-muted-foreground">Sin alertas por ahora.</p>
                    )}
                    <ul className="divide-y divide-border">
                      {notifications.map((n) => (
                        <li key={n._id} className={`px-4 py-3 ${n.is_read !== "yes" ? "bg-accent/40" : ""}`}>
                          <div className="flex items-start gap-2">
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                              style={{
                                background:
                                  n.severity === "critica"
                                    ? "var(--destructive)"
                                    : n.severity === "aviso"
                                      ? "var(--chart-4)"
                                      : "var(--chart-2)",
                              }}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-snug">{n.title}</p>
                              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{n.message}</p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold"
                    aria-label="Mi cuenta"
                  >
                    {initials}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} className="w-[min(16rem,calc(100vw-1.5rem))]">
                  <p className="text-sm font-medium">{session.user.name}</p>
                  <p className="mb-4 text-xs text-muted-foreground">{session.user.email}</p>
                  <div className="mb-3 flex items-center justify-between rounded-xl border border-border px-3 py-2">
                    <span className="inline-flex items-center gap-2 text-xs">
                      <Fingerprint className="h-3.5 w-3.5" /> Biometría
                    </span>
                    <Switch checked={biometric} onCheckedChange={toggleBiometric} />
                  </div>
                  <Button asChild variant="ghost" className="mb-2 h-11 w-full justify-start rounded-xl px-3">
                    <Link href="/profile">
                      <UserRound className="mr-2 h-4 w-4" /> Perfil y seguridad
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl"
                    onClick={async () => {
                      await signOut();
                      window.location.href = "/";
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </header>

          <div className="pb-mobile-nav flex-1 px-4 pt-6 sm:px-7">{children}</div>
        </div>

        {/* Navegación móvil */}
        <nav className="safe-bottom fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-between gap-0.5 border-t border-border bg-background/95 px-1 pt-1.5 backdrop-blur-xl lg:hidden">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 text-[10px] leading-none transition-colors active:bg-accent/60 ${
                  active ? "text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${active ? "" : "opacity-80"}`} />
                <span className="w-full truncate text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </BiometricLock>
  );
}

/** Cabecera reutilizable de página */
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between rise">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl leading-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { X };
