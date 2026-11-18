/** Lo que se ve mientras un producto no tiene foto: prolijo, no un ícono roto. */
export function SinFoto({ nombre, categoria }: { nombre: string; categoria?: string | null }) {
  const inicial = nombre.trim().charAt(0).toLocaleUpperCase("es-AR") || "?";
  return (
    <div
      aria-hidden
      className="aspect-square w-full rounded-t-sm bg-t-surface-alt flex flex-col items-center justify-center gap-1 overflow-hidden"
    >
      <span className="text-5xl font-extrabold text-t-accent leading-none">{inicial}</span>
      {categoria ? (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-t-muted px-2 text-center line-clamp-1">
          {categoria}
        </span>
      ) : null}
    </div>
  );
}
