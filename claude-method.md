# Metodología de Desarrollo Paralelo con Claude Code

> Documento maestro. Esta es la guía operativa portable: vale para cualquier proyecto que la adopte. Define cómo se trabaja en paralelo con varias sesiones de Claude Code, cómo se integran los cambios sin romper el repo, y qué reglas de calidad, tokens y disciplina aplican a TODA sesión, incluidas las que corren en worktrees.
>
> Lo específico de cada proyecto (reglas críticas de producto, rama destino, comandos de typecheck/test/build) NO vive en este doc. Vive en `.claude/rules.md` y `.claude/method.config` del repo. Ver §7 y §12.

---

## 0. Resumen ejecutivo (léelo primero)

El paralelismo de verdad no es abrir más pestañas. Es tres cosas combinadas:

1. **Aislar bien.** Cada feature vive en su propio git worktree y, si tu stack lo necesita, contra su propia base de datos / cache / servicios. Archivos y estado externo quedan separados.
2. **Definir antes de construir.** Cada feature arranca de una spec (SDD) que sirve de contrato compartido entre sesiones que no se conocen entre sí.
3. **Imponer la integración, no pedirla.** Un hook determinista bloquea todo merge a la rama destino salvo que pase por revisión de código y QA. La regla vive en el repo, no en la buena voluntad del modelo.

Construir es paralelo. Integrar es secuencial y ordenado. Esa frase resume todo.

---

## 1. El modelo de tres capas: SDD, reglas, verificación

Antes de los comandos, el marco mental. Hay tres niveles y NO se deben mezclar:

| Capa | Pregunta que responde | Dónde vive |
|------|----------------------|------------|
| **Spec (SDD)** | ¿Qué se construye y cuál es el contrato? | `specs/<feature>.md` |
| **Reglas (este doc + rules.md)** | ¿Cómo se trabaja, con qué calidad? | este `.md` + `.claude/rules.md` |
| **Verificación (tests + hooks)** | ¿Se construyó bien y lo acordado? | tests + `.claude/` |

### 1.1 SDD y TDD no compiten, se apilan

- **TDD** opera a nivel de código en un loop apretado: test que falla, código que lo pasa, refactor. Responde "¿esta implementación es correcta?". Su límite: NO te dice qué construir.
- **SDD** opera una capa arriba: la spec (comportamiento, arquitectura, edge cases, restricciones) es el artefacto canónico, y de ella nacen el código, los tests y la documentación. Responde "¿es esta la implementación que acordamos construir?".

La relación clave: **un buen flujo de SDD genera los tests de TDD a partir de la spec, no al revés.** No se elige uno. SDD dice qué se construye; TDD verifica que se construyó bien.

Por qué importa para el paralelismo: cuando lanzas tres sesiones en worktrees, cada una es un agente sin memoria de las otras. La spec es el contrato compartido que hace que sus outputs sean compatibles. La spec *previene* las incompatibilidades; el validador de QA las *atrapa*.

### 1.2 Regla anti-sobreingeniería

No escribas specs gigantes para cambios triviales. Para un endpoint simple, una spec de tres líneas basta. Reserva el SDD completo para features con superficie de integración real (los que comparten módulos, eventos o esquema de DB). El sesgo hacia "especificación pesada por adelantado" es un antipatrón conocido; evítalo.

---

## 2. Worktrees: una sesión, una copia aislada del código

Abrir dos pestañas de Claude Code en la misma carpeta NO es trabajo paralelo. En cuanto una sesión edita un archivo, el contexto de la otra se corrompe: estados desincronizados, conflictos raros, una sesión sobreescribiendo a la otra.

La solución es un git worktree por sesión: un directorio de trabajo independiente, con su propia rama, que comparte el historial y el remoto del repo principal. Si la sesión A edita un archivo, la sesión B ni se entera.

### 2.1 Crear un worktree

