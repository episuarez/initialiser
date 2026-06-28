---
# Auto-generado por init-claude
name: refactoring-safe
description: Refactor seguro sin romper comportamiento. Usar en codebases grandes o legacy.
---
Refactor = cambiar estructura SIN cambiar comportamiento. Nunca mezcles refactor y feature en el mismo commit: separa "prepara" de "cambia".
Red de seguridad primero: si no hay tests del area, escribe tests de caracterizacion (capturan lo que hace HOY, aunque sea raro) antes de tocar. Sin red -> no refactorices a ciegas.
Pasos pequeños y reversibles: un cambio, tests verdes, commit; repite. Apoyate en refactors automaticos del IDE (rename, extract) que preservan semantica. Si los tests tardan mucho en volver a verde, el paso era demasiado grande: revierte y trocea.
Mejora oportunista (regla del boy scout) en el codigo que ya tocas, sin expandir el alcance. Elimina codigo muerto y duplicacion real (no abstraigas por 2 usos).
Antes de entregar: diff revisado, comportamiento identico, suite verde. Si algo cambia de comportamiento, ya no es refactor: documentalo.
