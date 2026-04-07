# 🚀 NLP Service - Guía de Inicio Rápido

## ¿Qué es esto?

Un servicio completo de **Procesamiento de Lenguaje Natural (NLP)** diseñado para sistemas de **Service Desk** que analiza, comprende y clasifica automáticamente las consultas de los usuarios.

## ✨ Características Principales

✅ **Detección de Intención** - Clasifica automáticamente consultas en 12 categorías  
✅ **Reconocimiento de Entidades** - Detecta errores, sistemas, tablas, Business Objects  
✅ **Scoring de Confianza** - Calcula confianza del análisis (0-100%)  
✅ **Análisis Semántico** - Encuentra preguntas similares con embeddings  
✅ **Cache Inteligente** - Optimizado para tiempo real  
✅ **Preprocesamiento Avanzado** - Tokenización, stopwords, stemming  

## 📦 Instalación

Ya está todo listo! Solo necesitas:

```bash
# 1. Verificar que las dependencias estén instaladas
npm install

# 2. (Opcional) Configurar OpenAI para análisis semántico
# Edita .env y agrega:
OPENAI_API_KEY=sk-tu-api-key-aqui
```

## ⚡ Uso Rápido

### Análisis Básico (5 líneas de código)

```javascript
const nlpService = require('./nlp-service');

// Analizar una consulta
const result = nlpService.analyzeQuery('¿Cómo soluciono el error ORA-12154?');

console.log('Intent:', result.intent);              // 'troubleshooting'
console.log('Confianza:', result.confidence);       // 0.87
console.log('Errores:', result.entities.errorCodes); // ['ORA-12154']
```

### Ver Todos los Ejemplos

```bash
# Ejecutar archivo de ejemplos completo
node nlp-examples.js
```

## 🎯 Casos de Uso Más Comunes

### 1. Clasificar Tickets Automáticamente

```javascript
const analysis = nlpService.analyzeQuery(ticketDescription);

if (analysis.intent === 'troubleshooting') {
  // Asignar a equipo de soporte técnico
  assignToTeam('technical-support');
} else if (analysis.intent === 'code_request') {
  // Asignar a desarrollo
  assignToTeam('development');
}
```

### 2. Auto-Respuesta con Alta Confianza

```javascript
const analysis = nlpService.analyzeQuery(userQuestion);

if (analysis.confidence > 0.8) {
  // Suficiente confianza para responder automáticamente
  const answer = searchKnowledgeBase(analysis);
  respondToUser(answer);
} else {
  // Escalar a agente humano
  escalateToHuman(analysis);
}
```

### 3. Detectar Errores Técnicos

```javascript
const analysis = nlpService.analyzeQuery('Error ORA-12154 en C2M');

console.log(analysis.entities);
// {
//   errorCodes: ['ORA-12154'],
//   systems: ['C2M'],
//   tables: [],
//   ...
// }

// Buscar solución específica para ORA-12154
const solution = findSolutionFor(analysis.entities.errorCodes[0]);
```

### 4. Buscar Preguntas Similares (con OpenAI)

```javascript
const knowledgeBase = [
  { question: '¿Cómo reiniciar WebLogic?', answer: 'Paso 1...' },
  { question: '¿Qué es VEE?', answer: 'VEE es...' }
];

const semantic = await nlpService.analyzeSemantics(
  '¿Cómo restart el servidor WebLogic?',
  { knownQuestions: knowledgeBase, similarityThreshold: 0.7 }
);

if (semantic.bestMatch) {
  console.log('Pregunta similar:', semantic.bestMatch.question);
  console.log('Similitud:', semantic.bestMatch.similarity);
  console.log('Respuesta:', semantic.bestMatch.answer);
}
```

## 📊 Interpretar Resultados

### Estructura del Análisis

```javascript
{
  // CLASIFICACIÓN
  intent: 'troubleshooting',           // Tipo de intención
  questionType: 'troubleshooting',     // Tipo de pregunta
  
  // CONFIANZA (0-1)
  confidence: 0.87,                    // 87% confianza
  
  // KEYWORDS
  keywords: ['error', 'ora-12154', 'c2m'],
  tokens: ['error', 'ora-12154', 'c2m'],
  
  // ENTIDADES DETECTADAS
  entities: {
    errorCodes: ['ORA-12154'],
    systems: ['C2M'],
    tables: [],
    businessObjects: [],
    fields: [],
    parameters: [],
    dates: [],
    numbers: []
  },
  
  // CONTEXTO ADICIONAL
  sentiment: 'negative',               // Sentimiento
  action: 'fix',                       // Acción solicitada
  urgency: 'normal',                   // Nivel de urgencia
  diagramType: null,                   // Tipo de diagrama (si aplica)
  
  // METADATA
  metadata: {
    tokenCount: 7,
    meaningfulTokens: 4,
    processingTime: 8,                 // ms
    cached: false
  }
}
```

### Niveles de Confianza

| Confianza | Interpretación | Acción Recomendada |
|-----------|----------------|-------------------|
| > 0.8 | 🟢 Alta | Auto-respuesta segura |
| 0.6 - 0.8 | 🟡 Media | Validar con usuario |
| < 0.6 | 🔴 Baja | Pedir clarificación |

### Intents Más Comunes

| Intent | Cuándo se Detecta | Ejemplo |
|--------|-------------------|---------|
| `troubleshooting` | Reportes de errores | "Error ORA-12154" |
| `procedure` | Solicitud de pasos | "¿Cómo configurar...?" |
| `diagram` | Solicitud visual | "Dame un diagrama de..." |
| `code_request` | Pide código | "Script SQL para..." |
| `data_request` | Pide datos | "¿Cuántos tickets hay?" |