Convención de ubicación y rama:
- Ubicación: `.claude/worktrees/<slug>/`
- Rama: `worktree-<slug>` (o la convención que use tu host/harness)

Mecanismos para crearlo:

**a) Vía la herramienta del harness.** Claude Code expone una herramienta `EnterWorktree`. Pídele a la sesión activa "trabaja en un worktree llamado `<slug>`" y el harness crea el worktree y mueve la sesión a él. Para SUMAR sesiones paralelas, abre terminales nuevas, lanza `claude` en cada una y dile en la primera instrucción "entra a un worktree llamado `<slug>`".

**b) Manualmente con git, luego abres Claude dentro:**

```bash
git worktree add .claude/worktrees/<slug> -b worktree-<slug>
cd .claude/worktrees/<slug>
claude
```

**c) Flag de arranque (si tu distribución de Claude Code lo expone).** Algunas versiones ofrecen un flag tipo `-w <slug>` que automatiza el flujo. Verifica en `claude --help` si está disponible antes de asumirlo; si no, usa (a) o (b).

### 2.2 Reglas de uso

- El slug es solo una etiqueta. Usa uno corto y legible (ID de ticket o nombre del feature). Nunca lo dejes autogenerar o no sabrás qué terminal es cuál.
- La PRIMERA vez que uses worktrees en el repo, arranca `claude` una vez en el directorio principal para aceptar el diálogo de confianza del workspace.
- Si ya tienes una sesión abierta y quieres aislarla: pídele "trabaja en un worktree". Para SUMAR sesiones paralelas: terminales nuevas, una sesión por worktree.
- Worktree + `--dangerously-skip-permissions` se combinan razonablemente para uso interno: el worktree contiene el blast radius. Aun así, sigue valiendo la regla "User approved once ≠ approved in all contexts" — el modo sin confirmaciones NO es licencia para acciones destructivas fuera de archivos (force-push, drops de DB, llamadas a APIs externas).
- No dejes que los subagentes creen los worktrees solos cuando hay sandbox activo: el sandboxing no se lleva bien con worktrees creados por el agente. Créalos tú con la herramienta o `git worktree add` y deja que los agentes operen dentro.

### 2.3 Límite práctico

De cuatro a seis sesiones paralelas por persona es el techo sano. Más allá, el cuello de botella ya no es la IA, eres tú revisando.

---

## 3. El otro tipo de aislamiento: estado externo compartido

Los worktrees aíslan archivos. NO aíslan nada que viva fuera del repo: base de datos, cache, broker, archivos en disco fuera del checkout, servicios externos. **Si tu stack tiene estado externo compartido y dos features tocan su esquema o sus claves, ese estado se vuelve el cuello de botella.** Una migración en un feature rompe el esquema de los otros. En modo sin confirmaciones, pasa sin avisarte.

**Regla dura:** una instancia aislada por worktree para CADA estado externo relevante. Puertos y rutas propios. Si tu stack NO tiene estado externo (apps que viven solo en archivos del repo, librerías puras, generadores estáticos, apps de escritorio que escriben a una carpeta de usuario), revisa §3.3 y §3.4 pero puedes saltar el resto.

### 3.1 Receta: Postgres por worktree

Helper en `.claude/hooks/setup-db-worktree.sh`:

```bash
#!/usr/bin/env bash
# Uso: bash .claude/hooks/setup-db-worktree.sh <feature> <puerto>
set -euo pipefail
FEATURE="${1:?Falta nombre del feature}"
PORT="${2:?Falta puerto}"
docker run -d --name "db-${FEATURE}" \
  -e POSTGRES_USER=app -e POSTGRES_PASSWORD=app -e POSTGRES_DB="app_${FEATURE}" \
  -p "${PORT}:5432" postgres:16
echo "DATABASE_URL=postgresql://app:app@localhost:${PORT}/app_${FEATURE}"
```

Cada worktree apunta su `.env` a su propia `DATABASE_URL`.

### 3.2 Receta: Redis / KV por worktree

