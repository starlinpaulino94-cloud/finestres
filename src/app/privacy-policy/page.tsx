import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

const sections = [
  {
    title: "1. Alcance actual",
    body: "Fintra es, por ahora, una aplicación privada de uso personal. No ofrece suscripciones, pagos, publicidad ni analítica comercial, y no está abierta a otros usuarios.",
  },
  {
    title: "2. Datos tratados",
    body: "La app guarda los datos de acceso necesarios para autenticarte; cuentas, saldos, movimientos, presupuestos, metas, salidas y alertas; y, cuando usas el asistente, el texto escrito, la grabación opcional, su transcripción, el borrador propuesto y el resultado de las acciones que confirmes.",
  },
  {
    title: "3. Uso de inteligencia artificial",
    body: "Tus peticiones y el contexto financiero estrictamente necesario se envían a la integración de IA de Totalum para interpretarlas. La IA solo produce un borrador validado: no modifica datos financieros hasta que confirmas expresamente la lista de acciones en Fintra.",
  },
  {
    title: "4. Proveedores técnicos",
    body: "Totalum proporciona almacenamiento, archivos y las integraciones de transcripción e IA. La aplicación puede ejecutarse sobre Cloudflare mediante OpenNext. Estos proveedores procesan la información técnica necesaria para prestar sus servicios conforme a sus propias condiciones y políticas.",
  },
  {
    title: "5. Seguridad y registros",
    body: "La app usa sesiones autenticadas, validación en el servidor, comprobación de propiedad de registros, límites de entrada y políticas restrictivas de origen. Los registros de producción evitan deliberadamente transcripciones, conceptos, importes y otros contenidos financieros. Ningún sistema conectado a Internet puede garantizar riesgo cero.",
  },
  {
    title: "6. Conservación y control",
    body: "Los datos se conservan mientras mantengas la aplicación y sus servicios asociados. Puedes corregir o eliminar los registros desde la propia app. Las notas canceladas conservan el borrador y la transcripción como historial, pero no aplican sus acciones financieras.",
  },
  {
    title: "7. Cambios futuros",
    body: "Antes de abrir Fintra a terceros, añadir pagos, telemetría, integraciones bancarias o nuevos proveedores, esta política deberá revisarse y completarse con la identidad y contacto del responsable, la base jurídica, los plazos de conservación y los mecanismos aplicables para ejercer derechos.",
  },
];

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
      <div className="container mx-auto max-w-4xl px-4 py-16">
        <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
          ← Volver al inicio
        </Link>
        <Card className="mt-8 border-0 shadow-xl">
          <CardContent className="p-8 md:p-12">
            <h1 className="mb-3 text-3xl font-bold md:text-4xl">Política de privacidad</h1>
            <p className="mb-8 text-sm text-gray-600 dark:text-gray-400">Actualizada el 25 de agosto de 2026</p>
            <p className="mb-8 leading-relaxed text-gray-700 dark:text-gray-300">
              Este texto describe el funcionamiento técnico real de la versión personal actual de Fintra. Debe revisarse legalmente antes de convertir la aplicación en un servicio para terceros.
            </p>
            <div className="space-y-8 text-gray-700 dark:text-gray-300">
              {sections.map((section) => (
                <section key={section.title}>
                  <h2 className="mb-3 text-2xl font-semibold text-gray-900 dark:text-gray-100">{section.title}</h2>
                  <p className="leading-relaxed">{section.body}</p>
                </section>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
