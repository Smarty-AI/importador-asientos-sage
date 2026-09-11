# Importador de Asientos SAGE X3 (Electro Universo)

Sitio estático (HTML/CSS/JS, sin backend) para importar asientos de ajuste a SAGE X3 mediante el modelo Import/Export **ZXARGGAS**.

Permite subir un Excel con los asientos, valida los datos y genera el archivo de texto en el formato que SAGE espera para importarlos (líneas `A`/`B`, delimitado por `;`).

## Alcance

- Asientos de ajuste tipo GL-a-GL (sin tercero/BPR — esas líneas se exportan con `SAC`/`BPR` vacíos, como prueba).
- Validación contra el plan de cuentas real de Electro Universo (267 cuentas, sin exponer nombres/descripciones — solo códigos).
- Determinación automática de ledgers/plan contable por el primer dígito del código de cuenta.

## Stack

HTML + CSS + JavaScript vanilla, sin build step para el sitio publicado. SheetJS (vendorizado) para leer el Excel, Tailwind CSS para estilos, Lucide para íconos. Tests con Vitest sobre los módulos de lógica pura.

## Estructura

```
docs/                     # sitio publicado en GitHub Pages
  index.html
  src/                    # parser.js, validator.js, ledger-rules.js, catalog.js, sage-line-builder.js, ui.js
  vendor/                 # xlsx.full.min.js (SheetJS vendorizado)
  data/                   # chart-of-accounts.json (generado, sin descripciones)
  .nojekyll               # deshabilita el procesamiento Jekyll de GitHub Pages
scripts/                  # generate-catalog.mjs + catalog-transform.mjs (dev-time, genera el JSON desde el plan de cuentas)
test/                     # tests Vitest de los módulos de lógica pura
sage/                     # material de referencia (mails, muestras reales de SAGE, plan de cuentas) — gitignored
```

## Desarrollo

Proyecto construido vía SDD (Spec-Driven Development). El detalle de decisiones de diseño y reglas de negocio vive en Engram, no en este archivo.

### Instalar dependencias (dev-only)

```
npm install
```

### Correr los tests

```
npm test
```

### Regenerar el catálogo de cuentas

Requiere `sage/Plan de cuentas EU.xlsx` presente localmente (no está en el repo):

```
npm run generate-catalog
```

## Deploy en GitHub Pages

1. Confirmar que el repo es público (requisito de GitHub Pages gratis) y que `sage/` NO está trackeada (ver nota abajo).
2. En GitHub: **Settings → Pages**.
3. En **Source**, elegir **Deploy from a branch**.
4. Elegir la rama `main` y la carpeta `/docs`.
5. Guardar. El sitio queda publicado en `https://<usuario>.github.io/<repo>/` en un par de minutos.
6. Cualquier `git push` a `main` que toque `docs/` actualiza el sitio automáticamente (sin build step, sin CI).

## Nota sobre datos sensibles

La carpeta `sage/` contiene material de referencia interno de Electro Universo y está **excluida del repo** (`.gitignore`) porque este repo es público (requisito de GitHub Pages gratis). Existe solo en el entorno local de desarrollo — se usa para generar `data/chart-of-accounts.json` (que sí se publica, sin descripciones ni datos sensibles) pero nunca se sube al repo.
