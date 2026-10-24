import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function tokenLabel(symbol: string, mint?: string | null) {
  const ticker = symbol || "TOKEN";
  return mint ? `${ticker} · ${mint.slice(0, 4)}…${mint.slice(-4)}` : ticker;
}

export function tokenAmount(
  value: number | string | null | undefined,
  symbol: string,
  decimals = 9,
  mint?: string | null,
) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const precision = Math.max(0, Math.min(18, Math.trunc(decimals)));
  const amount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision,
  }).format(Number.isFinite(n) ? n : 0);
  return `${amount} ${tokenLabel(symbol, mint)}`;
}

export function tokenTotalsLabel(
  totals: Array<{
    amount: number;
    symbol: string;
    decimals: number | null;
    mint?: string | null;
  }>,
) {
  if (!totals.length) return "0";
  const counts = new Map<string, number>();
  for (const total of totals)
    counts.set(total.symbol, (counts.get(total.symbol) ?? 0) + 1);
  return totals
    .map((total) =>
      tokenAmount(
        total.amount,
        total.symbol,
        total.decimals ?? 9,
        counts.get(total.symbol)! > 1 ? total.mint : null,
      ),
    )
    .join(" · ");
}

export function compactNumber(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(n) ? n : 0,
  );
}

export function num(value: unknown) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : 0;
  return Number.isFinite(n) ? n : 0;
}
