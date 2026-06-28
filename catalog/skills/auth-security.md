---
# Auto-generado por init-claude
name: auth-security
description: Autenticacion y autorizacion seguras. Usar al implementar login, sesiones o permisos.
---
Passwords: hash con argon2id o bcrypt (cost adecuado), nunca cifrado reversible ni hash rapido (md5/sha). Sal por usuario (la da la libreria). Politica de longitud, no de complejidad arbitraria.
Sesiones: cookie `HttpOnly`, `Secure`, `SameSite=Lax/Strict`; rota el id al elevar privilegios; expira e invalida en logout server-side. JWT solo si entiendes el trade-off: corta vida + refresh rotatorio, valida `alg` (no `none`), guarda el secreto fuera del codigo.
Autorizacion en cada request, server-side, por recurso (no confies en ocultar UI). Deny by default. Comprueba ownership (IDOR): que el recurso pertenezca al usuario.
Protege: rate-limit + backoff en login, lockout/captcha ante fuerza bruta, CSRF token en mutaciones con cookies, no filtres si el usuario existe (mensajes genericos). MFA para cuentas sensibles.
Nunca loguees tokens/passwords. Reset por token de un solo uso, caducable.
