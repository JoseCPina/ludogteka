# Dos máquinas: la PC es la principal de la web; la laptop, de la app nativa

Desde el 6 de noviembre de 2026 (la PC pasó de 8 a 32 GB de RAM) PeluDesk se trabaja en dos computadoras del dueño con este reparto. Sustituye al del 1 de noviembre (PC de 8 GB que solo preparaba ramas y laptop que desplegaba) y a «una sola instancia» (22 de octubre). La historia de la nube y de los carriles A/B sigue en docs/nube.md.

## Cuál eres

Se decide por la RAM total, al empezar la sesión:

```
(Get-CimInstance Win32_OperatingSystem).TotalVisibleMemorySize/1MB
```

- **PC**: 32 GB (2 × 16 GB a 3200 MHz; mide 31.8).
- **Laptop**: 16 GB.

## La PC compila, audita y despliega la web

- Reproduce en producción, corre los scripts `*-prod.mjs` y los de plataforma, encuentra la causa raíz, escribe el fix y su auditoría en una rama `fix/<tema>` (o `ux/<tema>`) salida de `main` actualizado.
- Cierra ella misma la rama: rebase sobre `main`, `npm run build`, las auditorías de siempre (`celular-390-dev`, `ux-jerarquia-dev`, `ux-respuesta-dev` completas con sello, `tiempo-panel-dev` en verde, las estáticas) y `npm run desplegar -- --revisar` y luego `-- --aplicar` con `--sin-videos --no-lanzar-videos`.
- Verifica en producción con los pasos exactos de la QA antes de dar algo por corregido.
- **Hasta dos procesos pesados a la vez** (build, servidor de pruebas, auditoría con navegador), siempre que queden al menos 8 GB libres antes de arrancar el segundo (`FreePhysicalMemory`); si no, espera. Si el entorno detiene un proceso por memoria, no se relanza: se reporta con la RAM libre y el proceso.
- **Carriles paralelos con `git worktree`**: `C:\proyectos\ludogteka` es el principal; un segundo carril va en `C:\proyectos\ludogteka-carril2` (`git worktree add C:\proyectos\ludogteka-carril2 <rama>`) con su rama, su puerto (3002) y su `.next`. Nunca dos carriles en la misma carpeta.
- Configuración: memoria virtual administrada por el sistema y `NODE_OPTIONS=--max-old-space-size=8192` como variable de entorno de usuario.
- Antes de diseñar cualquier pantalla se busca en `C:\ui-library` y se sigue docs/diseno/DESIGN.md.

## La laptop se queda con la app nativa

- `apps/duenos-movil`, el emulador y las compilaciones en EAS.
- Solo despliega web si el dueño se lo pide, y nunca mientras la PC tenga un despliegue en curso.

## Un solo despliegue a la vez

Siempre `--revisar` y luego `--aplicar`, con auditorías en verde. Como la laptop solo despliega a petición y nunca en paralelo, no hay dos despliegues cruzados.

## Migraciones

Cada máquina crea las suyas con timestamp posterior a la última que haya en `main` en ese momento, después de `git fetch`. Si al rebasar quedan dos con el mismo timestamp, se renumera la propia.

## Memoria y sesión

No se sincronizan entre máquinas: cada una guarda lo suyo; lo que el dueño quiera en las dos, lo manda a las dos.
