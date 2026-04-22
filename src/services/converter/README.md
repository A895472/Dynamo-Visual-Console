# Convertidor de Reglas JSON

Aplicación web SPA que convierte reglas en formato texto plano (sintaxis tipo SQL) a JSON estructurado compatible con el motor de reglas Dynamo para enrutamiento/filtrado de eventos de envíos postales, y viceversa.

## Estructura del Proyecto

```
ConvertidorReglasJson/
├── index.html                  # Página principal
├── css/
│   └── styles.css              # Estilos de la aplicación
├── js/
│   ├── bundle.js               # Aplicación completa (todo-en-uno, sin dependencias)
│   ├── app.js                  # [Fuente modular] Lógica principal de la UI
│   └── parser/
│       ├── tokenizer.js        # [Fuente modular] Análisis léxico
│       ├── parser.js           # [Fuente modular] Parser de expresiones (AST)
│       ├── generator.js        # [Fuente modular] Generador JSON Dynamo
│       ├── reverser.js         # [Fuente modular] Conversor inverso (JSON → texto)
│       └── validator.js        # [Fuente modular] Validador de esquema
├── tests/
│   ├── test-runner.html        # Página de ejecución de tests
│   └── tests.js                # Tests unitarios
└── README.md
```

## Cómo Usar

Abre `index.html` directamente en el navegador con doble clic. No requiere servidor ni instalación.

### Despliegue para equipos

| Método | Descripción |
|--------|-------------|
| **Carpeta compartida** | Copia la carpeta a una unidad de red y comparte el enlace a `index.html` |
| **GitHub Pages** | Sube a un repositorio y activa Pages en Settings > Pages |
| **SharePoint / OneDrive** | Sube la carpeta y comparte el enlace |
| **ZIP** | Comprime y envía por correo/Teams; descomprimir y abrir `index.html` |

## Funcionalidades

### Convertidor (Texto → JSON)
- Escribe o pega reglas en formato texto plano
- Autocompletado de campos conocidos del payload
- Genera JSON Dynamo con syntax highlighting
- Copiar al portapapeles / descargar JSON generado
- Atajo: `Ctrl+Enter` para convertir

### Importar JSON (JSON → Texto)
- Pega un JSON de regla Dynamo o carga un archivo `.json`
- Convierte de vuelta a expresión de texto legible
- Colapsa cadenas de OR en cláusulas `IN` automáticamente
- Copiar la regla de texto al portapapeles

### Historial
- Guarda automáticamente las últimas 50 conversiones (localStorage)
- Reutiliza reglas anteriores con un clic
- Elimina entradas individuales o todo el historial
- Persiste al cerrar el navegador

## Sintaxis Soportada

### Operadores de comparación
| Operador | Descripción |
|----------|-------------|
| `=`      | Igual a |
| `!=`     | Diferente de |
| `>`      | Mayor que |
| `<`      | Menor que |
| `>=`     | Mayor o igual que |
| `<=`     | Menor o igual que |

### Operadores de lista
| Operador   | Descripción |
|------------|-------------|
| `IN`       | Incluido en la lista |
| `NOT IN`   | No incluido en la lista |

### Operadores de contención
| Operador       | Descripción |
|----------------|-------------|
| `CONTAINS`     | Contiene el valor |
| `NOT CONTAINS` | No contiene el valor |

### Operadores lógicos
- `AND` — Y lógico (asociatividad derecha para coincidir con Dynamo)
- `OR` — O lógico (asociatividad derecha para coincidir con Dynamo)
- Paréntesis `()` para agrupar

### Tipos de valores
- Números: `42`, `3.14`
- Strings: `'texto'` o `"texto"`
- Booleanos: `true`, `false`

### Campos verificados en producción

| Campo | Ruta completa | Tipo |
|-------|--------------|------|
| codaplicacion | `payload.mensaje.envio.codaplicacion` | Int |
| codevento | `payload.mensaje.envio.eventosenvio.evento.codevento` | Int / String |
| tipoServicio | `payload.mensaje.servicio.tipoServicio` | String |
| tipoagrupacion | `payload.mensaje.agrupacion.eventosAgrupacion.evento.tipoagrupacion` | String |
| consumer_queue | `header.consumer_queue` | String |
| source_topic | `header.source_topic` | String |

### Ejemplo

```
payload.mensaje.envio.codaplicacion IN (1, 22, 36) AND payload.mensaje.envio.eventosenvio.evento.codevento IN ('AA', 'BA')
```

## Tests

Abre `tests/test-runner.html` directamente en el navegador con doble clic.

## Stack Tecnológico

- HTML5 + CSS3 + JavaScript ES6 (vanilla)
- Tipografías: DM Sans + JetBrains Mono (Google Fonts)
- Sin dependencias externas ni frameworks
- Sin backend — toda la lógica es client-side
- Almacenamiento local via localStorage
