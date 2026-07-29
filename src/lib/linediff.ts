// Diff de linhas estilo GitHub (verde = acrescentado, vermelho = removido).
// Puro, sem dependências. Usado para mostrar o que uma proposta muda numa trilha.
//
// A comparação é normalizada (linhas trimadas, vazias fora): o conteúdo aceito
// vem indentado do exporter e o proposto vem do editor sem indentação. Sem
// normalizar, todo compasso apareceria como mudado.

function toLines(s: string): string[] {
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Diff por LCS de duas listas de linhas, em operações same/add/del. */
function lcsDiff(a: string[], b: string[]): { type: "same" | "add" | "del"; text: string }[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = comprimento da LCS de a[i..] e b[j..]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: { type: "same" | "add" | "del"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: a[i] });
      i++;
    } else {
      out.push({ type: "add", text: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i++] });
  while (j < m) out.push({ type: "add", text: b[j++] });
  return out;
}

/** Contagem de linhas acrescentadas e removidas, para o resumo "+N −M". */
export function diffStat(current: string, proposed: string): { add: number; del: number } {
  const diff = lcsDiff(toLines(current), toLines(proposed));
  let add = 0;
  let del = 0;
  for (const d of diff) {
    if (d.type === "add") add++;
    else if (d.type === "del") del++;
  }
  return { add, del };
}