```bash
docker run -d --name "redis-${FEATURE}" -p "${PORT}:6379" redis:7
```

`.env` por worktree apunta a `REDIS_URL=redis://localhost:${PORT}`.

### 3.3 Estado en archivos fuera del checkout

Si tu app escribe a `~/.<app>/` o similar (apps de escritorio, agentes con archivos locales), deriva una ruta por feature: `~/.<app>/worktree-<feature>/`. Pásala al runtime vía variable de entorno (`APP_DATA_DIR`, `XDG_DATA_HOME`, lo que aplique). Mismo principio: cada worktree, su raíz.

### 3.4 Puertos

Asigna puertos distintos por worktree para servidores, bundlers y devtools. Si dos sesiones intentan bindear el mismo puerto, una falla en silencio o ambas se pelean.

Convención sugerida: reserva un rango por feature (`3000-3009` para feature A, `3010-3019` para B, etc.) y déjalo declarado en su `.env`.

---

## 4. La metodología, paso a paso

### 4.1 Antes de lanzar: Plan Mode y mapa de dependencias

El aislamiento resuelve choques de archivos, no dependencias entre features. Si dos sesiones tocan el mismo módulo compartido o el sistema de design tokens, habrá conflicto al integrar aunque los directorios estén separados.

En el directorio principal, abre Plan Mode y pide a Claude que:
1. Lea las specs de los features a construir.
2. Identifique puntos de conflicto (archivos/módulos compartidos).
3. Proponga cómo dividir el trabajo por dominio.
4. Defina el ORDEN de merge por dependencias.

Deja el plan por escrito. Diez minutos aquí ahorran una hora de conflictos al final.

### 4.2 Durante: construir en paralelo

- Una sesión por feature, con scope acotado ("trabaja solo en `src/walks/`, no toques nada más").
- Cada worktree contra su estado externo aislado (si aplica).
- Commits pequeños y frecuentes. El commit es la unidad que el integrador va a revisar.

### 4.3 Integrar: secuencial y verificado

Cada feature se mergea cuando está completo y commiteado, NO cuando "todos terminaron". El orden lo decidiste en Plan Mode: primero lo que toca módulos base, después lo que depende de ellos.

La rama destino la fija el proyecto en `.claude/method.config` (`TARGET_BRANCH`). En el resto del doc nos referimos a ella como `<rama-destino>`.

Tras cada merge a `<rama-destino>`, rebasea los worktrees pendientes sobre el `<rama-destino>` actualizado ANTES de validarlos. Esto convierte un conflicto gigante al final en varios pequeños y manejables.

### 4.4 Limpiar

Elimina el worktree, la rama y el estado externo del feature. Los worktrees y DBs obsoletos se acumulan rápido.

```bash
git worktree remove .claude/worktrees/<feature>
git branch -d worktree-<feature>
docker rm -f db-<feature>   # si aplica
```

---

## 5. El sistema de integración: agentes que revisan, hook que obliga

Hacer la revisión a mano en cada sesión no escala. La solución es un sistema de roles con una distinción crítica:

- **Pedirle a un agente** depende de que el modelo obedezca. Sirve para revisar.
- **Obligar con un hook** es código determinista que no puede alucinar ni olvidar. Sirve para imponer.

La regla "todo merge a la rama destino pasa por revisión" NO se le pide a un agente: se impone con un hook.

### 5.1 El flujo completo

```
Intento de merge directo a <rama-destino>
        │
        ▼
[hook gate-merge.sh]  ──── ¿hay marca de aprobación? ──NO──> BLOQUEA (exit 2)
        │                                                      "usa /integrate"
       SÍ
        │
        ▼
  permite la operación UNA vez y consume la marca

/integrate <rama>
        │
        ▼
   [integrator] ── decide orden por dependencias
        │
        ├──> [code-reviewer]  (solo lectura: calidad, seguridad, scope)
        │
        ├──> [qa-validator]   (tests, typecheck, build, compatibilidad lógica)
        │
        ▼
   ¿ambos aprueban?
        ├── NO ──> reporta bloqueantes, NO genera marca
        └── SÍ ──> rebase preventivo, genera marca, mergea
```

