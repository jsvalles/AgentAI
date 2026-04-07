// ============================================
// NLP SERVICE - Análisis Avanzado de Lenguaje Natural
// ============================================
// Proporciona análisis NLP mejorado, reconocimiento de entidades,
// análisis semántico, y scoring de confianza para sistemas de Service Desk

const STOPWORDS_ES = new Set([
  'el', 'la', 'de', 'que', 'y', 'a', 'en', 'un', 'ser', 'se', 'no', 'haber',
  'por', 'con', 'su', 'para', 'como', 'estar', 'tener', 'le', 'lo', 'todo',
  'pero', 'más', 'hacer', 'o', 'poder', 'decir', 'este', 'ir', 'otro', 'ese',
  'la', 'si', 'me', 'ya', 'ver', 'porque', 'dar', 'cuando', 'él', 'muy',
  'sin', 'vez', 'mucho', 'saber', 'qué', 'sobre', 'mi', 'alguno', 'mismo',
  'yo', 'también', 'hasta', 'año', 'dos', 'querer', 'entre', 'así', 'primero',
  'desde', 'grande', 'eso', 'ni', 'nos', 'llegar', 'pasar', 'tiempo', 'ella',
  'sí', 'día', 'uno', 'bien', 'poco', 'deber', 'entonces', 'poner', 'cosa',
  'tanto', 'hombre', 'parecer', 'nuestro', 'tan', 'donde', 'ahora', 'parte',
  'después', 'vida', 'quedar', 'siempre', 'creer', 'hablar', 'llevar', 'dejar',
  'es', 'esta', 'estas', 'estos', 'son', 'del', 'las', 'los', 'una', 'unas',
  'unos', 'al', 'fue', 'han', 'hay', 'era', 'eres', 'esos', 'esas'
]);

// Mapa de normalización de acentos
const ACCENT_MAP = {
  'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
  'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
  'ñ': 'n', 'Ñ': 'N', 'ü': 'u', 'Ü': 'U'
};

// Reglas de stemming básico para español (sin dependencias externas)
const STEMMING_RULES = {
  // Plurales
  'es': '', 's': '',
  // Verbos
  'ando': 'ar', 'iendo': 'er', 'ar': '', 'er': '', 'ir': '',
  'aba': '', 'ía': '', 'ada': '', 'ida': '', 'ido': '',
  // Sustantivos/Adjetivos
  'ción': '', 'sión': '', 'ancia': '', 'encia': '', 'ador': '', 
  'miento': '', 'idad': '', 'mente': ''
};

// Cache para optimización de consultas frecuentes (LRU Cache simple)
class LRUCache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }
  
  get(key) {
    if (!this.cache.has(key)) return undefined;
    // Mover al final (más reciente)
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Eliminar el más antiguo (primero en el Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  
  clear() {
    this.cache.clear();
  }
}

// Caches globales
const analysisCache = new LRUCache(100);
const embeddingCache = new LRUCache(50);
const similarityCache = new LRUCache(200);

// ============================================
// 0. PREPROCESAMIENTO DE TEXTO AVANZADO
// ============================================

/**
 * Normaliza texto completo: minúsculas, acentos, caracteres especiales
 * @param {string} text - Texto a normalizar
 * @param {boolean} removeAccents - Si eliminar acentos (default: false)
 * @returns {string} Texto normalizado
 */
function normalizeText(text, removeAccents = false) {
  if (!text) return '';
  
  let normalized = text.toLowerCase().trim();
  
  // Eliminar acentos si se solicita
  if (removeAccents) {
    normalized = normalized.split('').map(char => ACCENT_MAP[char] || char).join('');
  }
  
  // Normalizar espacios múltiples
  normalized = normalized.replace(/\s+/g, ' ');
  
  return normalized;
}

/**
 * Tokeniza texto en palabras, eliminando puntuación
 * @param {string} text - Texto a tokenizar
 * @returns {Array<string>} Array de tokens
 */
function tokenize(text) {
  if (!text) return [];
  
  // Eliminar caracteres especiales pero mantener letras, números y espacios
  // Preservar palabras técnicas como "C2M", "VPN", códigos de error
  return text
    .replace(/[¿?¡!;,.:()""''»«\[\]{}]/g, ' ') // Remover puntuación
    .replace(/\s+/g, ' ')                       // Normalizar espacios
    .trim()
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Elimina stopwords de un array de tokens
 * @param {Array<string>} tokens - Array de tokens
 * @returns {Array<string>} Tokens sin stopwords
 */
function removeStopwords(tokens) {
  return tokens.filter(token => !STOPWORDS_ES.has(token.toLowerCase()));
}

/**
 * Aplica stemming básico en español (reduce palabras a su raíz)
 * Implementación simplificada sin dependencias externas
 * @param {string} word - Palabra a reducir
 * @returns {string} Raíz de la palabra
 */
function stem(word) {
  if (!word || word.length < 4) return word;
  
  const lower = word.toLowerCase();
  
  // Intentar aplicar reglas de stemming en orden de especificidad
  const suffixes = Object.keys(STEMMING_RULES).sort((a, b) => b.length - a.length);
  
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix) && lower.length > suffix.length + 2) {
      const stem = lower.slice(0, -suffix.length) + STEMMING_RULES[suffix];
      return stem;
    }
  }
  
  return lower;
}

