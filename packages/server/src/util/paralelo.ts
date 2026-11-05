/** Executa `tarefa` para cada entrada, com no máximo `limite` ao mesmo tempo, mantendo a ordem dos resultados. */
export async function emParalelo<T, R>(
  entradas: readonly T[],
  limite: number,
  tarefa: (entrada: T) => Promise<R>,
): Promise<R[]> {
  const resultados = new Array<R>(entradas.length);
  let proximo = 0;
  const trabalhadores = Array.from({ length: Math.min(limite, entradas.length) }, async () => {
    while (proximo < entradas.length) {
      const indice = proximo++;
      resultados[indice] = await tarefa(entradas[indice] as T);
    }
  });
  await Promise.all(trabalhadores);
  return resultados;
}