## 🔧 Configuración Avanzada

### Activar Análisis Semántico (Opcional)

Requiere OpenAI API key:

```bash
# .env
OPENAI_API_KEY=sk-tu-key-aqui
```

**Beneficios:**
- ✅ Similitud semántica precisa con embeddings
- ✅ Búsqueda de preguntas similares mejorada
- ✅ Matching aunque usen palabras diferentes

**Sin OpenAI (Funciona igual):**
- ⚠️ Usa similitud básica (Jaccard) en su lugar
- ⚠️ Menos preciso pero funcional

### Limpiar Cache

```javascript
// Limpiar todos los caches
nlpService.clearCache();

// Ver estadísticas de cache
const stats = nlpService.getCacheStats();
console.log(stats); // { analysis: 45, embeddings: 23, similarity: 156 }
```

## 📖 Documentación Completa

- **[NLP_SERVICE_DOCUMENTATION.md](./NLP_SERVICE_DOCUMENTATION.md)** - Documentación técnica completa
- **[NLP_ARCHITECTURE.md](./NLP_ARCHITECTURE.md)** - Arquitectura y diagramas
- **[nlp-examples.js](./nlp-examples.js)** - Ejemplos ejecutables

## 🧪 Probar el Servicio

### Test Rápido

```javascript
// test-nlp.js
const nlpService = require('./nlp-service');

console.log('=== TEST NLP SERVICE ===\n');

const tests = [
  '¿Cómo soluciono el error ORA-12154?',
  'Dame un diagrama del flujo VEE',
  '¿Cuál es la tabla de cuentas en C2M?'
];

tests.forEach(q => {
  const r = nlpService.analyzeQuery(q);
  console.log(`Q: ${q}`);
  console.log(`A: ${r.intent} (${(r.confidence*100).toFixed(0)}%)\n`);
});
```

```bash
node test-nlp.js
```

### Ejecutar Tests Completos

```bash
node nlp-examples.js
```

Verás:
- ✅ Análisis básico de múltiples consultas
- ✅ Preprocesamiento con diferentes opciones
- ✅ Reconocimiento de entidades
- ✅ Sistema de confianza
- ✅ Performance y cache
- ✅ Análisis semántico (si OpenAI configurado)

## 🐛 Troubleshooting

### "Warning: OpenAI no disponible"

**Causa:** No está configurada la API key de OpenAI  
**Solución:** Es normal y esperado. El sistema funciona sin OpenAI usando similitud básica.

**Para activar OpenAI:**
```bash
# En .env
OPENAI_API_KEY=sk-tu-key
```

### Baja confianza en consultas claras

**Causa:** Pregunta demasiado vaga o sin entidades técnicas  
**Ejemplo:** "ayuda" → confidence: 0.3

**Solución:** Pedir al usuario más detalles específicos

### No detecta entidades esperadas

**Causa:** Patrón de regex no incluye ese formato  
**Solución:** Agregar patrón en `extract*` functions en [nlp-service.js](chatbox-server/nlp-service.js)

## 💡 Tips y Mejores Prácticas

### ✅ Hacer

- Usar `analyzeQuery()` para análisis completo
- Verificar `confidence` antes de auto-responder
- Cachear resultados (ya se hace automáticamente)
- Usar análisis semántico para matching avanzado

### ❌ Evitar

- No analizar la misma consulta múltiples veces (usa cache)
- No hacer stemming si necesitas palabras exactas
- No depender 100% de embeddings (puede fallar)
- No ignorar el `confidence` score

## 🔄 Integración con Sistema Existente

El servicio ya está integrado con `multi-ai-service.js`:

```javascript
// Ya funciona automáticamente en el sistema
const nlpAnalysis = nlpService.analyzeQuery(userQuestion);

// multi-ai-service.js usa este análisis para:
// 1. Decidir qué IAs consultar
// 2. Generar instrucciones dinámicas
// 3. Determinar si requiere contexto interno
// 4. Loguear información relevante
```

## 📈 Métricas de Performance

- **Análisis básico**: 8-12ms (primera vez), <1ms (cache)
- **Con embeddings**: 250ms (primera vez), 1-2ms (cache)
- **Cache hit rate**: 70-90% después de warmup

## 🎓 Aprender Más

### Conceptos Clave

- **Intent Detection**: Clasificar qué quiere el usuario
- **Entity Recognition**: Extraer información estructurada
- **Confidence Scoring**: Qué tan seguro está el análisis
- **Semantic Similarity**: Comparar significado de textos
- **Embeddings**: Representación vectorial de texto

### Recursos

- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [NLP Básico en Español](https://nlp.stanford.edu/)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)

## 🤝 Contribuir

Para agregar nuevas funcionalidades:

1. **Nuevos intents**: Editar `detectIntent()` en [nlp-service.js](chatbox-server/nlp-service.js#L299)
2. **Nuevas entidades**: Editar `extract*()` functions
3. **Ajustar confianza**: Editar `calculateConfidence()`
4. **Agregar tests**: Editar [nlp-examples.js](chatbox-server/nlp-examples.js)

## 📞 Soporte

- **Documentación técnica**: [NLP_SERVICE_DOCUMENTATION.md](./NLP_SERVICE_DOCUMENTATION.md)
- **Arquitectura**: [NLP_ARCHITECTURE.md](./NLP_ARCHITECTURE.md)
- **Ejemplos**: [nlp-examples.js](./nlp-examples.js)

---

**¡Happy Coding! 🚀**