### 5.2 El candado: hook PreToolUse

Archivo `.claude/hooks/gate-merge.sh`. Intercepta tres operaciones peligrosas sobre `<rama-destino>` y las bloquea con exit 2 salvo que exista la marca de un solo uso `.claude/.merge-approved` (per-worktree, generada por el integrador y consumida por el hook):

1. `git merge` con `<rama-destino>` como argumento o estando parado en ella.
2. `git push` con `<rama-destino>` como destino (incluye `git push origin <rama-destino>` y `git push origin <ref>:<rama-destino>`).
3. `gh pr merge` (no podemos inferir el base de la PR sin llamar a la API; bloqueamos por defecto, el integrador es quien aprueba).

```bash
#!/usr/bin/env bash
# .claude/hooks/gate-merge.sh
# Bloquea merges/pushes a <rama-destino> salvo que exista marca de aprobación
# generada por el integrador (.claude/.merge-approved, marca de un solo uso).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
CONFIG="${ROOT}/.claude/method.config"
# shellcheck disable=SC1090
[[ -f "$CONFIG" ]] && source "$CONFIG"
TARGET_BRANCH="${TARGET_BRANCH:-main}"

# Parsea el comando del JSON del hook con jq (NO sed: el regex revienta con
# quotes escapadas o JSON multilínea).
INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[[ -z "$CMD" ]] && exit 0

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
is_target_op=0

# Caso 1: git merge tocando la rama destino (por argumento o por estar parado en ella).
if printf '%s' "$CMD" | grep -Eq '(^|[[:space:];&|])git[[:space:]]+merge([[:space:]]|$)'; then
  [[ "$CURRENT_BRANCH" == "$TARGET_BRANCH" ]] && is_target_op=1
  printf '%s' "$CMD" | grep -Eq "(^|[[:space:]])${TARGET_BRANCH}(\$|[[:space:]])" && is_target_op=1
fi

# Caso 2: git push origin <ref>:<TARGET_BRANCH> o git push origin <TARGET_BRANCH>
if printf '%s' "$CMD" | grep -Eq "git[[:space:]]+push.*(\\b|:)${TARGET_BRANCH}(\\b|\\s|$)"; then
  is_target_op=1
fi

# Caso 3: gh pr merge — bloqueamos por defecto (no inferimos base sin API call).
if printf '%s' "$CMD" | grep -Eq 'gh[[:space:]]+pr[[:space:]]+merge'; then
  is_target_op=1
fi

[[ $is_target_op -eq 0 ]] && exit 0

# Marca per-worktree (no compartida via .git common-dir).
APPROVAL="${ROOT}/.claude/.merge-approved"
if [[ -f "$APPROVAL" ]]; then
  rm -f "$APPROVAL"
  echo "Merge aprobado (marca consumida)." >&2
  exit 0
fi

echo "MERGE BLOQUEADO sobre ${TARGET_BRANCH}. Usa /integrate <rama> primero." >&2
exit 2
```

Registro en `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [
        { "type": "command", "command": "bash .claude/hooks/gate-merge.sh" }
      ]}
    ]
  },
  "permissions": {
    "deny": [
      "Bash(git push --force:*)",
      "Bash(git push --force-with-lease:*)"
    ]
  }
}
```

Avisos:
- **CI:** la marca funciona localmente porque los worktrees comparten el `.git`. En CI cada checkout es fresco; ahí el enforcement va por **branch protection del host de git** (PRs obligatorios, required reviews, required checks), NO por el hook local. El hook es defensa local; branch protection es la barrera real.
- **`.merge-approved` debe ir en `.gitignore`** (marca volátil, no versionar).
- **`jq` debe estar disponible** en el PATH del hook. Si no lo está, el hook falla cerrado (exit 1) y bloquea — diseño intencional.

