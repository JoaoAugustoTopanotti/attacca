// Rate limit em memória (janela deslizante) para rotas que disparam e-mail:
// sem isso, um loop de POSTs queima a cota/reputação do provedor e spamma
// terceiros com endereço digitado por um atacante. Em memória de propósito —
// o deploy é um único processo Node (Render); se um dia houver réplicas, isto
// vira Redis/tabela, mas a interface fica.

type Bucket = { stamps: number[] };

const buckets = new Map<string, Bucket>();

// Limpeza preguiçosa para o Map não crescer para sempre.
let lastSweep = 0;
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    b.stamps = b.stamps.filter((t) => now - t < windowMs);
    if (b.stamps.length === 0) buckets.delete(key);
  }
}

/**
 * Registra uma tentativa para `key` e diz se ela ainda cabe na janela.
 * Ex.: `rateLimit(`magic:${email}`, 3, 15 * 60_000)` — 3 envios por 15 min.
 */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  sweep(now, windowMs);
  const bucket = buckets.get(key) ?? { stamps: [] };
  bucket.stamps = bucket.stamps.filter((t) => now - t < windowMs);
  if (bucket.stamps.length >= max) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.stamps.push(now);
  buckets.set(key, bucket);
  return true;
}

/** O IP do cliente atrás do proxy do Render, para chavear limite por origem. */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd ? fwd.split(",")[0].trim() : "local";
}
