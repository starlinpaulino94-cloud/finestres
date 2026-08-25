import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          ← Volver al inicio
        </Link>
        <Card className="mt-8 border-0 shadow-xl">
          <CardContent className="space-y-8 p-8 text-gray-700 dark:text-gray-300 md:p-12">
            <div>
              <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-gray-100 md:text-4xl">Condiciones de uso</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">Actualizadas el 25 de agosto de 2026</p>
            </div>
            <section>
              <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">Uso personal</h2>
              <p className="leading-relaxed">Fintra es actualmente una herramienta privada para su propietario. No es un servicio comercial, no admite terceros y no cobra suscripciones ni procesa pagos.</p>
            </section>
            <section>
              <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">Decisiones financieras</h2>
              <p className="leading-relaxed">Los cálculos, alertas y textos de IA son herramientas de organización personal, no asesoramiento financiero, fiscal o legal. Los datos introducidos y las acciones confirmadas deben revisarse antes de usarlos para tomar decisiones importantes.</p>
            </section>
            <section>
              <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">Asistente con confirmación</h2>
              <p className="leading-relaxed">El asistente puede preparar acciones sobre toda la app, pero solo se ejecutan después de mostrar un borrador y recibir una confirmación explícita. Cancelar un borrador no modifica los datos financieros.</p>
            </section>
            <section>
              <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">Disponibilidad y copias de seguridad</h2>
              <p className="leading-relaxed">La disponibilidad depende de los proveedores técnicos configurados. Para información importante deben mantenerse copias de seguridad independientes. Antes de ofrecer Fintra a otras personas, estas condiciones deberán sustituirse por unas condiciones comerciales y legales completas.</p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