### 5.3 Los tres agentes (definiciones completas)

Estos archivos viven en `.claude/agents/`. Se incluyen aquí completos para que el sistema sea autocontenido. Todos leen la rama destino de `.claude/method.config`.

#### `.claude/agents/code-reviewer.md`

```markdown
---
name: code-reviewer
description: Revisor de codigo de solo lectura. Examina los cambios de una rama
  contra <rama-destino> y reporta problemas de calidad, seguridad y convenciones.
  NUNCA edita ni mergea. Se invoca en el flujo /integrate, una vez por rama.
tools: Read, Grep, Glob, Bash
model: sonnet
isolation: worktree
---

Eres el revisor de codigo del proyecto. Tu unico trabajo es REVISAR.
No editas. No mergeas. No corres migraciones. Bash solo para inspeccion
(git diff, git log) de solo lectura.

Antes de revisar, lee `.claude/rules.md` del proyecto. Esas son las reglas
criticas no negociables. Si el archivo no existe, reporta:
"PROYECTO NO DECLARA REGLAS CRITICAS — solo reviso convenciones genericas".

Revisa en este orden:
1. Reglas criticas declaradas en `.claude/rules.md`. Si alguna se rompe, es
   BLOQUEANTE.
2. Limites de modulo: el feature debe quedarse en su dominio. Marca
   ediciones fuera del scope asignado.
3. Seguridad: endpoints sin guard/auth, SQL sin parametrizar, secretos
   hardcodeados, validacion faltante en DTOs.
4. Migraciones / cambios de esquema: marca si son destructivas o chocan
   con otra rama en vuelo.
5. Convenciones: naming, manejo de errores, console.log olvidados, codigo muerto.

Salida (solo esto, sin preambulo):
VEREDICTO: APRUEBA | RECHAZA | APRUEBA_CON_OBSERVACIONES
BLOQUEANTES: (lista; vacio si no hay)
OBSERVACIONES: (mejoras no bloqueantes)
ARCHIVOS_FUERA_DE_SCOPE: (lista)

Se conciso. Solo reporta lo accionable.
```

#### `.claude/agents/qa-validator.md`

```markdown
---
name: qa-validator
description: Valida que una rama funcione de verdad. Corre tests, typecheck,
  lint y build, y valida compatibilidad logica con <rama-destino> (no solo
  conflictos de git). Se invoca en /integrate, despues del code-reviewer.
tools: Read, Grep, Glob, Bash
model: sonnet
isolation: worktree
---

Eres el validador de QA. Pruebas que la rama FUNCIONA y es COMPATIBLE con
<rama-destino>. Si la implementacion esta mal, NO la arregles: repórtalo.

Lee `.claude/method.config` para los comandos:
- TYPECHECK_CMD (default: pnpm typecheck)
- LINT_CMD (opcional)
- TEST_CMD (default: pnpm test)
- BUILD_CMD (default: pnpm build)

Pasos (detente al primer fallo bloqueante):
1. Typecheck.
2. Lint (si esta definido).
3. Tests del dominio afectado. Si no hay tests para el feature, es un riesgo.
4. Build.
5. Compatibilidad logica (lo que git NO atrapa):
   - Features que asumen estructuras distintas del mismo evento/entidad.
   - Cambios de contrato de API que rompen a otro consumidor.
   - Cambios de esquema que rompen datos existentes.

Estado externo: corres contra la instancia AISLADA del feature (DB, cache, etc),
nunca la compartida. Si el feature corre migraciones contra una instancia
compartida, es BLOQUEANTE.

Salida (solo esto):
VEREDICTO: PASA | FALLA
TYPECHECK / LINT / TESTS / BUILD: ok | fallo (detalle)
RIESGOS_DE_COMPATIBILIDAD: (lista; vacio si no hay)

Pega solo las lineas de error relevantes, no logs completos.
```

#### `.claude/agents/integrator.md`

