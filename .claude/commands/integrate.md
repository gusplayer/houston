---
description: Integra una o varias ramas a <rama-destino> via code-review + QA + integrador.
  Uso: /integrate <rama> [rama2 ...]
---

Usa el subagente integrator para integrar a la rama destino del proyecto (leela de
.claude/method.config):

$ARGUMENTS

Debe: decidir orden por dependencias; por cada rama lanzar code-reviewer y luego
qa-validator; mergear solo las que ambos aprueben generando la marca; rebasear
pendientes tras cada merge; reportar que entro, que se rechazo y por que.
Ante conflictos de logica de producto critica, detente y pregunta.
