---
# Auto-generado por init-claude
name: python-quality
description: Estandares de calidad Python. Usar al crear o modificar codigo Python.
---
Type hints: firmas publicas SIEMPRE tipadas. Python 3.10+: X | None, list[str]. TypedDict/dataclass/pydantic para estructuras.
Estructura: funciones <50 lineas, early returns, excepciones especificas (NUNCA except pelado), pathlib, f-strings.
Dependencias: pyproject.toml como fuente de verdad, versiones con limite.
Herramientas: ruff antes de entregar. mypy/pyright si el proyecto los tiene.
Async: no mezclar sync/async sin razon. asyncio.gather para tareas independientes.
