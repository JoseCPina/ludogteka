# Dos máquinas con reparto fijo

Desde el 1 de noviembre de 2026 PeluDesk se trabaja en dos computadoras del dueño, cada una con su papel. Sustituye a «una sola instancia» (22 de octubre de 2026) y a «PC retirada». La historia de la nube y de los carriles A/B sigue en docs/nube.md.

## Cuál eres

Se decide por la RAM total, al empezar la sesión:

```
(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize/1MB
```

- **PC**: 8 GB.
- **Laptop**: 16 GB.

## La PC analiza y prepara

- Reproduce en producción, corre los scripts `*-prod.mjs` y los de plataforma, y encuentra la causa raíz.
- Escribe el fix y la auditoría que lo detecta.
- Hace commit en una rama `fix/<tema>` salida de `main` actualizado (`git fetch` y `git checkout -b fix/<tema> origin/main`) y la sube a GitHub.
- **No compila** (`npm run build`), **no corre auditorías que necesiten build** (las que levantan `next start`) y **no despliega**. Si la tarea exige build, deja todo listo en su rama y reporta que falta compilar, auditar y desplegar desde la laptop.

## La laptop compila, audita y despliega

- Es la única que corre `npm run build` y `npm run desplegar`.
- Para cerrar una rama `fix/<tema>` de la PC: la baja, la rebasa sobre `main`, mide la RAM, compila, corre las auditorías (incluidas las de pantalla, que dejan su sello para el despliegue: `celular-390-dev`, `ux-jerarquia-dev`, `ux-respuesta-dev`) y despliega con `npm run desplegar -- --revisar` y luego `-- --aplicar`, desde esa rama.
- Como solo despliega la laptop, nunca hay dos despliegues a la vez. La PC nunca corre `desplegar -- --aplicar`.

## Migraciones

Cada máquina crea las suyas con un timestamp posterior a la última migración que haya en `main` en ese momento, después de `git fetch`. Si al rebasar quedan dos con el mismo timestamp, la laptop renumera la suya (y si ya la había aplicado a desarrollo, corrige su registro en `supabase_migrations.schema_migrations` de desarrollo).

## Memoria y sesión

No se sincronizan entre máquinas: cada una guarda lo suyo. Lo que el dueño quiera en las dos, lo manda a las dos.
