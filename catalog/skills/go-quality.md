---
# Auto-generado por init-claude
name: go-quality
description: Go idiomatico y robusto. Usar al escribir o revisar codigo Go.
---
Errores: devuelve `error` como ultimo valor, comprueba SIEMPRE (`if err != nil`). Envuelve con contexto: `fmt.Errorf("accion: %w", err)`. Errores centinela con `errors.Is`, tipos con `errors.As`. No `panic` en libreria.
Context: `context.Context` como primer parametro en operaciones con I/O/red; propaga cancelacion y deadlines. Nunca lo guardes en structs.
Concurrencia: una goroutine que arrancas, debes saber cuando termina. Cierra channels desde el emisor. `sync.WaitGroup`/`errgroup`. Protege estado compartido (mutex) o no lo compartas. Corre tests con `-race`.
Estilo: nombres cortos en scope corto, interfaces pequeñas (definidas por el consumidor), acepta interfaces y devuelve structs. Sin getters triviales. `defer` para cierre de recursos.
Antes de entregar: `go vet` + `golangci-lint` limpios, `gofmt` aplicado, tests con `-race` verdes.
