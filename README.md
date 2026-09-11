# Importador de Asientos SAGE X3 (Electro Universo)

Sitio estático (HTML/CSS/JS, sin backend) para importar asientos de ajuste a SAGE X3 mediante el modelo Import/Export **ZXARGGAS**.

Permite subir un Excel con los asientos, valida los datos y genera el archivo de texto en el formato que SAGE espera para importarlos (líneas `A`/`B`, delimitado por `;`).

## Alcance

- Asientos de ajuste tipo GL-a-GL (sin tercero/BPR — esas líneas se exportan con `SAC`/`BPR` vacíos, como prueba).
- Validación contra el plan de cuentas real de Electro Universo (267 cuentas, sin exponer nombres/descripciones — solo códigos).
- Determinación automática de ledgers/plan contable por el primer dígito del código de cuenta.

El detalle completo del formato de entrada/salida está en [`Guia_Interpretacion_Input_Output_SAGE_ZXARGGAS.docx`](./Guia_Interpretacion_Input_Output_SAGE_ZXARGGAS.docx).

## Stack

HTML + CSS + JavaScript vanilla, sin build step para el sitio publicado. SheetJS (vendorizado) para leer el Excel, Tailwind CSS para estilos, Lucide para íconos. Tests con Vitest sobre los módulos de lógica pura.

## Estructura (planificada)

```
docs/                     # sitio publicado en GitHub Pages
  index.html
  src/                    # parser.js, validator.js, ledger-rules.js, catalog.js, sage-line-builder.js, ui.js
  vendor/                 # xlsx.full.min.js
  data/                   # chart-of-accounts.json
scripts/                  # generate-catalog.mjs (dev-time, genera el JSON desde el plan de cuentas)
test/                     # tests Vitest de los módulos de lógica pura
sage/                     # material de referencia (mails, muestras reales de SAGE, plan de cuentas)
```

## Desarrollo

Proyecto en construcción vía SDD (Spec-Driven Development). El detalle de decisiones de diseño y reglas de negocio vive en Engram, no en este archivo.

## Nota sobre datos sensibles

La carpeta `sage/` (mails, exports reales de SAGE, plan de cuentas completo) y la guía `.docx` contienen datos reales de Electro Universo y están **excluidos del repo** (`.gitignore`) porque este repo es público (requisito de GitHub Pages gratis). Existen solo en el entorno local de desarrollo — se usan para generar `data/chart-of-accounts.json` (que sí se publica, sin descripciones ni datos sensibles) pero nunca se suben al repo.
