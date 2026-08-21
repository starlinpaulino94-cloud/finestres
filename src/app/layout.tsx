// src/app/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ScriptExecutor } from "@/components/ScriptExecutor";
import { DevToolsHandler } from "@/components/DevToolsHandler";
import { GlobalErrorCatcher } from "@/components/GlobalErrorCatcher";
import { TemporalLinkBanner } from "@/components/TemporalLinkBanner";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const display = Bricolage_Grotesque({
  variable: "--font-display-family",
  subsets: ["latin"],
  display: "swap",
});
const body = Manrope({
  variable: "--font-body-family",
  subsets: ["latin"],
  display: "swap",
});
const numeric = IBM_Plex_Mono({
  variable: "--font-numeric-family",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fintra · Tu copiloto financiero",
  description:
    "Controla tus finanzas personales con un asistente de IA al que le mandas notas de voz: gastos, presupuestos, metas de ahorro, alertas e informes semanales.",
};

// SUPER IMPORTANT: NOT EDIT THE FOLLOWING 2 LINES TO FORCE NEXT.JS TO RENDER DYNAMICALLY
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${numeric.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <GlobalErrorCatcher />
          <ScriptExecutor />
          <DevToolsHandler />
          {/* Development-preview only banner. Kept outside the page wrapper so it never covers content. */}
          <TemporalLinkBanner />
          <div className="min-h-screen flex flex-col">
            <main className="flex-1">{children}</main>
          </div>
          <Toaster position="top-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
