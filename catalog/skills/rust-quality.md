---
# Auto-generado por init-claude
name: rust-quality
description: Rust idiomatico y seguro. Usar al escribir o revisar codigo Rust.
---
Errores: `Result<T, E>` con `?` para propagar; `thiserror` en librerias, `anyhow` en binarios. `unwrap`/`expect` solo en tests o invariantes documentadas con motivo. Nada de `panic!` en rutas normales.
Ownership: prefiere prestamos (`&`, `&mut`) a clonar; `clone()` solo cuando el coste esta justificado. `Cow` para "a veces poseido". Evita `Rc<RefCell>` salvo necesidad real.
Tipos: aprovecha el sistema — newtypes para unidades/IDs, enums para estados, `Option` en vez de centinelas. Derives (`Debug`, `Clone`, `PartialEq`) cuando aplique.
Async: no bloquees el runtime (`tokio`); nada de I/O sincrono en `async fn`. `Send`/`Sync` consciente.
Unsafe: evitalo; si es imprescindible, encapsula y documenta la invariante. Antes de entregar: `cargo clippy -- -D warnings` y `cargo fmt` limpios, tests verdes.
