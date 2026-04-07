# 📄 Integración PDF de Oracle - Documentación Técnica

## 🎯 Objetivo

Permitir que el chatbot **extraiga información del manual oficial de Oracle Utilities C2M** (en inglés) y la traduzca automáticamente al español antes de mostrarla al usuario.

---

## 📚 ¿Qué se implementó?

### 1. **Instalación de `pdf-parse`**
- Librería Node.js para extraer texto de documentos PDF
- Instalada vía: `npm install pdf-parse`

### 2. **Nuevo Endpoint Backend: `/api/pdf/search`**

**Ubicación:** `chatbox-server/server.js` (líneas ~3640-3960)

**Funcionamiento:**
1. **Carga el PDF:** Lee `C2M_Business_User_Guide_v2_8_0_0.pdf` de la carpeta `data/`
2. **Divide en secciones:** Separa el documento por capítulos o bloques de ~1000 palabras
3. **Búsqueda inteligente con IA:** Usa GROQ LLaMA 3.3 70B para:
   - Extraer keywords en inglés de la pregunta del usuario
   - Buscar secciones relevantes en el PDF
   - Ordenar por relevancia (scoring)
4. **Traducción y síntesis:** Usa GROQ para:
   - Leer las secciones relevantes (en inglés)
   - Responder la pregunta del usuario **en español**
   - Traducir términos técnicos correctamente
   - Citar páginas fuente

**Parámetros:**
```json
{
  "query": "¿Qué es un dato inicial de medición?",
  "translate": true
}
```

**Respuesta:**
```json
{
  "success": true,
  "query": "¿Qué es un dato inicial de medición?",
  "sectionsFound": 2,
  "response": "Un dato inicial de medición (Initial Measurement Data) es...",
  "sourcePages": [45, 78],
  "originalSections": [...]
}
```

---

### 3. **Nueva Función Frontend: `searchInFAQsAndPDF()`**

**Ubicación:** `chatbox/script.js` (líneas ~774-860)

**Estrategia de búsqueda:**
1. **Busca en PDF de Oracle** + Confluence **en paralelo**
2. **Prioridad al PDF oficial:** Si encuentra información en el manual de Oracle, la muestra primero
3. **Fallback a Confluence:** Si no hay resultados en PDF, usa Confluence
4. **Ofrece fuentes adicionales:** Si ambas tienen resultados, menciona Confluence como fuente complementaria

**Flujo de búsqueda:**
```
Usuario pregunta: "¿Qué es un medidor activo?"
    ↓
📄 Buscar en PDF Oracle (con IA)
📚 Buscar en Confluence (paralelo)
    ↓
¿Hay respuesta en PDF?
    ✅ SÍ → Mostrar respuesta traducida del manual oficial
           + Mencionar Confluence si también hay resultados
    ❌ NO → Usar resultados de Confluence
           ❌ Tampoco → Ofrecer buscar en otras fuentes o crear ticket
```

---

### 4. **Integración con Clasificación Inteligente de IA**

**Cambios en `simulateBot()`:**
```javascript
case 'HOW_TO':
case 'QUESTION':
  appendMessage('bot', '🔍 Buscando información en documentación oficial de Oracle y FAQs...');
  searchInFAQsAndPDF(userText, aiClassification.system); // 📄 Ahora incluye PDF
  break;
```

**Cambios en `executeRegexBasedClassification()` (fallback):**
```javascript
if(isKnowledgeQuery && txt.length > 5 && !isDataAnalysisQuery){
  console.log('➡️ Redirigiendo a searchInFAQsAndPDF (con PDF de Oracle)');
  searchInFAQsAndPDF(userText, null);
  return;
}
```

---

## 🧠 Tecnología Under-the-Hood

### **Búsqueda Inteligente (sin keywords hardcoded)**
El sistema NO usa regex para buscar en el PDF. En su lugar:

1. **Análisis semántico con IA:**
   ```
   Pregunta usuario: "tengo un error al reportar una factura a la Dian"
   IA extrae keywords en inglés: ["invoice", "billing", "report", "error", "DIAN"]
   ```

2. **Scoring de relevancia:**
   - Cada sección del PDF recibe un score según coincidencias de keywords
   - Se ordenan por relevancia y se toman las top 3 secciones

3. **Síntesis y traducción:**
   - Las 3 secciones más relevantes se envían a GROQ LLaMA 3.3 70B
   - El modelo lee el contexto (inglés) y responde en español
   - Traduce términos técnicos correctamente (ej: "meter" → "medidor")

### **Ventajas vs Regex:**
- ✅ **Escalable:** No hay palabras hardcoded, el modelo aprende del contexto
- ✅ **Multilenguaje:** Usuario pregunta en español, busca en PDF inglés
- ✅ **Inteligente:** Entiende sinónimos y variaciones (ej: "factura" = "invoice" = "billing")
- ✅ **Preciso:** Cita páginas fuente del manual oficial de Oracle

---

## 📂 Archivos Modificados

### Backend:
- ✅ `chatbox-server/package.json` - Agregada dependencia `pdf-parse`
- ✅ `chatbox-server/server.js` - Nuevo endpoint `/api/pdf/search` (320+ líneas)

