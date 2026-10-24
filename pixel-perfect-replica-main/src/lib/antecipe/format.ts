const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export const formatarMoeda = (v: number | null | undefined) => (v == null ? "—" : brl.format(v));

export function formatarData(v: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const [a, m, d] = v.slice(0, 10).split("-");
    return `${d}/${m}/${a}`;
  }
  return v;
}

export function formatarDataHora(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
