"use client";

import { CURRENCIES } from "@/lib/currency";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Selector de divisa reutilizable (alta de cuenta, ajustes de perfil).
 * Muestra código + nombre para que «RD$» y «US$» nunca se confundan.
 */
export function CurrencyPicker({
  value,
  onChange,
  id,
  className,
  ariaLabel = "Moneda",
}: {
  value: string;
  onChange: (code: string) => void;
  id?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={className || "mt-1.5 w-full"}>
        <SelectValue placeholder="Moneda" />
      </SelectTrigger>
      <SelectContent>
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            {c.code} · {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