/**
 * Preprocesa texto completo: normalización + tokenización + stopwords + stemming
 * @param {string} text - Texto a preprocesar
 * @param {Object} options - Opciones de preprocesamiento
 * @returns {Object} Resultado del preprocesamiento
 */
function preprocessText(text, options = {}) {
  const {
    removeAccents = false,
    removeStops = true,
    applyStemming = false,
    keepOriginal = true
  } = options;
  
  const startTime = Date.now();
  
  // 1. Normalización
  const normalized = normalizeText(text, removeAccents);
  
  // 2. Tokenización
  const tokens = tokenize(normalized);
  
  // 3. Eliminar stopwords
  const filteredTokens = removeStops ? removeStopwords(tokens) : tokens;
  
  // 4. Stemming (opcional)
  const processedTokens = applyStemming 
    ? filteredTokens.map(stem) 
    : filteredTokens;
  
  // 5. Crear versiones útiles
  const result = {
    original: text,
    normalized: normalized,
    tokens: tokens,
    filteredTokens: filteredTokens,
    processedTokens: processedTokens,
    processedText: processedTokens.join(' '),
    tokenCount: tokens.length,
    meaningfulTokenCount: filteredTokens.length,
    processingTime: Date.now() - startTime
  };
  
  return result;
}

// ============================================
// 1. ANÁLISIS NLP MEJORADO CON CONFIANZA
// ============================================

/**
 * Análisis NLP completo de la consulta con scoring de confianza
 * @param {string} question - La pregunta del usuario
 * @param {Object} options - Opciones de análisis
 * @returns {Object} Análisis detallado con intención, keywords, tipo, entidades y confianza
 */
function analyzeQuery(question, options = {}) {
  // Verificar cache primero
  const cacheKey = `analysis:${question.toLowerCase().trim()}`;
  const cached = analysisCache.get(cacheKey);
  if (cached && !options.skipCache) {
    console.log('🎯 NLP Cache hit');
    return cached;
  }
  
  const startTime = Date.now();
  const lowerQ = question.toLowerCase();
  
  // 🆕 Preprocesamiento avanzado
  const preprocessed = preprocessText(question, {
    removeStops: true,
    applyStemming: false // Mantener palabras completas para mejor matching
  });
  
  // Análisis principal
  const intent = detectIntent(question);
  const questionType = detectQuestionType(question);
  const keywords = extractKeywords(question);
  const entities = recognizeEntities(question);
  const diagramType = detectDiagramRequest(question);
  const sentiment = detectSentiment(question);
  const action = detectAction(question);
  const urgency = detectUrgency(question);
  
  // 🆕 Calcular nivel de confianza del análisis
  const confidence = calculateConfidence({
    question,
    preprocessed,
    intent,
    keywords,
    entities,
    questionType
  });
  
  const analysis = {
    // Intención detectada (más granular)
    intent: intent,
    
    // Tipo de pregunta (compatibilidad con multi-ai-service)
    questionType: questionType,
    
    // Palabras clave extraídas (sin stopwords)
    keywords: keywords,
    
    // 🆕 Tokens procesados (útil para matching semántico)
    tokens: preprocessed.filteredTokens,
    processedText: preprocessed.processedText,
    
    // Entidades identificadas (error codes, systems, tables, etc.)
    entities: entities,
    
    // Tipo de diagrama solicitado (si aplica)
    diagramType: diagramType,
    
    // Sentimiento básico
    sentiment: sentiment,
    
    // Acción principal solicitada
    action: action,
    
    // Urgencia percibida
    urgency: urgency,
    
    // 🆕 Nivel de confianza del análisis (0-1)
    confidence: confidence,
    
    // 🆕 Metadata de procesamiento
    metadata: {
      tokenCount: preprocessed.tokenCount,
      meaningfulTokens: preprocessed.meaningfulTokenCount,
      processingTime: Date.now() - startTime,
      cached: false
    }
  };
  
  // Guardar en cache
  analysisCache.set(cacheKey, analysis);
  
  return analysis;
}