```markdown
---
name: integrator
description: Orquestador de integracion. Coordina el merge de ramas a
  <rama-destino>. Llama a code-reviewer y qa-validator, decide orden por
  dependencias, resuelve conflictos en contexto, y SOLO si todo aprueba
  genera la marca que el hook exige. Unico rol con autoridad para decidir
  que entra a <rama-destino>.
tools: Read, Grep, Glob, Bash, Edit, Agent
model: opus
---

Eres el integrador. Unico rol con autoridad sobre la rama destino. Tu prioridad
es la integridad de esa rama, no la velocidad.

Lee `.claude/method.config` para TARGET_BRANCH antes de empezar.

Existe un hook (gate-merge.sh) que BLOQUEA cualquier merge/push a TARGET_BRANCH
salvo que exista .claude/.merge-approved. Esa marca es de UN SOLO USO. Solo la
generas cuando la rama merece entrar.

Flujo por rama:
1. Inspecciona: git fetch, diff contra TARGET_BRANCH, entiende el scope.
2. Orden por dependencias: primero modulos base, despues dependientes. Anuncia
   el orden y explica por que.
3. Lanza code-reviewer. Espera veredicto.
4. Lanza qa-validator. Espera veredicto.
5. Decision:
   - Si RECHAZA o FALLA: NO mergeas, NO generas marca. Reporta bloqueantes.
   - Si ambos aprueban: continua.
6. Rebase preventivo sobre TARGET_BRANCH actual. Conflictos: resuelve EN
   CONTEXTO de lo que el feature intentaba. Si el conflicto toca logica
   critica de producto declarada en `.claude/rules.md`, DETENTE y pregunta.
7. Aprueba y mergea:
   touch .claude/.merge-approved
   git checkout "$TARGET_BRANCH" && git merge --no-ff <rama>
8. Reporta: que entro, en que orden, que quedo pendiente.

Reglas duras:
- NUNCA generes la marca sin aprobacion de AMBOS agentes.
- NUNCA mergees dos ramas a la vez. Una, validar, siguiente.
- Tras cada merge, las ramas pendientes se rebasean sobre el nuevo
  TARGET_BRANCH ANTES de validarse.
- Si dudas, no mergees. Un TARGET_BRANCH limpio vale mas que un merge rapido.
```

### 5.4 El comando `/integrate`

Archivo `.claude/commands/integrate.md`:

```markdown
---
description: Integra una o varias ramas a <rama-destino> via code-review +
  QA + integrador. Uso: /integrate <rama> [rama2 ...]
---

Usa el subagente integrator para integrar a la rama destino del proyecto
(leela de .claude/method.config):

$ARGUMENTS

Debe: decidir orden por dependencias; por cada rama lanzar code-reviewer y
luego qa-validator; mergear solo las que ambos aprueben generando la marca;
rebasear pendientes tras cada merge; reportar que entro, que se rechazo y
por que. Ante conflictos de logica de producto critica, detente y pregunta.
```

---

## 6. Specs (SDD): plantilla EARS

Cada feature con superficie de integración arranca de una spec en `specs/<feature>.md`. La spec es lo que se lee en Plan Mode y lo que alimenta al code-reviewer con el contrato contra el cual juzgar.

EARS (Easy Approach to Requirements Syntax) hace los criterios legibles por agentes. Cinco patrones:

- **Ubicuo:** "El sistema DEBE <requisito>."
- **Disparado por evento:** "CUANDO <evento>, el sistema DEBE <respuesta>."
- **Condicional de estado:** "MIENTRAS <estado>, el sistema DEBE <requisito>."
- **Opcional:** "DONDE <feature presente>, el sistema DEBE <requisito>."
- **No deseado:** "SI <condicion no deseada>, ENTONCES el sistema DEBE <respuesta>."

### Plantilla

