"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const CRED_KEY = "fintra:biometric-credential";
const UNLOCK_KEY = "fintra:biometric-unlocked";

function randomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(buffer: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

export function isBiometricEnabled() {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(CRED_KEY);
}

export async function enableBiometric(userId: string, userName: string) {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    throw new Error("Este navegador o dispositivo no soporta autenticación biométrica.");
  }
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "Fintra" },
      user: {
        id: new TextEncoder().encode(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("No se ha podido registrar la biometría.");
  window.localStorage.setItem(CRED_KEY, toBase64(credential.rawId));
  window.sessionStorage.setItem(UNLOCK_KEY, "1");
  console.log("[BiometricLock] biometría activada");
}

export function disableBiometric() {
  window.localStorage.removeItem(CRED_KEY);
  window.sessionStorage.removeItem(UNLOCK_KEY);
  console.log("[BiometricLock] biometría desactivada");
}

/**
 * Bloqueo biométrico local (WebAuthn con el sensor del dispositivo:
 * Face ID, Touch ID o huella de Android/Windows Hello). Protege el acceso a
 * los datos financieros en este dispositivo además de la sesión del servidor.
 */
export function BiometricLock({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const enabled = isBiometricEnabled();
    const unlocked = window.sessionStorage.getItem(UNLOCK_KEY) === "1";
    setLocked(enabled && !unlocked);
    setChecking(false);
  }, []);

  const unlock = useCallback(async () => {
    setError("");
    const stored = window.localStorage.getItem(CRED_KEY);
    if (!stored) {
      setLocked(false);
      return;
    }
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge(),
          allowCredentials: [{ id: fromBase64(stored), type: "public-key" }],
          userVerification: "required",
          timeout: 60000,
        },
      });
      if (!assertion) throw new Error("Verificación cancelada.");
      window.sessionStorage.setItem(UNLOCK_KEY, "1");
      setLocked(false);
      toast.success("Identidad verificada");
      console.log("[BiometricLock] desbloqueado");
    } catch (err: any) {
      console.error("[BiometricLock] error al desbloquear:", err);
      setError(err?.message || "No se ha podido verificar tu identidad.");
    }
  }, []);

  if (checking) return null;

  if (locked) {
    return (
      <div className="relative min-h-screen grid-bg flex items-center justify-center px-6">
        <div className="relative z-10 w-full max-w-sm text-center rise">
          <div className="mx-auto mb-7 flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 pulse-ring">
            <Fingerprint className="h-11 w-11 text-primary" />
          </div>
          <h1 className="font-display text-3xl mb-2">Verifica tu identidad</h1>
          <p className="text-sm text-muted-foreground mb-7">
            Tus datos financieros están protegidos con la biometría de este dispositivo.
          </p>
          <Button size="lg" className="w-full rounded-full" onClick={unlock}>
            <Lock className="mr-2 h-4 w-4" /> Desbloquear con biometría
          </Button>
          {error && <p className="mt-4 text-xs text-destructive">{error}</p>}
          <button
            className="mt-6 text-xs text-muted-foreground underline underline-offset-4"
            onClick={() => {
              disableBiometric();
              setLocked(false);
              toast.info("Bloqueo biométrico desactivado en este dispositivo");
            }}
          >
            No puedo usar la biometría, desactivarla
          </button>
          <p className="mt-8 inline-flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Cifrado del dispositivo · WebAuthn
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
