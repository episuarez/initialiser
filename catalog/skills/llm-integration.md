---
# Auto-generado por init-claude
name: llm-integration
description: Integrar LLMs en producto de forma robusta y barata. Usar en features de IA.
---
Trata el LLM como dependencia externa no determinista: timeouts, reintentos con backoff, fallback y limites de gasto. Nunca confies ciegamente en su salida — valida/parsea (esquema/JSON mode) y maneja el caso "respondio mal".
Prompts: instrucciones claras y estructuradas, separa system (rol/reglas) de input de usuario. Salida estructurada via tool use / structured output, no parseando prosa. Da ejemplos (few-shot) si sube la fiabilidad.
Seguridad: la entrada de usuario NO es instruccion (prompt injection) — delimita, no concatenes a ciegas, no des herramientas/datos sensibles sin control. Nunca metas secretos en el prompt. Filtra PII.
Coste/latencia: usa el modelo mas pequeño que cumpla, cachea respuestas e usa prompt caching, streaming para UX, acota `max_tokens`, batch lo posible. Mide tokens y $ por feature.
Calidad: evalua con un set fijo (no vibes), mide regresiones al cambiar prompt/modelo. Logea prompts/outputs (sin secretos) para depurar. Usa el modelo Claude mas capaz disponible por defecto.