```markdown
# Spec: <nombre del feature>

## Objetivo
Una frase: qué problema resuelve y para quién.

## Alcance
- Dentro: (qué SÍ hace este feature)
- Fuera: (qué explícitamente NO hace)

## Dominio / módulos que toca
- Archivos/carpetas: (ej. src/walks/, src/health/)
- NO debe tocar: (módulos de otros features en vuelo)

## Contrato de API
- Endpoint: METODO /ruta
  - Acepta: (shape del request)
  - Retorna: (shape de la respuesta)
  - Errores: (códigos y cuándo)

## Cambios de esquema / migraciones
- Tablas/columnas nuevas o modificadas.
- ¿Es destructivo? ¿Choca con otra rama?

## Puntos de integración
- Eventos o entidades COMPARTIDAS con otros features (aquí viven los conflictos).
- Shape exacto del evento/entidad compartida.

## Criterios de aceptación (EARS)
- CUANDO <evento>, el sistema DEBE <respuesta>.
- SI <condición no deseada>, ENTONCES el sistema DEBE <respuesta>.
- ...

## Reglas de proyecto que aplican
- (referencia a `.claude/rules.md` si el feature toca alguna regla crítica)

## Tests esperados (se generan de esta spec)
- (lista de casos que TDD debe cubrir, derivados de los criterios EARS)
```

---

## 7. Reglas críticas de proyecto (slot)

Este doc maestro NO contiene reglas de producto. Cada proyecto declara las suyas en `.claude/rules.md`. Las lee el `code-reviewer` y son BLOQUEANTES.

Sin `.claude/rules.md`, el reviewer reporta "proyecto no declara reglas críticas — solo reviso convenciones genéricas". La metodología sigue funcionando; solo pierdes la verificación específica de producto.

### Formato sugerido para `.claude/rules.md`

```markdown
# Reglas críticas del proyecto (no negociables)

Para code-reviewer y para humanos. Si una regla se rompe, es BLOQUEANTE.

- **<Regla 1>:** <enunciado preciso. Sin ambigüedad. Sin "preferiblemente".>
- **<Regla 2>:** <...>
```

Buenas reglas son **verificables** (un humano o un agente puede decir sí/no), **específicas** (no "código limpio") y **no negociables** (si se discute caso a caso, no es regla, es preferencia).

Ejemplos del tipo de regla que va aquí:
- Restricciones de arquitectura ("módulo X NO importa de módulo Y").
- Invariantes de producto ("toda métrica visible al usuario incluye disclaimer Z").
- Prohibiciones de implementación ("ningún color hardcodeado fuera del archivo de tokens").
- Reglas de seguridad específicas del dominio.

NO van aquí:
- Preferencias estilísticas (eso es lint).
- Convenciones generales de la metodología (eso es este doc).

---

## 8. Calidad de respuestas y anti-alucinación

- Si no estás seguro de una API, archivo o firma, LÉELA antes de usarla. No inventes nombres de métodos, props ni endpoints.
- Si un archivo o símbolo no existe, dilo. No asumas que existe porque "debería".
- Antes de editar, lee el archivo real. Tras un cambio grande, vuelve a leer antes de seguir editando en el mismo archivo.
- Cita rutas y nombres exactos, no aproximados.
- Cuando una decisión tenga trade-offs reales, exponlos en vez de elegir en silencio.
- Si una tarea es ambigua o toca lógica crítica de producto, pregunta antes de adivinar.

---

## 9. Manejo de contexto y tokens

El paralelismo gasta más tokens sin disciplina. Hábitos que marcan la diferencia:

- **Delega búsqueda y revisión a subagentes.** Cada subagente corre en su propia ventana de contexto; su output verboso (búsquedas, logs, razonamiento largo) queda aislado y no infla el contexto principal.
- **Grep dirigido, no archivos enteros.** No pegues logs completos, solo las líneas de error relevantes.
- **Ruteo de modelos por tarea.** Opus para arquitectura e integración (el integrador). Sonnet como default y para revisor/QA. Haiku para tareas mecánicas y subagentes de búsqueda.
- **Plan Mode antes de tareas grandes**, con el plan por escrito. Un plan claro evita que el modelo dé vueltas quemando tokens.
- **Resume el estado a un archivo de notas ANTES de compactar**, no después. La auto-compactación es lossy.
- **Commits pequeños y frecuentes.** Hacen baratas las revisiones del integrador.

