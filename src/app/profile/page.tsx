"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, LogOut, Mail, Moon, Shield, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { signOut, useSession } from "@/lib/auth-client";
import { AppShell, PageHeader } from "@/components/AppShell";
import { disableBiometric, enableBiometric, isBiometricEnabled } from "@/components/BiometricLock";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export default function ProfilePage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [biometric, setBiometric] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setBiometric(isBiometricEnabled());
  }, []);

  const user = session?.user;

  const handleLogout = async () => {
    await signOut();
    router.push("/");
  };

  const toggleBiometric = async (checked: boolean) => {
    if (!user) return;
    if (!checked) {
      disableBiometric();
      setBiometric(false);
      toast.info("Bloqueo biométrico desactivado");
      return;
    }
    try {
      await enableBiometric(user.id, user.name || user.email);
      setBiometric(true);
      toast.success("Bloqueo biométrico activado en este dispositivo");
    } catch (err: any) {
      console.error("[Perfil] biometría no disponible:", err);
      toast.error(err?.message || "Tu dispositivo no permite autenticación biométrica");
    }
  };

  const initials =
    user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || "F";

  return (
    <AppShell>
      <PageHeader
        eyebrow="Tu cuenta"
        title="Perfil y seguridad"
        description="Revisa tus datos, ajusta el aspecto de la app y protege el acceso desde este dispositivo."
      />

      <div className="mx-auto grid max-w-3xl gap-4">
        {/* Identidad */}
        <Card className="rise rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-display text-primary-foreground sm:h-20 sm:w-20">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-xl sm:text-2xl">{user?.name || "Usuario"}</p>
              {/* `break-all` evita que un correo largo desborde la pantalla del móvil */}
              <p className="break-all text-sm text-muted-foreground">{user?.email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-foreground">
                <Shield className="h-3 w-3" /> Cuenta activa
              </span>
            </div>
          </div>
        </Card>

        {/* Datos de la cuenta */}
        <Card className="rise rounded-3xl p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg">Datos de la cuenta</h2>
          <ul className="space-y-4 text-sm">
            <li className="flex items-start gap-3">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">Nombre</p>
                <p className="break-words text-muted-foreground">{user?.name || "—"}</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">Correo</p>
                <p className="break-all text-muted-foreground">{user?.email || "—"}</p>
              </div>
            </li>
          </ul>
        </Card>

        {/* Preferencias del dispositivo */}
        <Card className="rise rounded-3xl p-5 sm:p-6">
          <h2 className="mb-1 font-display text-lg">Este dispositivo</h2>
          <p className="mb-5 text-xs text-muted-foreground">
            Estos ajustes solo afectan al móvil u ordenador que estás usando ahora.
          </p>

          <div className="space-y-3">
            <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3">
              <span className="inline-flex items-center gap-2.5 text-sm">
                <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block font-medium">Bloqueo biométrico</span>
                  <span className="block text-xs text-muted-foreground">Huella o Face ID al entrar</span>
                </span>
              </span>
              <Switch
                checked={biometric}
                onCheckedChange={toggleBiometric}
                aria-label="Activar bloqueo biométrico"
              />
            </div>

            <div className="flex min-h-12 items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3">
              <span className="inline-flex items-center gap-2.5 text-sm">
                {mounted && theme === "dark" ? (
                  <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0">
                  <span className="block font-medium">Modo oscuro</span>
                  <span className="block text-xs text-muted-foreground">Más cómodo de noche</span>
                </span>
              </span>
              <Switch
                checked={mounted ? theme === "dark" : true}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
                aria-label="Cambiar tema"
              />
            </div>
          </div>
        </Card>

        {/* Sesión */}
        <Card className="rise rounded-3xl p-5 sm:p-6">
          <h2 className="mb-4 font-display text-lg">Sesión</h2>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="h-11 w-full rounded-xl sm:w-auto sm:px-6"
          >
            <LogOut className="mr-2 h-4 w-4" /> Cerrar sesión
          </Button>
        </Card>
      </div>
    </AppShell>
  );
}
