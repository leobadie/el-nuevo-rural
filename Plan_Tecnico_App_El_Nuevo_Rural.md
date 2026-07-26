# Plan Técnico — El Nuevo Rural: App Real con Login y Permisos

**Objetivo:** migrar la app actual (artifact de Claude, un solo archivo, sin login) a una aplicación web real, con servidor propio, base de datos, y login con roles (Administrador / Encargado).

Este documento está pensado para dárselo a **Claude Code** como punto de partida — tiene el stack recomendado, el modelo de datos completo, el diseño de permisos, y un plan de desarrollo por fases.

---

## 1. Stack tecnológico recomendado

| Capa | Tecnología | Por qué |
|---|---|---|
| Frontend + Backend | **Next.js** (App Router) | Un solo proyecto para todo — páginas, API y lógica de servidor juntos. Más simple de mantener que separar frontend/backend. |
| Base de datos + Auth | **Supabase** (Postgres) | Da base de datos Postgres real, login con usuarios/contraseñas, y permisos a nivel de fila (RLS) — resuelve gran parte del login "gratis", sin tener que programarlo desde cero. |
| Hosting | **Vercel** | Se integra directo con Next.js, tiene plan gratis suficiente para un negocio de este tamaño, y permite conectar un dominio propio más adelante. |
| Estilos | Tailwind CSS | Mismo lenguaje visual que ya usamos en el artifact, fácil de portar. |
| Gráficos | Recharts | Misma librería que ya usa la app actual. |

**Costo estimado para arrancar:** $0/mes (planes gratuitos de Supabase y Vercel alcanzan para un solo negocio con pocos usuarios). Si con el tiempo crece mucho el volumen de datos o usuarios, ahí se evalúa pasar a un plan pago (típicamente arranca en USD 20-25/mes).

---

## 2. Modelo de datos (tablas de la base de datos)

Basado en todo lo que ya construimos en el artifact actual:

### Usuarios y permisos
- **usuarios**: id, email, nombre, rol (`admin` | `encargado`), activo, creado_el
  - Supabase Auth maneja las contraseñas de forma segura (no se guardan en texto plano en ningún lado).

### Módulo Cheques
- **cheques**: id, n_cheque, proveedor, fecha_emision, fecha_cobro, importe, debito_banco, rechazado, tipo (Físico/E-cheque), entregado, observaciones, creado_el, modificado_el, creado_por (usuario)
- **cheques_terceros**: id, n_cheque, librador, banco, fecha_emision, fecha_cobro, importe, estado, entregado_a, fecha_entrega, observaciones
- **limites_proveedores_cheques**: proveedor, limite

### Módulo Ingresos y Egresos
- **movimientos**: id, fecha, descripcion, categoria, ingreso, egreso, proveedor, medio_pago, n_cheque_pago, fecha_cobro_cheque_pago, gasto_fijo_id, creado_el, modificado_el
- **ventas_xrp**: id, fecha, empresa, venta_total, cobro_total, venta_por_medio (JSON), cobro_por_medio (JSON)
- **gastos_fijos**: id, descripcion, categoria, monto, proveedor, activo
- **proveedores**: id, nombre, telefono
- **categorias**: id, nombre
- **limites_categorias**: categoria, limite
- **pedidos**: id, proveedor, items (JSON), notas, texto, telefono, confirmado, enviado_el

### Módulo Empleados
- **colaboradores**: id, codigo, nombre, area, cargo, tipo_pago, valor, tipo_jornada
- **registros_asistencia**: id, colaborador_id, mes, dias (JSON), he_50, he_100
- **parametros_empleados**: horas_completa, horas_media, recargo_50, recargo_100

> Nota: los campos "JSON" son columnas de tipo `jsonb` en Postgres — permiten guardar estructuras flexibles (como el detalle día a día de asistencia) sin crear una tabla aparte para cada cosa.

---

## 3. Diseño de permisos por rol

| Módulo / Acción | Administrador (vos) | Encargado |
|---|---|---|
| Ver Cheques, cargar, editar | ✅ | ✅ |
| Eliminar cheques | ✅ | ❌ |
| Ver Ingresos y Egresos, cargar movimientos | ✅ | ✅ |
| Eliminar movimientos | ✅ | ❌ |
| Importar ventas XRP | ✅ | ✅ |
| Ver Empleados / cargar asistencia | ✅ | ✅ (opcional, a definir) |
| Ver sueldos y recibos | ✅ | ❌ (sensible) |
| Ver Rentabilidad | ✅ | ❌ |
| Gestionar proveedores, categorías, gastos fijos | ✅ | ✅ |
| Gestionar usuarios y permisos | ✅ | ❌ |
| Backups / exportar datos | ✅ | ❌ |

Esto es un punto de partida — se puede ajustar módulo por módulo antes de programarlo. Lo importante es que quede como una tabla de permisos configurable (no hardcodeada), para poder cambiarla sin tocar código.

---

## 4. Plan de desarrollo por fases

**Fase 1 — Base del proyecto**
- Crear proyecto Next.js + conectar Supabase.
- Armar el login (pantalla de ingreso, sesión, cierre de sesión).
- Crear el primer usuario administrador (vos) a mano en Supabase.

**Fase 2 — Piloto con un solo módulo**
- Migrar el módulo de **Cheques** primero (es el más chico y ya está bien definido).
- Confirmar que el login + permisos + base de datos funcionan de punta a punta con este módulo antes de seguir.

**Fase 3 — Resto de los módulos**
- Ingresos y Egresos (incluye Ventas XRP, Gastos Fijos, Pedidos).
- Empleados.
- Rentabilidad (combina datos de los anteriores, va al final).
- Resumen General.

**Fase 4 — Migración de datos actuales**
- Desde el artifact actual, usar los botones de "Descargar backup" (ya existen en cada módulo) para bajar los datos en JSON.
- Escribir un script simple que lea esos JSON y los cargue en la base de datos nueva.

**Fase 5 — Deploy**
- Publicar en Vercel.
- (Opcional) conectar un dominio propio, por ejemplo `cheques.elnuevorural.com.ar`.
- Crear el usuario del encargado con el rol correspondiente.

---

## 5. Qué llevar a Claude Code

Al abrir Claude Code, se le puede pasar este archivo entero como contexto inicial y pedirle que arranque por la **Fase 1**. Claude Code puede:
- Crear la estructura del proyecto Next.js.
- Escribir el código de login y las tablas de la base de datos.
- Guiar paso a paso la conexión con Supabase y el deploy en Vercel (esos pasos finales de "crear la cuenta en Supabase/Vercel" los tiene que hacer una persona, Claude Code no puede crear cuentas por vos, pero te va diciendo exactamente qué apretar).

---

## 6. Lo que NO cambia

El diseño visual, los colores de marca, la lógica de cálculo (rentabilidad, sueldos, vencimientos de cheques, etc.) ya están probados y funcionando en el artifact actual — ese trabajo no se tira, se traslada tal cual a la app nueva. Este plan es sobre *dónde* vive la app y *quién* puede entrar, no sobre rehacer la lógica del negocio desde cero.
