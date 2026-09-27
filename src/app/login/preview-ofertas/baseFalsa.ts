import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Una base en memoria que responde como Supabase a lo que usa el módulo de ofertas: select,
 * insert, update, delete y upsert con eq/in, single/maybeSingle, y subir fotos al Storage. Es
 * para el banco de pruebas (/login/preview-ofertas): deja probar el admin entero en el navegador
 * sin tocar la base de verdad. No pretende ser un Supabase completo.
 */

type Fila = Record<string, unknown>;
type Resultado = { data: unknown; error: { message: string; code?: string } | null };

/** La clave de cada tabla, para que upsert sepa si pisa o agrega. */
const CLAVES: Record<string, string> = {
  flyer_config: "id",
  cartel_pantallas: "slug",
};

class Consulta implements PromiseLike<Resultado> {
  private op: "select" | "insert" | "update" | "delete" | "upsert" | null = null;
  private payload: Fila | Fila[] | null = null;
  private filtros: ((f: Fila) => boolean)[] = [];
  private devolver = false;
  private modo: "lista" | "una" | "una-o-nada" = "lista";

  constructor(
    private tablas: Record<string, Fila[]>,
    private tabla: string,
  ) {}

  select() {
    if (this.op) this.devolver = true;
    else this.op = "select";
    return this;
  }
  insert(p: Fila | Fila[]) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  upsert(p: Fila | Fila[]) {
    this.op = "upsert";
    this.payload = p;
    return this;
  }
  update(p: Fila) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, valor: unknown) {
    this.filtros.push((f) => f[col] === valor);
    return this;
  }
  neq(col: string, valor: unknown) {
    this.filtros.push((f) => f[col] !== valor);
    return this;
  }
  in(col: string, valores: unknown[]) {
    this.filtros.push((f) => valores.includes(f[col]));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    this.modo = "una";
    return this;
  }
  maybeSingle() {
    this.modo = "una-o-nada";
    return this;
  }

  then<A = Resultado, B = never>(ok?: ((r: Resultado) => A | PromiseLike<A>) | null, mal?: ((e: unknown) => B | PromiseLike<B>) | null) {
    // Un pequeño retraso, como la red: así se ven los "Guardando…" igual que en la app.
    return new Promise<Resultado>((res) => setTimeout(() => res(this.ejecutar()), 40)).then(ok, mal);
  }

  private ejecutar(): Resultado {
    const filas = (this.tablas[this.tabla] ??= []);
    const coinciden = () => filas.filter((f) => this.filtros.every((c) => c(f)));
    let afectadas: Fila[] = [];

    switch (this.op) {
      case "select":
        afectadas = coinciden();
        break;
      case "insert":
        afectadas = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((p) => ({ id: crypto.randomUUID(), ...p }));
        filas.push(...afectadas);
        break;
      case "upsert": {
        const clave = CLAVES[this.tabla] ?? "id";
        for (const p of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
          const existente = filas.find((f) => f[clave] === p[clave]);
          if (existente) Object.assign(existente, p);
          else filas.push({ ...p });
          afectadas.push(existente ?? p);
        }
        break;
      }
      case "update":
        afectadas = coinciden();
        for (const f of afectadas) Object.assign(f, this.payload);
        break;
      case "delete":
        afectadas = coinciden();
        this.tablas[this.tabla] = filas.filter((f) => !afectadas.includes(f));
        break;
    }

    const copia = afectadas.map((f) => ({ ...f }));
    if (this.op !== "select" && !this.devolver) return { data: null, error: null };
    if (this.modo === "una") {
      return copia.length === 1 ? { data: copia[0], error: null } : { data: null, error: { message: `Se esperaba una fila y hubo ${copia.length}.` } };
    }
    if (this.modo === "una-o-nada") return { data: copia[0] ?? null, error: null };
    return { data: copia, error: null };
  }
}

export function crearBaseFalsa(tablas: Record<string, Fila[]>): SupabaseClient {
  const fotos = new Map<string, string>();
  const cliente = {
    from: (tabla: string) => new Consulta(tablas, tabla),
    storage: {
      from: () => ({
        async upload(nombre: string, archivo: Blob) {
          fotos.set(nombre, URL.createObjectURL(archivo));
          return { data: { path: nombre }, error: null };
        },
        getPublicUrl: (nombre: string) => ({ data: { publicUrl: fotos.get(nombre) ?? "" } }),
      }),
    },
  };
  return cliente as unknown as SupabaseClient;
}