/**
 * Calcula nivel de confianza del análisis NLP
 * Basado en múltiples factores: claridad, entidades detectadas, keywords, etc.
 * @param {Object} context - Contexto del análisis
 * @returns {number} Score de confianza entre 0 y 1
 */
function calculateConfidence(context) {
  const { question, preprocessed, intent, keywords, entities, questionType } = context;
  
  let score = 0.5; // Base score
  const weights = {
    intentClarity: 0.2,
    entitiesFound: 0.25,
    keywordRelevance: 0.2,
    questionLength: 0.15,
    specificity: 0.2
  };
  
  // 1. Claridad de intención (si no es "general", es más claro)
  if (intent !== 'general') {
    score += weights.intentClarity;
    
    // Bonus si es muy específico
    if (['technical_name', 'troubleshooting', 'code_request'].includes(intent)) {
      score += 0.1;
    }
  }
  
  // 2. Entidades encontradas (más entidades = mayor confianza)
  const totalEntities = 
    entities.errorCodes.length +
    entities.systems.length +
    entities.tables.length +
    entities.businessObjects.length +
    entities.fields.length;
  
  if (totalEntities > 0) {
    score += weights.entitiesFound * Math.min(totalEntities / 3, 1);
  }
  
  // 3. Relevancia de keywords (palabras significativas vs total)
  if (preprocessed.meaningfulTokenCount > 0) {
    const keywordRatio = Math.min(keywords.length / preprocessed.meaningfulTokenCount, 1);
    score += weights.keywordRelevance * keywordRatio;
  }
  
  // 4. Longitud de pregunta (ni muy corta ni muy larga)
  const wordCount = preprocessed.tokenCount;
  if (wordCount >= 5 && wordCount <= 30) {
    score += weights.questionLength;
  } else if (wordCount >= 3 && wordCount < 5) {
    score += weights.questionLength * 0.5; // Penalizar preguntas muy cortas
  } else if (wordCount > 30) {
    score += weights.questionLength * 0.7; // Penalizar preguntas muy largas
  }
  
  // 5. Especificidad (menciona sistemas, tablas, tecnologías específicas)
  const specificityIndicators = [
    entities.systems.length > 0,
    entities.tables.length > 0,
    entities.errorCodes.length > 0,
    entities.businessObjects.length > 0,
    /\b(c2m|mdm|vee|oracle|utilities)\b/i.test(question)
  ];
  
  const specificityScore = specificityIndicators.filter(Boolean).length / specificityIndicators.length;
  score += weights.specificity * specificityScore;
  
  // Normalizar entre 0 y 1
  return Math.min(Math.max(score, 0), 1);
}

/**
 * Detecta la intención principal de la consulta (más granular que questionType)
 */
