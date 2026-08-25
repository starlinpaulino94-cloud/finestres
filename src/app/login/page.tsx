"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";

function LoginForm() {
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const redirect = (() => {
    if (!requestedRedirect?.startsWith("/") || requestedRedirect.startsWith("//")) return "/dashboard";
    try {
      const parsed = new URL(requestedRedirect, "https://fintra.local");
      if (parsed.origin !== "https://fintra.local") return "/dashboard";
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return "/dashboard";
    }
  })();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn.email({
        email,
        password,
      });

      // Check if login was successful
      if (result.error) {
        setError(result.error.message || "No he podido entrar. Revisa tu correo y tu contraseña.");
        setLoading(false);
        return;
      }

      // If we get here, login was successful
      // Wait a bit for cookie to be set, then do a full page reload
      setTimeout(() => {
        window.location.href = redirect;
      }, 500);
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || "No he podido entrar. Revisa tu correo y tu contraseña.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
      <Card className="w-full max-w-md rounded-3xl shadow-2xl">
        <CardHeader className="space-y-2 text-center pb-6">
          <CardTitle className="font-display text-3xl">Bienvenido de nuevo</CardTitle>
          <CardDescription className="text-base">
            Entra con tu correo y contraseña para ver tu panel
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5">
            {error && (
              <Alert variant="destructive" className="animate-in fade-in slide-in-from-top-2">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 transition-all focus:ring-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Tu contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11 transition-all focus:ring-2"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-4">
            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold transition-all hover:scale-[1.02]"
              disabled={loading}
            >
              {loading ? "Entrando…" : "Entrar"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              ¿Todavía no tienes cuenta?{" "}
              <Link href="/register" className="font-semibold text-primary hover:underline transition-colors">
                Créala aquí
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center px-4 grid-bg">
        <Card className="w-full max-w-md rounded-3xl shadow-2xl">
          <CardHeader className="space-y-2 text-center pb-6">
            <CardTitle className="font-display text-3xl">Bienvenido de nuevo</CardTitle>
            <CardDescription className="text-base">Cargando…</CardDescription>
          </CardHeader>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
