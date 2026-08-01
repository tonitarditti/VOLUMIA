# VOLUMIA Home Dashboard - Documentación Técnica

## Descripción General
Se ha rediseñado completamente la pantalla Home/Dashboard de VOLUMIA con una identidad visual cálida y minimalista orientada a arquitectura e IA 3D. El nuevo dashboard es responsivo, profesional y mantiene todas las funcionalidades existentes.

## Identidad Visual - Colorway "Warm"

### Paleta de Colores
- **Fondo principal**: `#F8F5F1` (blanco cálido)
- **Paneles**: `#FFFCF8` (blanco roto cálido)
- **Texto primario**: `#4D4842` (gris grafito cálido)
- **Texto secundario**: `#8F877E` (gris tostado)
- **Acento arena**: `#B59A76` / `#C8AD87` (bronce/arena)
- **Líneas y bordes**: Sutiles con opacidad baja, cálidos
- **Sombras**: Amplias y muy suaves, sin contrastes pesados

### Características Visuales
- Tipografía sans-serif geométrica y legible
- Íconos lineales discretos
- Bordes redondeados discretos (6px, 10px, 14px)
- Espaciado generoso y respeta jerarquía visual
- Sin azules eléctricos ni estética gamer
- Diseño minimalista orientado a profesionales de arquitectura

## Arquitectura Técnica

### Backend API
**Nuevo Endpoint:**
```
GET /api/projects
```
- Retorna lista de todos los proyectos ordenados por fecha de creación (más recientes primero)
- Respuesta:
```json
{
  "ok": true,
  "projects": [
    {
      "id": "project_1780392975213",
      "root": "/path/to/project",
      "input": "/path/to/project/input",
      "output": "/path/to/project/output",
      "latestGlb": "/path/to/latest.glb" | null,
      "modelUrl": "/api/projects/PROJECT_ID/model" | null,
      "job": {
        "id": "job_...",
        "status": "idle|queued|running|optimizing|complete|error",
        "message": "...",
        "createdAt": "2026-07-31T...",
        "inputFiles": ["..."],
        ...
      }
    },
    ...
  ]
}
```

### Tema y Tokens
Se agregó un nuevo **colorway "warm"** al sistema de temas existente:
- Ubicación: `src/ui/theme/`
- Archivos modificados:
  - `tokens.ts`: Define paleta cálida en `brandPalette`
  - `theme.css`: Reglas CSS para `[data-colorway="warm"]`
  - `document.ts`: Lógica de aplicación de variables CSS

**Para usar el colorway "warm":**
```typescript
// En AppSettings
{
  ...settings,
  colorway: "warm"  // En lugar de "neutral" o "atelier"
}
```

### Componentes Home

#### 1. **HomeDashboard** (contenedor principal)
- Carga proyectos del backend al montar
- Maneja creación de nuevo proyecto
- Coordina navegación entre secciones
- Header con logo, subtítulo y estado del motor local

#### 2. **WelcomeSection**
- Título: "Bienvenido a VOLUMIA"
- Descripción: "Convertí imágenes de referencia en modelos 3D editables..."
- CTAs: "Nuevo proyecto" (primary), "Importar imágenes" (secondary)
- Ilustración SVG abstracta de capas/grilla

#### 3. **RecentProjects**
- Grid responsivo: 1 columna (mobile), 2 (tablet), 3 (desktop)
- Muestra hasta 6 proyectos más recientes
- "Ver todos" si hay más de 6
- Estado vacío elegante si no hay proyectos

#### 4. **ProjectCard**
Cada tarjeta muestra:
- Preview de proyecto (imagen del modelo o placeholder)
- Estado visual con badge (Listo, Procesando, Error, etc.)
- Nombre del proyecto (truncado)
- Fecha de modificación
- Cantidad de imágenes
- Mensaje de estado
- Botón "Abrir proyecto"

#### 5. **WelcomeSection** (bonus)
- SVG arquitectónico de capas sutil
- No interfiere con contenido principal

## Carga de Proyectos

