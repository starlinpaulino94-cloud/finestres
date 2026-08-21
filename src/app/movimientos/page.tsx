"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { ensureBootstrap } from "@/lib/ensure-bootstrap";
import { TX_KINDS, computeTotals, kindMeta } from "@/lib/finance-core";
import type { BankAccount, Category, Transaction } from "@/types/finance";
import { toast } from "sonner";

function money(v: number) {
  return `${(v || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  voz: "Nota de voz",
};

export default function MovimientosPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todas");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    concept: "",
    amount: "",
    kind: "gasto",
    category: "",
    bank_account: "",
    transfer_account: "",
    spent_at: new Date().toISOString().slice(0, 10),
  });

  const formKind = kindMeta(form.kind);

  const load = useCallback(async () => {
    const [tx, cats, accs] = await Promise.all([
      api.get<Transaction[]>("/api/transactions"),
      api.get<Category[]>("/api/categories"),
      api.get<BankAccount[]>("/api/accounts"),
    ]);
    if (tx.ok && tx.data) setTransactions(tx.data);
    else console.error("[Movimientos] error movimientos:", tx.error);
    if (cats.ok && cats.data) setCategories(cats.data);
    if (accs.ok && accs.data) setAccounts(accs.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureBootstrap();
      await load();
    })();
  }, [load]);

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (kindFilter !== "todos" && t.kind !== kindFilter) return false;
      if (categoryFilter !== "todas") {
        const id = typeof t.category === "object" && t.category ? (t.category as any)._id : t.category;
        if (id !== categoryFilter) return false;
      }
      if (search && !t.concept?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, kindFilter, categoryFilter, search]);

  const totals = useMemo(() => {
    const totals = computeTotals(filtered);
    return { gasto: totals.expense, ingreso: totals.income, interno: totals.internal };
  }, [filtered]);

  const create = async () => {
    const amount = Number(form.amount.replace(",", "."));
    if (!form.concept.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Indica un concepto y un importe válido");
      return;
    }
    if (formKind.needsDestination) {
      if (!form.bank_account || !form.transfer_account) {
        toast.error(`Este movimiento (${formKind.label.toLowerCase()}) necesita cuenta de origen y de destino`);
        return;
      }
      if (form.bank_account === form.transfer_account) {
        toast.error("La cuenta de origen y la de destino no pueden ser la misma");
        return;
      }
    }
    setSaving(true);
    const res = await api.post("/api/transactions", {
      concept: form.concept.trim(),
      amount,
      kind: form.kind,
      spent_at: new Date(form.spent_at).toISOString(),
      category: formKind.needsDestination ? undefined : form.category || undefined,
      bank_account: form.bank_account || undefined,
      transfer_account: formKind.needsDestination ? form.transfer_account : undefined,
    });
    setSaving(false);
    if (!res.ok) {
      console.error("[Movimientos] error creando:", res.error);
      toast.error((res.error as any)?.message || "No he podido guardar el movimiento");
      return;
    }
    toast.success("Movimiento registrado");
    setOpen(false);
    setForm({ ...form, concept: "", amount: "" });
    window.dispatchEvent(new Event("fintra:refresh"));
    await load();
  };

  const remove = async (id: string) => {
    const res = await api.delete(`/api/transactions/${id}`);
    if (!res.ok) {
      console.error("[Movimientos] error eliminando:", res.error);
      toast.error("No he podido eliminar el movimiento");
      return;
    }
    toast.success("Movimiento eliminado");
    await load();
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="movimientos"
        title="Gastos e ingresos"
        description="Gastos, ingresos, transferencias y pagos de tarjeta. Los movimientos entre tus cuentas no se cuentan como gasto."
        action={
          <div className="flex flex-wrap gap-2">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full">
                  <Plus className="mr-2 h-4 w-4" /> Nuevo movimiento
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nuevo movimiento</DialogTitle>
                  <DialogDescription>
                    Registra un gasto, un ingreso, una transferencia entre tus cuentas o el pago de una tarjeta.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="concept">Concepto</Label>
                    <Input
                      id="concept"
                      value={form.concept}
                      onChange={(e) => setForm({ ...form, concept: e.target.value })}
                      placeholder="Compra en el súper"
                      className="mt-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="amount">Importe (€)</Label>
                      <Input
                        id="amount"
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(e) => setForm({ ...form, amount: e.target.value })}
                        placeholder="24,90"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label htmlFor="date">Fecha</Label>
                      <Input
                        id="date"
                        type="date"
                        value={form.spent_at}
                        onChange={(e) => setForm({ ...form, spent_at: e.target.value })}
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Tipo de movimiento</Label>
                      <Select
                        value={form.kind}
                        onValueChange={(v) =>
                          setForm({
                            ...form,
                            kind: v,
                            category: kindMeta(v).needsDestination ? "" : form.category,
                            transfer_account: kindMeta(v).needsDestination ? form.transfer_account : "",
                          })
                        }
                      >
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TX_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Categoría</Label>
                      <Select
                        value={form.category}
                        onValueChange={(v) => setForm({ ...form, category: v })}
                        disabled={formKind.needsDestination}
                      >
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue placeholder={formKind.needsDestination ? "No aplica" : "Elegir"} />
                        </SelectTrigger>
                        <SelectContent>
                          {categories
                            .filter((c) => c.kind === (form.kind === "ingreso" ? "ingreso" : "gasto"))
                            .map((c) => (
                              <SelectItem key={c._id} value={c._id}>
                                {c.emoji} {c.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="rounded-2xl bg-secondary/60 px-3.5 py-2.5 text-xs text-muted-foreground">
                    {formKind.help}
                  </p>
                  <div className={formKind.needsDestination ? "grid grid-cols-2 gap-3" : ""}>
                    <div>
                      <Label>{formKind.needsDestination ? "Cuenta de origen" : "Cuenta"}</Label>
                      <Select value={form.bank_account} onValueChange={(v) => setForm({ ...form, bank_account: v })}>
                        <SelectTrigger className="mt-1.5 w-full">
                          <SelectValue placeholder="Elegir cuenta" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((a) => (
                            <SelectItem key={a._id} value={a._id}>
                              {a.name} {a.last_four ? `· ${a.last_four}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formKind.needsDestination && (
                      <div>
                        <Label>Cuenta de destino</Label>
                        <Select
                          value={form.transfer_account}
                          onValueChange={(v) => setForm({ ...form, transfer_account: v })}
                        >
                          <SelectTrigger className="mt-1.5 w-full">
                            <SelectValue placeholder="Elegir cuenta" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts
                              .filter((a) => a._id !== form.bank_account)
                              .map((a) => (
                                <SelectItem key={a._id} value={a._id}>
                                  {a.name} {a.last_four ? `· ${a.last_four}` : ""}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={create} disabled={saving} className="rounded-full">
                    {saving ? "Guardando…" : "Guardar movimiento"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        }
      />

      <Card className="rise rounded-3xl p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar concepto…"
              className="rounded-full pl-9"
            />
          </div>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-full rounded-full sm:w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {TX_KINDS.map((k) => (
                <SelectItem key={k.value} value={k.value}>
                  {k.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full rounded-full sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las categorías</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mb-4 flex flex-wrap gap-6 text-sm">
          <p className="text-muted-foreground">
            {filtered.length} movimientos · gastos <span className="tabular text-foreground">{money(totals.gasto)}</span>{" "}
            · ingresos <span className="tabular text-primary">{money(totals.ingreso)}</span>
            {totals.interno > 0 && (
              <>
                {" "}
                · <span className="tabular">{money(totals.interno)}</span> movidos entre cuentas (ni gasto ni ingreso)
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-2xl" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.length === 0 && (
              <li className="py-8 text-center text-sm text-muted-foreground">No hay movimientos con estos filtros.</li>
            )}
            {filtered.map((t) => {
              const cat = typeof t.category === "object" && t.category ? (t.category as any) : null;
              const acc = typeof t.bank_account === "object" && t.bank_account ? (t.bank_account as any) : null;
              const dest =
                typeof t.transfer_account === "object" && t.transfer_account ? (t.transfer_account as any) : null;
              const meta = kindMeta(t.kind);
              return (
                <li key={t._id} className="group flex items-center gap-3 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-secondary">
                    {meta.needsDestination ? "🔄" : cat?.emoji || (meta.income ? "💰" : "💸")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.concept}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(t.spent_at).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                      {meta.needsDestination ? ` · ${meta.label}` : cat ? ` · ${cat.name}` : ""}
                      {acc ? ` · ${acc.name}` : ""}
                      {dest ? ` → ${dest.name}` : ""}
                      {` · ${SOURCE_LABEL[t.source || "manual"] || "Manual"}`}
                      {t.auto_categorized === "yes" ? " · categorizado por IA" : ""}
                    </p>
                  </div>
                  <span
                    className={`tabular text-sm font-semibold ${
                      meta.income ? "text-primary" : meta.expense ? "" : "text-muted-foreground"
                    }`}
                  >
                    {meta.sign}
                    {money(t.amount)}
                  </span>
                  <button
                    onClick={() => remove(t._id)}
                    className="rounded-lg p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                    aria-label={`Eliminar ${t.concept}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
