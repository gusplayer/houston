# Reglas críticas del proyecto (no negociables)

Para `code-reviewer` y para humanos. Si una regla se rompe, es BLOQUEANTE.

Reglas extraídas del `CLAUDE.md` de Squad. Verificables, específicas, no negociables.

## Arquitectura — frontera de librerías

- **`ui/` es genérico.** Componentes en `ui/@squad/*` NO pueden importar Zustand, Redux, ni cualquier store global. NO pueden importar tipos de `app/`. Solo props.
- **`ui/` sin path aliases `@/`.** Solo imports relativos dentro de un paquete; imports por nombre de paquete entre paquetes.
- **`engine/` es frontend-agnostic.** Las crates en `engine/*` NO pueden importar Tauri, React, ni asumir webview. Código Tauri-específico vive en `app/squad-tauri/`.

## Reactividad obligatoria

- **Toda lectura de `.squad/**` va por TanStack Query + invalidación por eventos.** No load-on-mount-only. No "se ve al refrescar".
- **Toda escritura a `.squad/**` emite evento o queda atrapada por el file watcher.** Si una escritura no se ve reflejada en la UI sin refresh, es BLOQUEANTE.

## i18n

- **Cero texto literal en inglés (o cualquier idioma) en JSX, props, placeholders, aria-labels, toasts, errores, defaults de `<Empty>`.** Todo pasa por `t()` de `react-i18next`.
- **`ui/@squad/*` NO importa `react-i18next`.** Recibe strings vía prop `labels?` con defaults en inglés; el consumidor en `app/` pasa los `t()`.
- **Variables vía `t("key", { name })`, nunca concatenación.** Plurales con API `count` + claves `_one`/`_other`. Markup embebido vía `<Trans>`.
- **Sin em-dashes (`—`) en copy de usuario.** Comas o frases cortas. El validador lo enforce.
- **Toda key nueva existe en `en`, `es` y `pt`.** `en` es source of truth; `es` y `pt` mirror estructura. `pnpm check-locales` debe pasar.

## Errores — no silent failures

- **Rust:** prohibidos `let _ = <fallible>`, `.ok()` descartando un Result, `.unwrap_or(...)` / `.unwrap_or_default()` / `.unwrap_or_else(|_| ...)` sobre operaciones iniciadas por el usuario, `match { Ok=>..., Err(_)=>log+default }`, `.unwrap()` / `.expect()` fuera de tests o invariantes de compile-time.
- **TypeScript:** prohibidos `.catch(() => null/[]/{})`, `try{}catch{}` sin rethrow ni toast, `try{}catch(e){ console.error(e) }` sin surface, fire-and-forget de Promises sin `.catch`.
- **Camino requerido de surface:** Engine `SkillError` / `CoreError` → `ApiError` → TS `errorMessage(err)` → toast hook → usuario ve la razón real + botón "Report bug".
- **Única excepción:** `tracing::error!` en callbacks de event-emit / file-watcher donde no hay UI thread para toast.

## Backwards compatibility

- **Código interno: NO se mantiene compatibilidad hacia atrás.** Tipos, APIs, módulos Rust, funciones TS: cambio = cambio. Sin "por si acaso".
- **Datos de usuario: sí.** Cambios de shape/layout dentro de `~/.squad/<agent>/.squad/**` requieren migración **idempotente** en `squad_agent_files::migrate_agent_data`. Romper a usuarios existentes es BLOQUEANTE.

## UI

- **No hay affordances solo-hover.** Todo elemento interactivo debe ser visible sin hover. Hover puede mejorar, nunca habilitar.

## Tamaño y duplicación

- **Archivos ≤ 200 líneas** (CSS ≤ 500), excluyendo tests. NUNCA se comprime para encajar. Extraer módulos.
- **Buscar antes de construir.** shadcn/ui registry, `@squad` showcase, componentes existentes, npm — antes de escribir desde cero.

## Tipos sobre strings

- **Conceptos de dominio (status, classification, kind) DEBEN ser enums.** TS → discriminated unions. Rust → enums con `Display`/`FromStr`. Strings sueltas para dominio son BLOQUEANTES.

## Tests

- **Todo feature lleva tests.** Sin excepciones. Los tests no cuentan para el límite de 200 líneas.
