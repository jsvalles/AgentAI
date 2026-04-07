# 🤖 Preguntas Analíticas con IA - Ejemplos

## ⚙️ Configuración Actual

- **Modelo:** claude-3-haiku-20240307
- **Estado:** ✅ ACTIVADO
- **Uso:** SOLO para análisis de datos (conteos, estadísticas, tendencias)

## 🎯 Cuándo se USA la IA vs. Cuándo NO

### ✅ LA IA SE USA PARA:
- **Análisis de datos numéricos** (conteos, sumas, promedios)
- **Estadísticas y métricas** (porcentajes, distribuciones, rankings)
- **Tendencias temporales** (evolución por mes, comparativas)
- **Agrupaciones complejas** (top N, agregaciones múltiples)

**Ejemplos:**
- "¿Cuántos casos fueron cerrados en octubre de 2025?"
- "¿Cuáles son los temas con mayor número de casos?"
- "¿Quién es el analista que más casos cerró?"
- "Dame estadísticas por especialista"
- "Productividad de analistas en el último mes"

### ❌ LA IA NO SE USA PARA:
- **Preguntas de conocimiento** (cómo hacer algo, procedimientos)
- **Búsqueda de documentación** (guías, manuales, videos)
- **FAQs de Confluence** (preguntas frecuentes ya respondidas)
- **Casos históricos similares** (soluciones ya documentadas)

**Ejemplos:**
- "¿Cómo crear un medidor en C2M?" → Muestra directamente la respuesta de Confluence (puede incluir video 🎥)
- "¿Cómo buscar una pieza en CPQ?" → Muestra documentación existente
- "¿Cómo marcar un segmento de factura?" → Muestra procedimiento guardado
- "Error al crear dispositivo" → Muestra soluciones históricas

**Comportamiento:**
- Si hay resultados en Confluence/Excel → **Muestra directamente** (sin IA)
- Si hay un video (.mp4, .webm, etc.) → **Enlace clickeable** 🎥
- Si es pregunta de análisis numérico → **Usa IA** para procesar datos

## 🎥 Videos Clickeables en Confluence

Cuando una respuesta de Confluence contiene un archivo de video, ahora se muestra como enlace directo:

**Antes:**
```
✅ Crear_Medidor_Configur_Compon.mp4
```

**Ahora:**
```
✅ 🎥 Crear_Medidor_Configur_Compon.mp4 (clickeable)
```

**Extensiones soportadas:**
- .mp4, .webm, .avi, .mov, .mkv, .flv, .wmv, .m4v

---

## ✅ Ya Implementado

Ahora puedes hacer preguntas analíticas sobre tus datos de Excel y Claude AI las responderá automáticamente.

---

## 📊 Ejemplos de Preguntas Analíticas

### 1. **Análisis por Temas/Asuntos**

```
✅ "¿Cuáles son los temas con mayor número de casos registrados?"
✅ "Muéstrame los asuntos más frecuentes"
✅ "¿Qué problemas son más comunes?"
✅ "Dame el top 10 de temas reportados"
✅ "¿Cuáles son los casos más reportados?"
```

**Claude analizará:**
- Contará casos por asunto
- Ordenará de mayor a menor
- Te mostrará el top 10-15 con porcentajes
- Identificará patrones y tendencias

---

### 2. **Filtrar por Funcionalidad Comercial**

```
✅ "¿Cuál es la funcionalidad comercial con más casos?"
✅ "Muéstrame casos agrupados por funcionalidad comercial"
✅ "¿Qué funcionalidad tiene más incidencias?"
✅ "Dame las funcionalidades comerciales más problemáticas"
```

**Claude analizará:**
- Agrupará casos por funcionalidad comercial
- Identificará las más críticas
- Calculará porcentajes
- Sugerirá áreas de mejora

---

### 3. **Análisis por Estados**

```
✅ "¿Cuántos casos hay por estado?"
✅ "Muéstrame la distribución de estados"
✅ "¿Qué estados tienen más casos?"
✅ "Dame estadísticas por estado"
```

**Claude mostrará:**
- Casos pendientes, cerrados, activos, etc.
- Porcentajes de cada estado
- Recomendaciones si hay cuellos de botella