### Frontend:
- ✅ `chatbox/script.js` - Nueva función `searchInFAQsAndPDF()` (86 líneas)
- ✅ `chatbox/script.js` - Actualizado flujo de clasificación IA (líneas 4294-4298)
- ✅ `chatbox/script.js` - Actualizado fallback regex (líneas 4516-4520)

---

## 🚀 Cómo Usar

### **1. Asegurar que el PDF exista:**
```
chatbox-server/
  data/
    ✅ C2M_Business_User_Guide_v2_8_0_0.pdf
```

### **2. Configurar variables de entorno:**
```bash
GROQ_API_KEY=gsk_... # Requerido para búsqueda y traducción
```

### **3. Iniciar servidor:**
```bash
cd chatbox-server
npm install
node server.js
```

### **4. Probar consultas:**

**Ejemplos:**
- "¿Qué es un dato inicial de medición?"
- "¿Cómo se configura un medidor en C2M?"
- "¿Para qué sirve el módulo de facturación?"
- "Explícame el proceso de lectura de medidores"

**Resultado esperado:**
```
Bot: 🔍 Buscando información en documentación oficial de Oracle y FAQs...

Bot: 📄 Información del Manual Oficial de Oracle C2M v2.8.0.0:

Un dato inicial de medición (Initial Measurement Data) es el valor de lectura 
que se registra al momento de instalar un nuevo medidor. Este valor sirve como 
punto de referencia para calcular el consumo del cliente en períodos posteriores...

Fuente: Oracle C2M Business User Guide v2.8.0.0 - Páginas 45, 78

Bot: ¿Esta información del manual oficial de Oracle responde tu pregunta 
o necesitas más detalles? 💡
```

---

## 🔍 Testing Desktop

### **Escenario 1: Pregunta técnica clara**
**Usuario:** "¿Qué es un medidor activo?"

**Esperado:**
- ✅ Busca en PDF de Oracle
- ✅ Encuentra sección en páginas 23-25
- ✅ Traduce definición al español
- ✅ Cita fuente oficial

---

### **Escenario 2: No hay info en PDF, sí en Confluence**
**Usuario:** "¿Cómo reporto un caso en JIRA?"

**Esperado:**
- ⚠️ No encuentra en PDF (tema no cubierto en manual Oracle)
- ✅ Busca en Confluence
- ✅ Muestra artículos de procedimientos internos

---

### **Escenario 3: No hay info en ninguna fuente**
**Usuario:** "¿Cuál es el clima en Bogotá?"

**Esperado:**
- ❌ No encuentra en PDF
- ❌ No encuentra en Confluence
- ✅ Ofrece: "buscar más" o "crear ticket"

---

## 📊 Performance

### **Latencia esperada:**
- PDF parsing (primera vez): ~2-3 segundos
- Búsqueda con IA: ~500-800ms
- Traducción y síntesis: ~1-2 segundos
- **Total:** ~3-5 segundos por consulta

### **Optimizaciones futuras:**
- 🔄 **Caché de secciones:** Preparsear PDF al iniciar servidor
- 🔄 **Índice vectorial:** Usar embeddings para búsqueda semántica más rápida
- 🔄 **Streaming:** Mostrar respuesta chunk por chunk

---

## 🎯 Beneficios

1. **Información oficial:** Respuestas directamente del manual de Oracle (no interpretaciones)
2. **Traducción automática:** Usuario no necesita leer inglés técnico
3. **Trazabilidad:** Siempre cita páginas fuente (auditable)
4. **Escalabilidad:** Fácil agregar más PDFs (manuales de Field, Sales, Service)
5. **IA + Documentación:** Combina inteligencia artificial con contenido oficial

---

## 🔧 Troubleshooting

### **Error: "PDF de Oracle no disponible en el servidor"**
**Causa:** Archivo PDF no existe en `chatbox-server/data/`
**Solución:** Verificar que `C2M_Business_User_Guide_v2_8_0_0.pdf` esté en la carpeta correcta

### **Error: "GROQ_API_KEY no configurado"**
**Causa:** Variable de entorno faltante
**Solución:** Agregar `GROQ_API_KEY=gsk_...` en archivo `.env`

### **Respuesta en inglés sin traducir**
**Causa:** Error en llamada a GROQ para traducción
**Solución:** Revisar logs del servidor, verificar API key y límites de uso

---

## 🚀 Próximos Pasos

1. ✅ **Agregar más PDFs:** Field User Guide, Sales Guide, Service Guide
2. ✅ **Índice vectorial:** Implementar embeddings con Pinecone/ChromaDB
3. ✅ **Caché de consultas:** Guardar respuestas frecuentes para reducir latencia
4. ✅ **Análisis de imágenes:** Si el PDF tiene diagramas, extraerlos y analizarlos
5. ✅ **Multilenguaje:** Soportar preguntas en inglés directo

---

## 📝 Notas Técnicas

- **Librería de parsing:** `pdf-parse` v1.1.1
- **Modelo de IA:** GROQ LLaMA 3.3 70B (traducción + búsqueda)
- **Tamaño del PDF:** ~500 páginas, ~8MB
- **Encoding:** UTF-8 (maneja caracteres especiales en español)
- **Rate limits:** GROQ permite ~30 requests/min (suficiente para carga normal)

---

**Implementado por:** GitHub Copilot + Claude Sonnet 4.5  
**Fecha:** Marzo 2, 2026  
**Versión:** 1.0.0 - PDF Integration 🚀