---

## 10. Flujo completo de referencia

1. Asegura que el proyecto tiene `.claude/method.config` y `.claude/rules.md` (ver §12).
2. Escribe/actualiza la spec EARS de cada feature con superficie de integración.
3. En Plan Mode, divide features, marca dependencias y fija el orden de merge.
4. Levanta el estado externo aislado por feature (DB, cache, lo que aplique). Puertos distintos.
5. Lanza una sesión por feature: crea worktree, scope acotado a su módulo.
6. Construye en paralelo; commits pequeños y frecuentes por rama.
7. Cuando un feature termina: `/integrate <rama>` (reviewer → QA → integrador).
8. Solo se mergea lo que ambos agentes aprueban; el hook lo permite una vez.
9. Tras cada merge, rebasea los worktrees pendientes sobre el nuevo `<rama-destino>`.
10. Limpia: worktree, rama y estado externo del feature.
11. `<rama-destino>` → release (main/prod) solo vía PR con protección de ramas.

---

## 11. Glosario rápido

- **Worktree:** directorio de trabajo aislado con su propia rama, mismo `.git`.
- **SDD:** Spec-Driven Development. La spec es el artefacto canónico; código y tests se derivan de ella.
- **TDD:** Test-Driven Development. Loop de código: test que falla, código que pasa, refactor. SDD genera los tests que TDD usa.
- **EARS:** sintaxis de requisitos legible por agentes (CUANDO/SI/MIENTRAS/DONDE/ubicuo).
- **Hook:** script determinista que corre en un evento del ciclo de vida y puede bloquear acciones. No alucina ni olvida.
- **Marca de aprobación:** archivo de un solo uso que el integrador genera para que el hook permita un merge.
- **`<rama-destino>`:** la rama a la que se integra (config del proyecto: `TARGET_BRANCH`). Típicamente `main` o `staging`.

---

## 12. Configuración por proyecto

El doc maestro es portable. Lo que cambia entre proyectos vive en dos archivos:

### `.claude/method.config`

Shell-source-able. El hook y los agentes lo leen.

```bash
# Rama destino de integración.
# main para proyectos PR-first; staging para flow con release branch.
TARGET_BRANCH=main

# Comandos del proyecto (los usa qa-validator).
TYPECHECK_CMD="pnpm typecheck"
TEST_CMD="pnpm test"
BUILD_CMD="pnpm build"
LINT_CMD="pnpm lint"   # opcional; vacío para saltar
```

Defaults si el archivo no existe:
- `TARGET_BRANCH=main`
- `TYPECHECK_CMD=pnpm typecheck`
- `TEST_CMD=pnpm test`
- `BUILD_CMD=pnpm build`
- `LINT_CMD` vacío

### `.claude/rules.md`

Reglas críticas no negociables del proyecto. Ver §7.

### `.gitignore`

Agrega estas líneas:

```
.claude/.merge-approved
.claude/.merge-approved-*
```

La marca es volátil y per-checkout. No la versiones.

### Perfiles de adopción

- **Solo / 1 sesión activa:** spec opcional, sin hook, sin `/integrate`. La metodología es overhead innecesario para una sola sesión.
- **2+ sesiones en worktrees:** spec recomendada para los features con superficie de integración. Hook + `/integrate` opcionales.
- **3+ sesiones con módulos overlapping:** spec obligatoria, hook + `/integrate` obligatorios. Aquí es donde la metodología paga su costo.

No fuerces el flujo completo en proyectos chicos. La regla "construir paralelo, integrar secuencial" aplica siempre; el aparato de hooks y agentes solo cuando hay riesgo real.