---

### 4. **Análisis por Especialistas/Analistas**

```
✅ "¿Quién atiende más casos?"
✅ "Dame el ranking de especialistas"
✅ "¿Qué analista tiene más casos asignados?"
✅ "Muéstrame casos por especialista"
✅ "¿Quién es el analista que más casos atendió?"
✅ "¿Quién cerró más casos?"
✅ "¿Qué especialista tiene más casos abiertos?"
✅ "Analista con más casos en espera por usuario"
✅ "Casos pendientes por cliente por analista"
✅ "¿Quién tiene más casos que requieren cambio?"
✅ "Productividad de analistas en octubre"
✅ "Top 5 analistas con mejor tiempo de resolución"
```

**La IA analizará:**
- Top 10 especialistas con más casos (total, abiertos, cerrados)
- Distribución de carga de trabajo por analista
- Casos por estado específico (asignados, en espera, pendientes)
- Identificará desequilibrios en asignación
- Métricas de productividad (casos cerrados, tiempo promedio)
- Casos bloqueados o en estados críticos por analista

---

### 5. **Análisis por Aplicaciones/Sistemas**

```
✅ "¿Qué aplicación tiene más casos?"
✅ "Muéstrame casos por sistema"
✅ "¿C2M, Field, Sales o Service tiene más incidencias?"
✅ "Dame estadísticas por aplicación"
```

**Claude identificará:**
- Aplicaciones con más problemas
- Tendencias por sistema
- Áreas que necesitan más atención

---

### 6. **Preguntas Combinadas**

```
✅ "¿Cuáles son los temas más frecuentes en estado pendiente por cliente?"
✅ "Muéstrame los 5 especialistas con más casos en C2M"
✅ "¿Qué funcionalidad comercial genera más casos cerrados?"
```

---

### 7. **Análisis Temporal (Fechas y Periodos)** 🆕

```
✅ "¿Cuántos casos fueron cerrados en octubre de 2025?"
✅ "Muéstrame casos creados en enero de 2026"
✅ "¿Cuántos casos se registraron durante 2025?"
✅ "Dame estadísticas de casos por mes"
✅ "¿Qué mes tuvo más casos reportados?"
✅ "Muéstrame la evolución de casos en el último año"
✅ "¿Cuántos casos están abiertos desde noviembre?"
✅ "Casos cerrados en diciembre 2025 por especialista"
```

**La IA analizará:**
- Filtrará por fechas específicas (mes/año)
- Agrupará por periodos (mes, trimestre, año)
- Identificará tendencias temporales
- Comparará periodos (mes actual vs anterior)
- Calculará promedios por periodo

---

## 🎯 Cómo Funciona

1. **Escribes la pregunta** (cualquiera de los ejemplos de arriba)

2. **El sistema detecta que es analítica** automáticamente

3. **Muestra "🤖 AI-Assisted Support Agent está analizando..."** con spinner

4. **La IA procesa los datos:**
   - Lee el archivo Excel
   - Agrupa y cuenta según tu pregunta
   - Ordena por relevancia
   - Genera insights y análisis

5. **Recibes respuesta estructurada con:**
   - Top X resultados con números
   - Porcentajes
   - Patrones identificados
   - Recomendaciones

---

## 📋 Ejemplos Completos

### Ejemplo 1: Análisis de Temas

**Usuario:**
```
¿Cuáles son los temas con mayor número de casos registrados?
```

**Sistema:**
```
🔍 Analizando datos con inteligencia artificial...
🤖 AI-Assisted Support Agent está analizando...
```

**IA responde:**
```
🤖 Análisis IA

Basándome en el análisis de 1,247 casos registrados, estos son los 
temas con mayor incidencia:

📊 TOP 10 TEMAS MÁS REPORTADOS:

1. **Error de facturación** - 156 casos (12.5%)
   - Principalmente relacionado con cálculos incorrectos

2. **Problemas con medidores** - 134 casos (10.7%)
   - Mayor incidencia en lecturas fallidas

3. **Creación de órdenes de trabajo** - 98 casos (7.9%)
   - Errores en validación de campos

4. **Migración de datos** - 87 casos (7.0%)
   - Problemas de integridad en importación

5. **Actualización de cuentas** - 76 casos (6.1%)
   - Principalmente permisos insuficientes

[... continúa hasta el top 10 ...]

💡 INSIGHTS:
- El 30% de los casos se concentran en los 3 primeros temas
- Facturación representa el mayor desafío operativo
- Se recomienda mejorar documentación en estos 3 temas

¿Quieres ver algún tema específico en detalle?
```

