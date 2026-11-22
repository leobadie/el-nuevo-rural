/**
 * Supabase corta cada consulta en 1000 filas (max_rows de PostgREST) sin avisar: no da error,
 * simplemente devuelve menos. Así desaparecieron de la vista los movimientos del 16/11/2026 en
 * adelante (SPEC-traer-todo.md). Este helper pide la tabla por tramos hasta tenerla entera.
 *
 * `tramo(desde, hasta)` tiene que devolver la consulta ya ordenada por algo único (por ejemplo
 * `.order("creado_el").order("id")`) con `.range(desde, hasta)`; si el orden no es estable, un
 * tramo puede repetir filas de otro y saltearse otras.
 *
 * El primer tramo pide también el total, y el resto se pide en paralelo. El tamaño del tramo se
 * toma de lo que el servidor realmente devolvió, así funciona aunque el tope no sea 1000.
 */
type Respuesta<T> = { data: T[] | null; error: unknown; count?: number | null };

export async function traerTodo<T>(
  tramo: (desde: number, hasta: number, conTotal: boolean) => PromiseLike<Respuesta<T>>,
  tamano = 1000,
): Promise<{ data: T[]; error: unknown }> {
  const primero = await tramo(0, tamano - 1, true);
  if (primero.error) return { data: [], error: primero.error };
  const filas = [...(primero.data ?? [])];
  const total = primero.count;
  const paso = filas.length;

  // Sin total no se sabe cuánto falta: se sigue de a un tramo hasta que venga uno vacío.
  if (total == null) {
    while (paso > 0) {
      const r = await tramo(filas.length, filas.length + paso - 1, false);
      if (r.error) return { data: [], error: r.error };
      if (!r.data || r.data.length === 0) break;
      filas.push(...r.data);
    }
    return { data: filas, error: null };
  }

  if (paso === 0 || filas.length >= total) return { data: filas, error: null };

  const desdes: number[] = [];
  for (let d = paso; d < total; d += paso) desdes.push(d);
  const resto = await Promise.all(desdes.map((d) => tramo(d, d + paso - 1, false)));
  for (const r of resto) {
    if (r.error) return { data: [], error: r.error };
    filas.push(...(r.data ?? []));
  }
  return { data: filas, error: null };
}
