"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Mic, Pencil, Plus, Wallet } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import type { BankAccount, Transaction } from "@/types/finance";
import { toast } from "sonner";

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const TYPE_LABEL: Record<string, string> = {
  cuenta: "Cuenta corriente",
  tarjeta_credito: "Tarjeta de crédito",
  tarjeta_debito: "Tarjeta de débito",
  efectivo: "Efectivo",
};

export default function CuentasPage() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [form, setForm] = useState({
    name: "",
    bank_name: "",
    account_type: "cuenta",
    last_four: "",
    balance: "",
  });

  const load = useCallback(async () => {
    const [accs, tx] = await Promise.all([
      api.get<BankAccount[]>("/api/accounts"),
      api.get<Transaction[]>("/api/transactions"),
    ]);
    if (accs.ok && accs.data) setAccounts(accs.data);
    else console.error("[Cuentas] error cuentas:", accs.error);
    if (tx.ok && tx.data) setRecent(tx.data.filter((t) => !!t.bank_account).slice(0, 10));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await load();
    })();
  }, [load]);

  const create = async () => {
    if (!form.name.trim()) {
      toast.error("Ponle un nombre a la cuenta");
      return;
    }
    setSaving(true);
    const res = await api.post("/api/accounts", {
      name: form.name.trim(),
      bank_name: form.bank_name.trim() || undefined,
      account_type: form.account_type,
      last_four: form.last_four.trim() || undefined,
      balance: form.balance ? Number(form.balance.replace(",", ".")) : 0,
    });
    setSaving(false);
    if (!res.ok) {
      console.error("[Cuentas] error creando cuenta:", res.error);
      toast.error("No he podido añadir la cuenta");
      return;
    }
    toast.success("Cuenta añadida");
    setOpen(false);
    setForm({ name: "", bank_name: "", account_type: "cuenta", last_four: "", balance: "" });
    await load();
  };

  const saveBalance = async (account: BankAccount) => {
    const value = Number(editValue.replace(",", "."));
    if (Number.isNaN(value)) {
      toast.error("Escribe un saldo válido");
      return;
    }
    const res = await api.put(`/api/accounts/${account._id}`, { balance: value });
    if (!res.ok) {
      console.error("[Cuentas] error actualizando saldo:", res.error);
      toast.error("No he podido guardar el saldo");
      return;
    }
    toast.success(`Saldo de ${account.name} actualizado`);
    setEditing(null);
    window.dispatchEvent(new Event("fintra:refresh"));
    await load();
  };

  const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);

  return (
    <AppShell>
      <PageHeader
        eyebrow="cuentas y tarjetas"
        title="Tus cuentas y tarjetas"
        description="Agrupa tus movimientos por cuenta y mantén su saldo al día. Los gastos entran por nota de voz o a mano, en segundos."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="h-11 w-full rounded-full sm:w-auto sm:px-6">
                <Plus className="mr-2 h-4 w-4" /> Añadir cuenta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nueva cuenta o tarjeta</DialogTitle>
                <DialogDescription>Añade una cuenta para agrupar tus movimientos.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="acc-name">Nombre</Label>
                  <Input
                    id="acc-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Cuenta nómina"
                    className="mt-1.5 rounded-xl"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="acc-bank">Banco</Label>
                    <Input
                      id="acc-bank"
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                      placeholder="BBVA"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label htmlFor="acc-last">Últimos 4 dígitos</Label>
                    <Input
                      id="acc-last"
                      value={form.last_four}
                      onChange={(e) => setForm({ ...form, last_four: e.target.value })}
                      placeholder="4821"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={form.account_type}
                      onValueChange={(v) => setForm({ ...form, account_type: v })}
                    >
                      <SelectTrigger className="mt-1.5 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cuenta">Cuenta corriente</SelectItem>
                        <SelectItem value="tarjeta_credito">Tarjeta de crédito</SelectItem>
                        <SelectItem value="tarjeta_debito">Tarjeta de débito</SelectItem>
                        <SelectItem value="efectivo">Efectivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="acc-balance">Saldo (€)</Label>
                    <Input
                      id="acc-balance"
                      inputMode="decimal"
                      value={form.balance}
                      onChange={(e) => setForm({ ...form, balance: e.target.value })}
                      placeholder="1200"
                      className="mt-1.5 rounded-xl"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button className="rounded-full" onClick={create} disabled={saving}>
                  {saving ? "Guardando…" : "Añadir cuenta"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="rise rounded-3xl border-primary/30 bg-primary/[0.06] p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Patrimonio disponible</p>
            <p className="tabular mt-2 text-4xl font-semibold">{money(total)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Suma del saldo de tus {accounts.length} cuentas y tarjetas
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a, i) => (
              <Card
                key={a._id}
                className="rise relative overflow-hidden rounded-3xl p-6"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.bank_name} · {TYPE_LABEL[a.account_type || "cuenta"]}
                    </p>
                  </div>
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-secondary">
                    {a.account_type === "efectivo" ? (
                      <Wallet className="h-4 w-4" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                  </span>
                </div>

                {editing === a._id ? (
                  <div className="mt-6 flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="tabular h-10 rounded-xl"
                      aria-label={`Saldo de ${a.name}`}
                    />
                    <Button size="sm" className="rounded-full" onClick={() => saveBalance(a)}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <p
                    className={`tabular mt-6 text-3xl font-semibold ${(a.balance || 0) < 0 ? "text-destructive" : ""}`}
                  >
                    {money(a.balance || 0)}
                  </p>
                )}

                <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{a.last_four ? `•••• ${a.last_four}` : "—"}</span>
                  {editing !== a._id && (
                    <button
                      type="button"
                      className="-my-1.5 inline-flex min-h-8 items-center gap-1.5 rounded-full px-2 py-1.5 text-primary transition-colors hover:bg-primary/10 active:bg-primary/15"
                      onClick={() => {
                        setEditing(a._id);
                        setEditValue(String(a.balance ?? 0).replace(".", ","));
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Actualizar saldo
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card className="rise rounded-3xl p-6">
              <h2 className="font-display text-xl">Últimos movimientos por cuenta</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                Todo lo que has asignado a una cuenta o tarjeta, con su categoría
              </p>
              <ul className="divide-y divide-border">
                {recent.map((t) => {
                  const cat = typeof t.category === "object" && t.category ? (t.category as any) : null;
                  const acc = typeof t.bank_account === "object" && t.bank_account ? (t.bank_account as any) : null;
                  return (
                    <li key={t._id} className="flex items-center gap-3 py-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-sm">
                        {cat?.emoji || "💳"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{t.concept}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(t.spent_at).toLocaleDateString("es-ES")}
                          {acc ? ` · ${acc.name}` : ""}
                          {cat ? ` · ${cat.name}` : " · sin categoría"}
                        </p>
                      </div>
                      <span className="tabular text-sm font-medium">
                        {t.kind === "ingreso" ? "+" : "−"}
                        {money(t.amount)}
                      </span>
                    </li>
                  );
                })}
                {recent.length === 0 && (
                  <li className="py-4 text-sm text-muted-foreground">
                    Aún no has asignado movimientos a ninguna cuenta.
                  </li>
                )}
              </ul>
            </Card>

            <Card className="rise rounded-3xl p-6">
              <h3 className="mb-3 flex items-center gap-2 font-display text-lg">
                <Mic className="h-4 w-4 text-primary" /> Registrar un gasto es inmediato
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Cuéntale a tu asistente lo que has gastado y él lo registra, lo categoriza, revisa tus límites y
                actualiza tus presupuestos. Si prefieres teclear, lo añades a mano en un par de toques.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild className="rounded-full">
                  <Link href="/asistente">
                    <Mic className="mr-2 h-4 w-4" /> Nota de voz
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href="/movimientos">Añadir a mano</Link>
                </Button>
              </div>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                El saldo de cada cuenta lo controlas tú: pulsa «Actualizar saldo» cuando quieras cuadrarlo con tu
                banco.
              </p>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