function detectIntent(question) {
  const lowerQ = question.toLowerCase();
  
  // Intenciones específicas (orden de prioridad)
  const intents = [
    // Visualización
    { pattern: /\b(diagrama|flujo|flowchart|grafico|visualiza|dibuja|esquema|mapa)\b/i, intent: 'diagram' },
    
    // Búsqueda de nombre técnico
    { pattern: /\b(cómo se llama|cual es el nombre|nombre del|identifica|identificar)\b/i, intent: 'technical_name' },
    
    // Error/Troubleshooting
    { pattern: /\b(error|fallo|problema|no funciona|issue|bug)\b/i, intent: 'troubleshooting' },
    
    // Cómo funciona (funcionamiento)
    { pattern: /\b(cómo funciona|como funciona|funcionamiento|qué hace|que hace)\b/i, intent: 'how_it_works' },
    
    // Código/Script
    { pattern: /\b(código|script|sql|query|función|método|ejemplo de código)\b/i, intent: 'code_request' },
    
    // Procedimiento/Guía
    { pattern: /\b(cómo|como|pasos|procedimiento|proceso|guía|tutorial)\b/i, intent: 'procedure' },
    
    // Configuración
    { pattern: /\b(configurar|parametrizar|setup|instalar|activar)\b/i, intent: 'configuration' },
    
    // Datos/Reportes
    { pattern: /\b(cuántos|cantidad|lista|reporte|datos|estadísticas)\b/i, intent: 'data_request' },
    
    // Comparación
    { pattern: /\b(diferencia|comparar|vs|versus|mejor|peor)\b/i, intent: 'comparison' },
    
    // Definición
    { pattern: /\b(qué es|que es|define|definición|significa)\b/i, intent: 'definition' },
    
    // VEE/BO específico
    { pattern: /\b(regla de vee|business object|bo|validación|estimación)\b/i, intent: 'vee_query' }
  ];
  
  for (const { pattern, intent } of intents) {
    if (pattern.test(question)) {
      return intent;
    }
  }
  
  return 'general';
}

/**
 * Detecta tipo de pregunta (compatibilidad con analyzeQuestionType existente)
 */
function detectQuestionType(question) {
  const lowerQ = question.toLowerCase();
  
  if (/código|script|sql|query|función|método|class|error de sintaxis|debug/i.test(question)) {
    return 'code';
  }
  if (/problema|error|fallo|no funciona|issue|bug|solución|arreglar|corregir/i.test(question)) {
    return 'troubleshooting';
  }
  if (/cómo|como|pasos|procedimiento|proceso|guía|tutorial|crear|configurar|parametrizar/i.test(question)) {
    return 'procedure';
  }
  if (/cuántos|cuantos|cantidad|lista|reporte|datos|información de|estadísticas/i.test(question)) {
    return 'dataRequest';
  }
  if (/arquitectura|diseño|performance|optimización|seguridad|integración|api/i.test(question)) {
    return 'technical';
  }
  if (/diagrama|flujo|flowchart|grafico|visualiza|dibuja/i.test(question)) {
    return 'diagram';
  }
  
  return 'general';
}

/**
 * Extrae palabras clave significativas (sin stopwords)
 */
function extractKeywords(question) {
  // Normalizar y tokenizar
  const words = question
    .toLowerCase()
    .replace(/[¿?¡!,.:;]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS_ES.has(w));
  
  // Contar frecuencias
  const freq = {};
  words.forEach(w => freq[w] = (freq[w] || 0) + 1);
  
  // Ordenar por frecuencia y devolver top keywords
  return Object.keys(freq)
    .sort((a, b) => freq[b] - freq[a])
    .slice(0, 10);
}

/**
 * Detecta tipo de diagrama solicitado
 */
function detectDiagramRequest(question) {
  const lowerQ = question.toLowerCase();
  
  if (/\b(flujo|flowchart|proceso)\b/i.test(question)) {
    return 'flowchart';
  }
  if (/\b(secuencia|sequence|interacción)\b/i.test(question)) {
    return 'sequence';
  }
  if (/\b(clase|class|uml|entidad)\b/i.test(question)) {
    return 'class';
  }
  if (/\b(arquitectura|componentes|sistema)\b/i.test(question)) {
    return 'architecture';
  }
  if (/\b(estado|state|transición)\b/i.test(question)) {
    return 'state';
  }
  if (/\b(diagrama|grafico|visualiza|dibuja|esquema|mapa)\b/i.test(question)) {
    return 'generic';
  }
  
  return null;
}

/**
 * Detecta sentimiento básico de la consulta
 */
function detectSentiment(question) {
  const lowerQ = question.toLowerCase();
  
  const negative = /problema|error|fallo|no funciona|mal|incorrecto|urgente|crítico|ayuda/i;
  const positive = /funciona|bien|correcto|gracias|excelente|perfecto/i;
  
  if (negative.test(question)) return 'negative';
  if (positive.test(question)) return 'positive';
  return 'neutral';
}