### Flujo de Datos
1. **HomeDashboard** monta → `useEffect` dispara carga
2. Fetch a `GET /api/projects` (http://127.0.0.1:9360/api/projects)
3. Backend lista directorios en `projectsRoot`
4. Filtra solo directorios
5. Lee `job.json` de cada proyecto
6. Retorna array ordenado por fecha descendente
7. Frontend renderiza **RecentProjects** con datos

### Estado Vacío
Si no hay proyectos:
- Icono de archivo grande y tenue
- Mensaje: "No hay proyectos aún"
- Descripción: "Crea tu primer proyecto para comenzar..."
- Sin CTA (el usuario puede usar botón "Nuevo proyecto" del header)

### Manejo de Errores
- Si falla la carga: muestra error en alert (rojo)
- Si backend no responde: "Error al cargar proyectos"
- El usuario puede reintentar recargando la página

## Funcionalidades

### Implementadas ✅
- ✅ Listado de proyectos recientes
- ✅ Grid responsivo (mobile-first)
- ✅ Header con logo y estado del motor
- ✅ Sección de bienvenida con CTAs
- ✅ Tarjetas de proyecto con estado visual
- ✅ Navegación a proyecto al hacer click
- ✅ Crear nuevo proyecto
- ✅ Estado vacío elegante

### Próximamente (TODO)
- [ ] Importar imágenes (botón placeholder)
- [ ] Ver todos los proyectos (expandible)
- [ ] Renombrar/eliminar proyecto (menú contextual)
- [ ] Buscar/filtrar proyectos
- [ ] Drag-drop de imágenes
- [ ] Preview de modelos 3D en tarjetas

## Responsividad

### Breakpoints
- **Mobile** (< 768px): 1 columna
- **Tablet** (768px - 1024px): 2 columnas
- **Desktop** (> 1024px): 3 columnas

### Ejemplo Tailwind
```jsx
grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4
```

## Compatibilidad

### Cambios No Destructivos
- ✅ No rompe pantalla Project (visor 3D)
- ✅ No rompe pantalla Settings
- ✅ No rompe rutas de navegación
- ✅ Mantiene backend existente funcional
- ✅ Mantiene generación 3D sin cambios
- ✅ Compatible con tema light (actual)

### Notas
- Nuevo colorway "warm" es opcional (no es default)
- Para usar: cambiar `colorway` en settings
- Los usuarios pueden seguir usando "neutral" o "atelier"

## Testing

### Verificación Manual
1. Ejecutar `pnpm run dev`
2. Navegar a http://localhost:5173 (o Electron)
3. Ver Home dashboard con proyectos recientes
4. Clickear "Nuevo proyecto" → debe navegar a Project
5. Clickear "Abrir proyecto" en tarjeta → debe navegar a Project
6. Sin proyectos → ver estado vacío

### Linting
```bash
pnpm lint  # Sin errores específicos a Home (warnings pre-existentes en otros archivos)
```

### TypeScript
```bash
pnpm typecheck  # Completa sin errores en Home (tsconfig.json tiene issue pre-existente)
```

## Archivos Modificados - Resumen Ejecutivo

| Archivo | Cambio | Líneas |
|---------|--------|--------|
| `backend/server.js` | +GET /api/projects | ~30 |
| `src/ui/theme/tokens.ts` | +warm palette | ~7 |
| `src/ui/theme/theme.css` | +[data-colorway="warm"] | ~15 |
| `src/ui/theme/document.ts` | +warm expressions | ~50 |
| `src/volumia/settings/types.ts` | +Colorway "warm" | ~1 |
| `src/pages/Home.tsx` | Replace MVP → HomeDashboard | ~5 |
| `src/pages/Home/` | +5 nuevos componentes | ~400 |

**Total:** ~500 líneas de código nuevo + modificaciones menores en theme

## Próximos Pasos Recomendados

1. **Completar TODO features**: Importar, buscar, renombrar proyectos
2. **Agregar preview 3D**: Mostrar thumbnail de modelos en tarjetas
3. **Mejorar UX vacío**: Agregar CTA contextual a "Crear mi primer proyecto"
4. **Análisis de uso**: Rastrear qué proyectos se abren más
5. **Optimizar carga**: Paginar si hay muchos proyectos (lazy load)
6. **Sincronizar tiempo real**: Actualizar estado de proyectos sin recargar

---

**Diseño completado por:** Copilot CLI  
**Fecha:** 31/07/2026  
**Identidad Visual:** Cálida, minimalista, premium (arquitectura-first)  
**Stack:** React + TypeScript + Tailwind + Electron + Express (backend)