---

## 📋 Ejemplo Completo - Análisis Temporal

**Usuario:**
```
¿Cuántos casos fueron cerrados en octubre de 2025?
```

**Sistema:**
```
🔍 Analizando datos con inteligencia artificial...
🤖 AI-Assisted Support Agent está analizando...
```

**IA responde:**
```
🤖 Análisis IA

Análisis de casos cerrados en **Octubre 2025**:

📊 RESUMEN MENSUAL:

**Total de casos cerrados:** 87 casos

📈 DISTRIBUCIÓN SEMANAL:
• Semana 1 (1-7 oct):   23 casos (26.4%)
• Semana 2 (8-14 oct):  19 casos (21.8%)
• Semana 3 (15-21 oct): 28 casos (32.2%) ← Pico
• Semana 4 (22-31 oct): 17 casos (19.5%)

🏆 TOP 5 TEMAS RESUELTOS EN OCTUBRE:
1. Error de facturación - 18 casos
2. Problemas medidores - 15 casos
3. Creación OT - 12 casos
4. Actualización cuentas - 10 casos
5. Migración datos - 8 casos

👥 ESPECIALISTAS MÁS PRODUCTIVOS:
1. María García - 23 casos cerrados
2. Juan López - 19 casos cerrados
3. Ana Martínez - 15 casos cerrados

⏱️ TIEMPO PROMEDIO DE RESOLUCIÓN:
• 4.2 días (vs 5.1 días en septiembre)
• Mejora del 18% respecto al mes anterior

💡 INSIGHTS:
- Octubre mostró una mejora significativa en tiempos de resolución
- La semana 3 tuvo el pico más alto (posiblemente por backlog)
- Los temas de facturación siguen siendo los más frecuentes
- Se recomienda mantener el ritmo de cierre actual

📊 COMPARATIVA:
• Septiembre 2025: 76 casos cerrados
• Octubre 2025: 87 casos cerrados (+14.5%)
• Noviembre (proyección): ~90 casos

¿Quieres ver el detalle de algún especialista o tema específico?
```

---

### Ejemplo 3: Productividad de Analistas

**Usuario:**
```
¿Quién es el analista que más casos cerró en octubre de 2025?
```

**IA responde:**
```
🤖 Análisis IA

📊 ANÁLISIS DE PRODUCTIVIDAD DE ANALISTAS - OCTUBRE 2025

🏆 TOP 5 ANALISTAS QUE MÁS CERRARON CASOS:

1. **Juan Pérez** - 47 casos cerrados
   • Especialidad: SAPF
   • Tiempo promedio resolución: 2.3 días
   • Tasa de reapertura: 4%
   • Satisfacción cliente: 4.5/5 ⭐

2. **María García** - 42 casos cerrados
   • Especialidad: SAPP
   • Tiempo promedio resolución: 1.8 días ⚡
   • Tasa de reapertura: 3%
   • Satisfacción cliente: 4.7/5 ⭐

3. **Carlos Rodríguez** - 38 casos cerrados
   • Especialidad: SAP BPC
   • Tiempo promedio resolución: 3.1 días
   • Tasa de reapertura: 6%
   • Satisfacción cliente: 4.4/5 ⭐

4. **Ana Martínez** - 35 casos cerrados
   • Especialidad: Interfaces
   • Tiempo promedio resolución: 2.6 días
   • Tasa de reapertura: 5%
   • Satisfacción cliente: 4.6/5 ⭐

5. **Luis Fernández** - 32 casos cerrados
   • Especialidad: Reportes
   • Tiempo promedio resolución: 1.9 días
   • Tasa de reapertura: 4%
   • Satisfacción cliente: 4.5/5 ⭐

📈 MÉTRICAS GENERALES:
• Total casos cerrados octubre: 287
• Promedio por analista: 23.9 casos
• Tiempo promedio resolución: 2.5 días
• Tasa resolución primer contacto: 64%
• Satisfacción general: 4.5/5

🎯 DISTRIBUCIÓN DE CARGA ACTUAL:
• Casos asignados activos: 143 casos
• Casos en espera por usuario: 89 casos
• Casos requieren cambio: 23 casos
• Casos pendientes por cliente: 67 casos

💡 INSIGHTS:
✅ María García destaca por eficiencia (1.8 días + alta satisfacción)
✅ Juan Pérez es el más productivo pero podría optimizar tiempos
⚠️ Carlos Rodríguez tiene mayor tasa de reapertura (6%) - revisar calidad
✅ Distribución de carga es balanceada entre el equipo
📊 El equipo superó el objetivo mensual (250 casos) en un 15%

🎖️ RECONOCIMIENTOS:
• 🥇 Más productivo: Juan Pérez (47 casos)
• ⚡ Más eficiente: María García (1.8 días promedio)
• ⭐ Mejor satisfacción: María García (4.7/5)
```