/**
 * Detecta acción principal solicitada
 */
function detectAction(question) {
  const actions = [
    { pattern: /\b(crear|crear|generar|construir)\b/i, action: 'create' },
    { pattern: /\b(modificar|actualizar|cambiar|editar)\b/i, action: 'modify' },
    { pattern: /\b(eliminar|borrar|quitar|remover)\b/i, action: 'delete' },
    { pattern: /\b(buscar|encontrar|localizar|ver)\b/i, action: 'search' },
    { pattern: /\b(explicar|describir|detallar)\b/i, action: 'explain' },
    { pattern: /\b(comparar|diferenciar)\b/i, action: 'compare' },
    { pattern: /\b(configurar|parametrizar|setup)\b/i, action: 'configure' },
    { pattern: /\b(solucionar|arreglar|corregir|resolver)\b/i, action: 'fix' }
  ];
  
  for (const { pattern, action } of actions) {
    if (pattern.test(question)) return action;
  }
  
  return 'query';
}

/**
 * Detecta nivel de urgencia
 */
function detectUrgency(question) {
  const lowerQ = question.toLowerCase();
  
  if (/\b(urgente|crítico|inmediato|ya|ahora mismo|rápido|emergency)\b/i.test(question)) {
    return 'high';
  }
  if (/\b(pronto|cuando puedas|necesito)\b/i.test(question)) {
    return 'medium';
  }
  
  return 'normal';
}

// ============================================
// 2. RECONOCIMIENTO DE ENTIDADES (NER)
// ============================================

/**
 * Reconoce todas las entidades relevantes en la consulta
 * @param {string} text - Texto a analizar
 * @returns {Object} Entidades extraídas por categoría
 */
function recognizeEntities(text) {
  return {
    // Códigos de error
    errorCodes: extractErrorCodes(text),
    
    // Sistemas/Módulos Oracle
    systems: extractSystems(text),
    
    // Tablas de base de datos
    tables: extractTables(text),
    
    // Business Objects (CM-*)
    businessObjects: extractBusinessObjects(text),
    
    // Campos/Columnas
    fields: extractFields(text),
    
    // Parámetros de configuración
    parameters: extractParameters(text),
    
    // Fechas
    dates: extractDates(text),
    
    // Números (IDs, códigos)
    numbers: extractNumbers(text)
  };
}

/**
 * Extrae códigos de error (ORA-*, MDM-*, SQLCODE, etc.)
 */
function extractErrorCodes(text) {
  const patterns = [
    // Oracle Database errors
    /\b(ORA)-(\d{5})\b/gi,
    
    // MDM errors
    /\b(MDM)[-_]?(ERROR)?[-_]?(\d{3,5})\b/gi,
    
    // C2M errors
    /\b(C2M)[-_]?(ERROR)?[-_]?(\d{3,5})\b/gi,
    
    // SQL State codes
    /\b(SQLCODE|SQLSTATE)[\s:=]+(-?\d+)\b/gi,
    
    // Generic error patterns
    /\b(ERROR)[-_](\d{3,5})\b/gi,
    
    // HTTP status codes in context
    /\b(HTTP\s+)?([45]\d{2})\s+(error|status)/gi
  ];
  
  const codes = new Set();
  
  patterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      codes.add(match[0].toUpperCase());
    }
  });
  
  return Array.from(codes);
}

/**
 * Extrae sistemas/módulos Oracle Utilities
 */
