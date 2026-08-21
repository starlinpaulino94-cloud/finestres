import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  ChartPie,
  PiggyBank,
  FileDown,
  Fingerprint,
  Mic,
  Sparkles,
  Target,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ASSETS } from "@/assets/files";

const FEATURES = [
  {
    icon: Mic,
    title: "Notas de voz que se convierten en datos",
    text: "Cuéntale tus gastos del día, tu presupuesto o tus metas. La IA transcribe, entiende y registra todo por ti.",
  },
  {
    icon: Target,
    title: "Planificación de salidas",
    text: "Le dices qué plan tienes y te responde con el máximo exacto que puedes gastar sin romper el mes.",
  },
  {
    icon: BellRing,
    title: "Alertas antes de pasarte",
    text: "Avisos inteligentes cuando te acercas al límite de cualquier categoría, con la cifra que te queda.",
  },
  {
    icon: PiggyBank,
    title: "Metas de ahorro organizadas",
    text: "Le cuentas para qué ahorras y calcula el aporte mensual que necesitas para llegar a tiempo.",
  },
  {
    icon: ChartPie,
    title: "Gráficas de progreso mensual",
    text: "Evolución de ingresos y gastos, reparto por categoría y ritmo diario en una sola vista.",
  },
  {
    icon: FileDown,
    title: "Informes semanales y exportación",
    text: "Un informe detallado cada semana en tu correo, y tus estados de cuenta en PDF o Excel cuando quieras.",
  },
];

const STEPS = [
  { n: "01", title: "Grabas una nota de voz", text: "«Hoy gasté 14 € en comida y 6 en metro. El sábado salgo a cenar.»" },
  { n: "02", title: "La IA lo organiza", text: "Crea los movimientos, los categoriza, ajusta tu presupuesto y planifica la salida." },
  { n: "03", title: "Recibes el plan", text: "Máximo diario, alertas de límite y un informe semanal con acciones concretas." },
];

export default function Main() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-70" />
      <div className="aurora relative">
        {/* Cabecera */}
        <header className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-display text-lg text-primary-foreground">
              F
            </span>
            <span className="font-display text-xl">Fintra</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" className="rounded-full">
              <Link href="/login">Entrar</Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/register">Crear cuenta</Link>
            </Button>
          </nav>
        </header>

        {/* Héroe */}
        <section className="relative z-10 mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 sm:pt-16">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="rise">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-[11px] uppercase tracking-[0.2em] text-primary backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> IA financiera personal
              </p>
              <h1 className="font-display text-[2.6rem] leading-[1.02] sm:text-6xl lg:text-[4.2rem]">
                Tu dinero,
                <br />
                dictado en voz
                <span className="text-primary"> alta.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Mándale una nota de voz con tus gastos del día y tu asistente hace el resto: los registra, los
                categoriza, vigila tus límites, planifica tus salidas y te envía un informe semanal para mejorar tu
                salud financiera.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-7 text-base">
                  <Link href="/register">
                    Empezar gratis <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full px-7 text-base">
                  <Link href="/login">Ya tengo cuenta</Link>
                </Button>
              </div>
              <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
                <Fingerprint className="h-3.5 w-3.5" /> Acceso con bloqueo biométrico · modo oscuro por defecto
              </p>
            </div>

            {/* Vista previa del panel */}
            <div className="rise [animation-delay:120ms]">
              <div className="relative rounded-[28px] border border-border bg-card/80 p-6 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Puedes gastar hoy</p>
                    <p className="tabular mt-1 text-4xl font-semibold text-primary">28,40 €</p>
                  </div>
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/15">
                    <Wallet className="h-6 w-6 text-primary" />
                  </div>
                </div>

                <div className="mt-6 space-y-3.5">
                  {[
                    { name: "🛒 Supermercado", pct: 62, value: "198 / 320 €" },
                    { name: "🍽️ Restaurantes y salidas", pct: 88, value: "194 / 220 €" },
                    { name: "🚇 Transporte", pct: 34, value: "31 / 90 €" },
                  ].map((row) => (
                    <div key={row.name}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span>{row.name}</span>
                        <span className="tabular text-muted-foreground">{row.value}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${row.pct}%`,
                            background: row.pct > 85 ? "var(--chart-4)" : "var(--primary)",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 p-4">
                  <p className="mb-1 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-primary">
                    <Mic className="h-3.5 w-3.5" /> Tu asistente
                  </p>
                  <p className="text-sm leading-relaxed">
                    «El sábado puedes gastar hasta <strong>45 €</strong> en la cena. Si te pasas, tu meta del viaje se
                    retrasa 3 semanas.»
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Funcionalidades */}
      <section className="relative z-10 mx-auto max-w-7xl px-5 py-16 sm:px-8">
        <p className="mb-3 text-[11px] uppercase tracking-[0.2em] text-primary">Todo en una sola app</p>
        <h2 className="font-display text-3xl sm:text-4xl">Lo que Fintra hace por ti</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <article
              key={f.title}
              className="rise rounded-3xl border border-border bg-card/60 p-6 transition-colors hover:border-primary/40"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-primary/12">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display text-lg leading-snug">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="overflow-hidden rounded-[32px] border border-border bg-card/60">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-8 sm:p-11">
              <h2 className="font-display text-3xl">Tres pasos, cero hojas de cálculo</h2>
              <ol className="mt-9 space-y-8">
                {STEPS.map((s) => (
                  <li key={s.n} className="flex gap-5">
                    <span className="tabular text-sm text-primary">{s.n}</span>
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Button asChild size="lg" className="mt-10 rounded-full px-7">
                <Link href="/register">
                  Crear mi cuenta <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="relative min-h-[280px]">
              <img
                src={ASSETS.heroDashboard.url}
                alt={ASSETS.heroDashboard.alt}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent lg:bg-gradient-to-r" />
            </div>
          </div>
        </div>
      </section>

      {/* Pie */}
      <footer className="relative z-10 mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
          <div>
            <p className="font-display text-lg">Fintra</p>
            <p className="text-xs text-muted-foreground">Tu copiloto financiero con IA.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              Entrar
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Crear cuenta
            </Link>
            <Link href="/privacy-policy" className="hover:text-foreground">
              Privacidad
            </Link>
            <Link href="/terms-of-service" className="hover:text-foreground">
              Términos
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