---

## 🎯 Cómo Funciona con Fechas

La IA puede entender diferentes formatos de fecha:

**Formatos soportados:**
- ✅ "octubre de 2025"
- ✅ "en enero"
- ✅ "durante 2025"
- ✅ "mes de diciembre"
- ✅ "año 2024"
- ✅ "el último mes"
- ✅ "este año"

**Columnas de fecha que busca:**
- Fecha de creación
- Fecha de cierre
- Fecha de modificación
- Fecha de registro
- Último cambio

**Análisis automático:**
1. Detecta el periodo mencionado
2. Filtra casos en ese rango
3. Agrupa por semanas/días si es necesario
4. Compara con periodos anteriores
5. Genera insights y tendencias

---

## ⚙️ Configuración Actual

- **Modelo:** claude-3-5-sonnet-20241022
- **Estado:** ✅ ACTIVADO
- **Límites:** Top 15 para asuntos, Top 10 para otros análisis
- **Automático:** No necesitas presionar botones

---

## 🔄 Opciones Después del Análisis

Después de cada análisis, puedes:
- **📋 Ver datos completos** - Abre el análisis detallado de Excel
- **🔄 Otra consulta** - Hacer una nueva pregunta analítica
- **✅ Finalizar** - Volver al menú principal

---

## 💡 Tips

1. **Sé específico:** "casos por estado" es mejor que solo "casos"
2. **Usa palabras clave:** mayor, más, top, ranking, cuántos, distribución
3. **Combina filtros:** "temas en estado cerrado", "especialistas en C2M"
4. **Pregunta en español:** El sistema está optimizado para español
5. **Análisis temporal:** Menciona mes/año específico: "octubre 2025", "durante 2024"
6. **Combina fecha con otros filtros:** "casos cerrados en enero por especialista"

---

## 🚀 Próximos Pasos

Puedes probar ahora:
1. Abre el chatbot: http://localhost:3000
2. Escribe cualquiera de los ejemplos de arriba (incluyendo con fechas)
3. Observa cómo la IA analiza automáticamente
4. Recibe insights inteligentes con contexto temporal

**Ejemplos rápidos para probar:**
```
• "¿Cuáles son los temas con mayor número de casos?"
• "¿Cuántos casos fueron cerrados en octubre de 2025?"
• "¿Quién es el analista que más casos cerró?"
• "¿Qué analista tiene más casos asignados actualmente?"
• "Casos registrados durante 2025 por funcionalidad"
• "Productividad de analistas en el último mes"
```

---

## ⚠️ Notas

- Los datos deben estar en formato Excel (.xlsx) en la carpeta `chatbox-server/data/`
- El sistema lee automáticamente el primer archivo disponible
- Las columnas deben tener nombres claros (Estado, Asunto, Especialista, **Fecha de creación**, **Fecha de cierre**, etc.)
- Para análisis temporal, asegúrate de que las columnas de fecha estén en formato válido (DD/MM/YYYY o similar)
- Si no detecta una columna, te lo indicará

---

¿Listo para probar? 🎉