function extractSystems(text) {
  const systems = [
    // Oracle Utilities Core
    'C2M', 'MDM', 'CC&B', 'CCB',
    
    // Módulos específicos
    'Field', 'Service', 'Sales', 'Marketing', 'Work', 'Mobile',
    
    // Componentes técnicos
    'Business Process', 'Algorithm', 'Service Script',
    'Batch Process', 'Inbound Web Service', 'Outbound Message',
    
    // VEE
    'VEE', 'Validation', 'Estimation', 'Editing',
    
    // Tecnologías relacionadas
    'WebLogic', 'Oracle Database', 'Coherence', 'ODI', 'OIC',
    
    // Utilities específicos
    'OaaS', 'Oracle as a Service', 'Analytics', 'Integration Hub'
  ];
  
  const found = new Set();
  const lowerText = text.toLowerCase();
  
  systems.forEach(system => {
    const pattern = new RegExp(`\\b${system.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (pattern.test(text)) {
      found.add(system);
    }
  });
  
  return Array.from(found);
}

/**
 * Extrae nombres de tablas Oracle Utilities
 */
function extractTables(text) {
  const tablePatterns = [
    // Oracle Utilities table prefixes
    /\b(CI|D1|CC|F1|CM|CS|CT|CD|CA)_[A-Z_]{2,40}\b/g,
    
    // Common specific tables
    /\b(ACCT_PER|SP|SP_SVC_ADDR|PER|PREM|ADDR|BILL)\b/g
  ];
  
  const tables = new Set();
  
  tablePatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      tables.add(match[0].toUpperCase());
    }
  });
  
  return Array.from(tables);
}

/**
 * Extrae Business Objects (CM-*)
 */
function extractBusinessObjects(text) {
  // Patrón mejorado: CM-[NombreEnEspañol con letras acentuadas]
  const pattern = /\b(CM)-([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)\b/g;
  
  const bos = new Set();
  const matches = text.matchAll(pattern);
  
  for (const match of matches) {
    bos.add(match[0]); // CM-NombreCompleto
  }
  
  return Array.from(bos);
}

/**
 * Extrae nombres de campos/columnas (heurística)
 */
function extractFields(text) {
  // Campos mencionados en contexto técnico
  const fieldPatterns = [
    // Pattern: TABLA.CAMPO o solo CAMPO en contexto
    /\b[A-Z_]{2,}\.[A-Z_]{2,40}\b/g,
    
    // Campos específicos comunes
    /\b(ACCT_ID|PER_ID|PREM_ID|SP_ID|BILL_ID|SA_ID|MEAS_[A-Z_]+|READ_[A-Z_]+)\b/g
  ];
  
  const fields = new Set();
  
  fieldPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      fields.add(match[0].toUpperCase());
    }
  });
  
  return Array.from(fields);
}

/**
 * Extrae parámetros de configuración
 */
function extractParameters(text) {
  const paramPatterns = [
    // Java properties style
    /\b[a-z]+\.[a-z.]+[a-z]\b/g,
    
    // Environment variables
    /\b[A-Z_]{3,}=[^\s]+\b/g,
    
    // Command line flags
    /--?[a-z-]+=?[^\s]*/g
  ];
  
  const params = new Set();
  
  paramPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // Filtrar URLs y emails
      if (!/[@/]/.test(match[0])) {
        params.add(match[0]);
      }
    }
  });
  
  return Array.from(params).slice(0, 10); // Limitar resultados
}

/**
 * Extrae fechas mencionadas
 */
function extractDates(text) {
  const datePatterns = [
    // DD/MM/YYYY o DD-MM-YYYY
    /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g,
    
    // YYYY-MM-DD
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    
    // Textuales: "enero 2024", "15 de marzo"
    /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/gi,
    
    // Meses con año
    /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})\b/gi
  ];
  
  const dates = new Set();
  
  datePatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      dates.add(match[0]);
    }
  });
  
  return Array.from(dates);
}

/**
 * Extrae números relevantes (IDs, códigos)
 */
function extractNumbers(text) {
  // Números con contexto (evitar números sueltos sin significado)
  const numberPatterns = [
    // IDs: "ID: 12345" o "ID 12345"
    /\b(ID|id)[\s:]+(\d{4,})\b/g,
    
    // Números de ticket: "#12345" o "TICKET-12345"
    /\b(#|TICKET[-_]?)(\d{3,})\b/gi,
    
    // Versiones: "v2.8.0.0"
    /\bv?(\d+\.){2,}\d+\b/g
  ];
  
  const numbers = new Set();
  
  numberPatterns.forEach(pattern => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      numbers.add(match[0]);
    }
  });
  
  return Array.from(numbers);
}

// ============================================
// 3. UTILIDADES DE ANÁLISIS
// ============================================

/**
 * Determina si la consulta requiere contexto interno C2M/Confluence
 */
function requiresInternalContext(analysis) {
  const { entities, keywords, intent } = analysis;
  
  // Si menciona sistemas Oracle Utilities específicos
  if (entities.systems.length > 0) return true;
  
  // Si busca nombres técnicos de VEE/BO
  if (intent === 'technical_name' || intent === 'vee_query') return true;
  
  // Si menciona tablas Oracle
  if (entities.tables.length > 0) return true;
  
  // Keywords específicos de dominio
  const domainKeywords = ['c2m', 'mdm', 'oaas', 'confluence', 'vee', 'business object'];
  if (keywords.some(k => domainKeywords.includes(k.toLowerCase()))) return true;
  
  return false;
}

/**
 * Genera un resumen ejecutivo del análisis
 */
function summarizeAnalysis(analysis) {
  const summary = [];
  
  summary.push(`Intención: ${analysis.intent}`);
  summary.push(`Tipo: ${analysis.questionType}`);
  
  if (analysis.entities.errorCodes.length > 0) {
    summary.push(`Errores: ${analysis.entities.errorCodes.join(', ')}`);
  }
  
  if (analysis.entities.systems.length > 0) {
    summary.push(`Sistemas: ${analysis.entities.systems.join(', ')}`);
  }
  
  if (analysis.entities.businessObjects.length > 0) {
    summary.push(`BOs: ${analysis.entities.businessObjects.join(', ')}`);
  }
  
  if (analysis.entities.tables.length > 0) {
    summary.push(`Tablas: ${analysis.entities.tables.join(', ')}`);
  }
  
  if (analysis.diagramType) {
    summary.push(`Diagrama: ${analysis.diagramType}`);
  }
  
  if (analysis.urgency !== 'normal') {
    summary.push(`Urgencia: ${analysis.urgency}`);
  }
  
  return summary.join(' | ');
}

// ============================================
// 4. ANÁLISIS SEMÁNTICO CON EMBEDDINGS
// ============================================

// Lazy loading de OpenAI (solo si está disponible)
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    try {
      const { OpenAI } = require('openai');
      openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('✅ OpenAI Embeddings disponible');
    } catch (error) {
      console.warn('⚠️ OpenAI no disponible:', error.message);
      openaiClient = false; // Marcar como no disponible
    }
  }
  return openaiClient || null;
}

/**
 * Genera embedding vectorial de un texto usando OpenAI
 * @param {string} text - Texto a convertir en embedding
 * @returns {Promise<Array<number>|null>} Vector embedding o null si falla
 */
async function generateEmbedding(text) {
  const client = getOpenAIClient();
  if (!client) {
    console.warn('⚠️ Embeddings no disponibles - OpenAI API key no configurada');
    return null;
  }
  
  // Verificar cache
  const cacheKey = `emb:${text.toLowerCase().trim()}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  
  try {
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small', // Modelo eficiente y económico
      input: text,
      encoding_format: 'float'
    });
    
    const embedding = response.data[0].embedding;
    
    // Guardar en cache
    embeddingCache.set(cacheKey, embedding);
    
    return embedding;
  } catch (error) {
    console.error('❌ Error generando embedding:', error.message);
    return null;
  }
}

/**
 * Calcula similitud coseno entre dos vectores
 * @param {Array<number>} vecA - Primer vector
 * @param {Array<number>} vecB - Segundo vector
 * @returns {number} Similitud entre 0 y 1
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (denominator === 0) return 0;
  
  return dotProduct / denominator;
}

/**
 * Calcula similitud semántica entre dos textos
 * Usa embeddings si están disponibles, sino usa similitud básica de tokens
 * @param {string} text1 - Primer texto
 * @param {string} text2 - Segundo texto
 * @returns {Promise<number>} Similitud entre 0 y 1
 */
async function calculateSemanticSimilarity(text1, text2) {
  // Verificar cache
  const cacheKey = `sim:${text1}|${text2}`;
  const cached = similarityCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  
  // Intentar usar embeddings primero
  if (getOpenAIClient()) {
    try {
      const [emb1, emb2] = await Promise.all([
        generateEmbedding(text1),
        generateEmbedding(text2)
      ]);
      
      if (emb1 && emb2) {
        const similarity = cosineSimilarity(emb1, emb2);
        similarityCache.set(cacheKey, similarity);
        return similarity;
      }
    } catch (error) {
      console.warn('⚠️ Embedding fallback to token similarity');
    }
  }
  
  // Fallback: similitud basada en tokens (Jaccard similarity)
  const tokens1 = new Set(preprocessText(text1).filteredTokens);
  const tokens2 = new Set(preprocessText(text2).filteredTokens);
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  const similarity = union.size > 0 ? intersection.size / union.size : 0;
  
  similarityCache.set(cacheKey, similarity);
  return similarity;
}

/**
 * Encuentra preguntas similares en un conjunto de preguntas conocidas
 * @param {string} query - Pregunta a buscar
 * @param {Array<Object>} knownQuestions - Array de {question, answer, metadata}
 * @param {number} threshold - Umbral mínimo de similitud (default: 0.7)
 * @param {number} maxResults - Máximo de resultados (default: 5)
 * @returns {Promise<Array<Object>>} Array de preguntas similares con score
 */
async function findSimilarQuestions(query, knownQuestions = [], threshold = 0.7, maxResults = 5) {
  if (!knownQuestions || knownQuestions.length === 0) {
    return [];
  }
  
  const results = [];
  
  // Calcular similitud con cada pregunta conocida
  for (const known of knownQuestions) {
    const similarity = await calculateSemanticSimilarity(query, known.question);
    
    if (similarity >= threshold) {
      results.push({
        ...known,
        similarity: similarity,
        matchType: similarity >= 0.9 ? 'exact' : similarity >= 0.8 ? 'high' : 'medium'
      });
    }
  }
  
  // Ordenar por similitud descendente y limitar resultados
  results.sort((a, b) => b.similarity - a.similarity);
  
  return results.slice(0, maxResults);
}

/**
 * Análisis semántico completo de una consulta
 * Incluye embeddings, similitud y recomendaciones
 * @param {string} query - Pregunta del usuario
 * @param {Object} options - Opciones de análisis
 * @returns {Promise<Object>} Análisis semántico completo
 */
async function analyzeSemantics(query, options = {}) {
  const {
    knownQuestions = [],
    similarityThreshold = 0.7,
    maxSimilar = 5
  } = options;
  
  const startTime = Date.now();
  
  // Generar embedding de la consulta
  const embedding = await generateEmbedding(query);
  
  // Buscar preguntas similares si hay base de conocimiento
  const similarQuestions = knownQuestions.length > 0 
    ? await findSimilarQuestions(query, knownQuestions, similarityThreshold, maxSimilar)
    : [];
  
  return {
    embedding: embedding,
    hasEmbedding: embedding !== null,
    similarQuestions: similarQuestions,
    bestMatch: similarQuestions.length > 0 ? similarQuestions[0] : null,
    processingTime: Date.now() - startTime
  };
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Análisis principal
  analyzeQuery,
  
  // 🆕 Preprocesamiento avanzado
  preprocessText,
  normalizeText,
  tokenize,
  removeStopwords,
  stem,
  
  // 🆕 Sistema de confianza
  calculateConfidence,
  
  // Componentes individuales de análisis
  detectIntent,
  detectQuestionType,
  extractKeywords,
  detectDiagramRequest,
  detectSentiment,
  detectAction,
  detectUrgency,
  
  // Reconocimiento de entidades
  recognizeEntities,
  extractErrorCodes,
  extractSystems,
  extractTables,
  extractBusinessObjects,
  extractFields,
  extractParameters,
  extractDates,
  extractNumbers,
  
  // 🆕 Análisis semántico con embeddings
  analyzeSemantics,
  calculateSemanticSimilarity,
  findSimilarQuestions,
  generateEmbedding,
  cosineSimilarity,
  
  // Utilidades
  requiresInternalContext,
  summarizeAnalysis,
  
  // 🆕 Gestión de cache
  clearCache: () => {
    analysisCache.clear();
    embeddingCache.clear();
    similarityCache.clear();
    console.log('🧹 NLP caches limpiados');
  },
  getCacheStats: () => ({
    analysis: analysisCache.cache.size,
    embeddings: embeddingCache.cache.size,
    similarity: similarityCache.cache.size
  })
};
