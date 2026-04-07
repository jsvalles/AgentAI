require('dotenv').config(); // Cargar variables de entorno ANTES de inicializar Claude
const Anthropic = require('@anthropic-ai/sdk');

// Inicializar cliente de Claude
const anthropic = process.env.ANTHROPIC_API_KEY 
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Log de debug para verificar configuración
if (anthropic) {
  console.log('✅ Claude AI inicializado correctamente con API key');
} else {
  console.log('⚠️ Claude AI NO inicializado - API key no encontrada');
  console.log('   ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Definida' : 'No definida');
}

// ============================================
// MEMORIA CONVERSACIONAL
// ============================================

// Almacén de conversaciones por sesión (en producción usar Redis o DB)
const conversationStore = new Map();
const MAX_HISTORY_LENGTH = 10; // Últimos 10 mensajes
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutos

// Limpiar sesiones expiradas cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of conversationStore.entries()) {
    if (now - data.lastActivity > SESSION_TIMEOUT) {
      conversationStore.delete(sessionId);
      console.log(`🗑️ Sesión ${sessionId} expirada y eliminada`);
    }
  }
}, 10 * 60 * 1000);

// Obtener historial de conversación
function getConversationHistory(sessionId) {
  if (!sessionId) return [];
  
  const data = conversationStore.get(sessionId);
  if (!data) return [];
  
  // Actualizar actividad
  data.lastActivity = Date.now();
  
  return data.history || [];
}

// Agregar mensaje al historial
function addToConversationHistory(sessionId, role, content) {
  if (!sessionId) return;
  
  let data = conversationStore.get(sessionId);
  if (!data) {
    data = {
      history: [],
      lastActivity: Date.now(),
      sentiment: 'neutral',
      urgency: 'normal'
    };
    conversationStore.set(sessionId, data);
  }
  
  // Agregar mensaje
  data.history.push({ role, content });
  data.lastActivity = Date.now();
  
  // Mantener solo los últimos N mensajes
  if (data.history.length > MAX_HISTORY_LENGTH) {
    data.history = data.history.slice(-MAX_HISTORY_LENGTH);
  }
  
  console.log(`💬 Historial ${sessionId}: ${data.history.length} mensajes`);
}

// Actualizar sentimiento de la sesión
function updateSessionSentiment(sessionId, sentiment, urgency) {
  if (!sessionId) return;
  
  const data = conversationStore.get(sessionId);
  if (data) {
    data.sentiment = sentiment;
    data.urgency = urgency;
    data.lastActivity = Date.now();
  }
}

// Obtener contexto de sesión
function getSessionContext(sessionId) {
  if (!sessionId) return null;
  
  const data = conversationStore.get(sessionId);
  return data ? {
    sentiment: data.sentiment,
    urgency: data.urgency,
    messageCount: data.history?.length || 0
  } : null;
}

// Limpiar historial de una sesión
function clearConversationHistory(sessionId) {
  if (sessionId) {
    conversationStore.delete(sessionId);
    console.log(`🗑️ Historial ${sessionId} eliminado manualmente`);
  }
}

// Verificar si la IA está configurada
function isAIEnabled() {
  return anthropic !== null;
}

// Llamada simple a Claude (para validaciones rápidas)
async function askClaudeSimple(prompt) {
  if (!isAIEnabled()) {
    throw new Error('Claude AI no está configurado');
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307', // Modelo rápido y económico
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return message.content[0].text;
  } catch (error) {
    console.error('❌ Error en askClaudeSimple:', error.message);
    throw error;
  }
}

// Generar respuesta mejorada con contexto y memoria conversacional
async function generateEnhancedResponse(query, confluenceResults = [], excelResults = [], sessionId = null) {
  if (!isAIEnabled()) {
    console.log('⚠️ Claude AI no está configurado');
    return null;
  }

  try {
    // Obtener historial conversacional
    const history = sessionId ? getConversationHistory(sessionId) : [];
    const sessionContext = sessionId ? getSessionContext(sessionId) : null;
    
    // Preparar contexto de resultados
    let context = `Usuario pregunta: "${query}"\n\n`;
    
    if (confluenceResults.length > 0) {
      context += `INFORMACIÓN DE CONFLUENCE:\n`;
      confluenceResults.forEach((faq, i) => {
        context += `${i + 1}. Pregunta: ${faq.pregunta}\n`;
        context += `   Aplicación: ${faq.aplicacion}\n`;
        context += `   Respuesta: ${faq.respuesta}\n\n`;
      });
    }
    
    if (excelResults.length > 0) {
      context += `CASOS HISTÓRICOS:\n`;
      excelResults.slice(0, 3).forEach((caso, i) => {
        context += `${i + 1}. ${caso.asunto}\n`;
        if (caso.solucion) context += `   Solución: ${caso.solucion}\n`;
        context += `   Estado: ${caso.estado}\n\n`;
      });
    }

    // Agregar contexto de sesión si existe
    let sessionInfo = '';
    if (sessionContext) {
      sessionInfo = `\nCONTEXTO DE SESIÓN:
- Sentimiento del usuario: ${sessionContext.sentiment}
- Urgencia: ${sessionContext.urgency}
- Mensajes previos en conversación: ${sessionContext.messageCount}
`;
      
      // Ajustar tono según sentimiento
      if (sessionContext.sentiment === 'frustrated' || sessionContext.urgency === 'critical') {
        sessionInfo += `\n⚠️ IMPORTANTE: El usuario muestra frustración o tiene un problema urgente. Prioriza soluciones rápidas y claras.\n`;
      }
    }

    console.log(`🤖 Consultando Claude AI... ${history.length > 0 ? `(con ${history.length} mensajes de contexto)` : '(nueva conversación)'}`);
    
    // Construir mensajes con historial
    const messages = [];
    
    // Agregar historial previo (últimos 6 mensajes para no sobrecargar)
    if (history.length > 0) {
      const recentHistory = history.slice(-6);
      messages.push(...recentHistory);
    }
    
    // Agregar mensaje actual
    messages.push({
      role: 'user',
      content: `Eres un asistente técnico experto en Oracle Utilities (C2M, FIELD, SALES, SERVICE).

${context}${sessionInfo}

INSTRUCCIONES:
- Genera una respuesta clara y concisa en español
- Usa la información de Confluence y casos históricos proporcionados
- Si el usuario hace seguimiento a algo anterior, usa el contexto de la conversación
- Si hay soluciones específicas, mencionarlas paso a paso
- Si no hay información suficiente, dilo claramente
- Máximo 3-4 párrafos

Respuesta:`
    });
    
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: messages
    });

    const aiResponse = message.content[0].text;
    console.log('✅ Respuesta generada por Claude');
    
    // Guardar en historial
    if (sessionId) {
      addToConversationHistory(sessionId, 'user', query);
      addToConversationHistory(sessionId, 'assistant', aiResponse);
    }
    
    return aiResponse;

  } catch (error) {
    console.error('❌ Error al generar respuesta con Claude:', error.message);
    return null;
  }
}

// Resumir texto largo
async function summarizeText(text, maxLength = 200) {
  if (!isAIEnabled()) {
    // Fallback: truncar simplemente
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Resume el siguiente texto en máximo ${maxLength} caracteres, manteniendo la información técnica más importante:

${text}

Resumen:`
      }]
    });

    return message.content[0].text;

  } catch (error) {
    console.error('❌ Error al resumir con Claude:', error.message);
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
}

// Traducir texto español-inglés o inglés-español
async function translateText(text, targetLang = 'en') {
  if (!isAIEnabled()) {
    console.log('⚠️ Traducción no disponible sin Claude AI');
    return null;
  }

  try {
    const langName = targetLang === 'en' ? 'inglés' : 'español';
    
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Traduce el siguiente texto a ${langName}. Mantén el formato y términos técnicos:

${text}

Traducción:`
      }]
    });

    return message.content[0].text;

  } catch (error) {
    console.error('❌ Error al traducir con Claude:', error.message);
    return null;
  }
}

// Analizar sentimiento del usuario
async function analyzeSentiment(userMessage) {
  if (!isAIEnabled()) {
    return { sentiment: 'neutral', urgency: 'normal' };
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Analiza el sentimiento y urgencia del siguiente mensaje de usuario. Responde SOLO con un JSON:

"${userMessage}"

Formato: {"sentiment": "positive|neutral|negative|frustrated", "urgency": "low|normal|high|critical"}

JSON:`
      }]
    });

    const response = message.content[0].text.trim();
    return JSON.parse(response);

  } catch (error) {
    console.error('❌ Error al analizar sentimiento:', error.message);
    return { sentiment: 'neutral', urgency: 'normal' };
  }
}

// Búsqueda semántica: expandir query con sinónimos y términos relacionados
async function semanticSearch(query) {
  if (!isAIEnabled()) {
    return [query]; // Devolver solo la query original
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Dado este término de búsqueda: "${query}"

Genera una lista de términos relacionados, sinónimos y variaciones en español que podrían encontrarse en documentación técnica de Oracle Utilities.

Responde SOLO con un array JSON de strings. Máximo 5 términos.

JSON:`
      }]
    });

    const response = message.content[0].text.trim();
    const terms = JSON.parse(response);
    return [query, ...terms]; // Incluir query original

  } catch (error) {
    console.error('❌ Error en búsqueda semántica:', error.message);
    return [query];
  }
}

// Clasificar automáticamente el tipo de consulta
async function classifyQuery(query) {
  if (!isAIEnabled()) {
    return { type: 'general', category: 'otros', confidence: 0.5 };
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: `Clasifica la siguiente consulta de usuario en Oracle Utilities:

"${query}"

Responde SOLO con un JSON:
{
  "type": "technical|advisory|incident|howto|data_request|other",
  "category": "c2m|field|sales|service|general",
  "confidence": 0.0-1.0,
  "suggestedAction": "search|create_ticket|escalate|provide_tutorial"
}

JSON:`
      }]
    });

    const response = message.content[0].text.trim();
    return JSON.parse(response);

  } catch (error) {
    console.error('❌ Error clasificando consulta:', error.message);
    return { type: 'general', category: 'general', confidence: 0.5, suggestedAction: 'search' };
  }
}

// Generar reporte de consultas frecuentes
async function generateReport(queries, type = 'frequent') {
  if (!isAIEnabled()) {
    return 'Reporte no disponible sin Claude AI configurado.';
  }

  try {
    let prompt = '';
    
    if (type === 'frequent') {
      const queryList = queries.map((q, i) => `${i + 1}. ${q.question} (${q.count || 1} veces)`).join('\n');
      prompt = `Genera un reporte ejecutivo de las consultas más frecuentes:

${queryList}

Incluye:
- Análisis de tendencias
- Áreas que necesitan más documentación
- Recomendaciones para FAQ
- Problemas recurrentes

Máximo 500 palabras.`;
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return message.content[0].text;

  } catch (error) {
    console.error('❌ Error generando reporte:', error.message);
    return `Error al generar reporte: ${error.message}`;
  }
}

// Analizar datos y generar insights
async function analyzeDataInsights(query, data, dataType = 'excel') {
  if (!isAIEnabled()) {
    return {
      analysis: 'Análisis de IA no disponible. Mostrando datos sin procesar.',
      hasInsights: false
    };
  }

  try {
    // Preparar resumen de los datos
    let dataContext = '';
    let instructions = '';
    
    if (dataType === 'aggregated') {
      // Datos ya agregados (ej: conteo por tema)
      dataContext = `DATOS AGREGADOS:\n${JSON.stringify(data, null, 2)}`;
      instructions = `INSTRUCCIONES:
- Analiza los datos y responde la pregunta del usuario
- Identifica patrones, tendencias y los valores más relevantes
- Si hay "mayor número" o "más casos", ordena y destaca el top 3-5
- Presenta los números de forma clara con porcentajes si es relevante
- Usa formato markdown con bullets y tablas si es apropiado
- Máximo 400 palabras`;
    } else if (dataType === 'filtered-summary') {
      // Pre-filtrado en backend, solo resumen
      dataContext = `RESUMEN DE DATOS YA FILTRADOS:\n${JSON.stringify(data, null, 2)}`;
      instructions = `INSTRUCCIONES:
- Los datos ya fueron filtrados por el periodo solicitado
- El campo "total" indica el número de casos encontrados
- Presenta el resultado de forma clara y concisa
- Muestra top 3-5 especialistas/temas si están disponibles
- Formato: "Se encontraron X casos en [periodo]" + resumen
- Máximo 150 palabras`;
    } else if (dataType === 'temporal' || dataType === 'analyst') {
      // Datos ya filtrados (menos de 100 registros)
      dataContext = `DATOS FILTRADOS (${data.length} registros):\n${JSON.stringify(data.slice(0, 50), null, 2)}`;
      instructions = `INSTRUCCIONES:
- Los datos ya fueron filtrados por el periodo solicitado
- **NO LISTES** los casos individualmente
- Responde con el total: "Se encontraron ${data.length} casos [periodo]"
- Opcionalmente muestra top 3 temas/especialistas si es relevante
- Máximo 150 palabras`;
    } else {
      // Datos individuales (consultas generales)
      const summary = {
        total: data.length,
        sample: data.slice(0, 10)
      };
      dataContext = `DATOS (${data.length} registros):\n${JSON.stringify(summary, null, 2)}`;
      instructions = `INSTRUCCIONES:
- Analiza los datos y responde la pregunta del usuario
- Identifica patrones, tendencias y los valores más relevantes
- Si hay "mayor número" o "más casos", ordena y destaca el top 3-5
- Presenta los números de forma clara con porcentajes si es relevante
- Usa formato markdown con bullets y tablas si es apropiado
- Máximo 400 palabras`;
    }

    console.log('🤖 Analizando datos con Claude AI...');
    
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Eres un analista de datos experto en Oracle Utilities.

Usuario pregunta: "${query}"

${dataContext}

${instructions}

Respuesta:`
      }]
    });

    const aiResponse = message.content[0].text;
    console.log('✅ Análisis generado por Claude');
    
    return {
      analysis: aiResponse,
      hasInsights: true,
      rawData: data
    };

  } catch (error) {
    console.error('❌ Error al analizar datos con Claude:', error.message);
    
    // Manejo específico de errores de la API
    let userMessage = 'No pude analizar los datos en este momento.';
    
    if (error.status === 529 || error.message.includes('overloaded')) {
      userMessage = '⚠️ El servicio de análisis está temporalmente sobrecargado. Los datos están disponibles pero no puedo generar el análisis en este momento. Por favor, intenta nuevamente en unos segundos.';
    } else if (error.status === 429) {
      userMessage = '⚠️ Se ha alcanzado el límite de solicitudes. Por favor, espera un momento antes de intentar nuevamente.';
    } else if (error.message.includes('API key')) {
      userMessage = '⚠️ Error de configuración del servicio de análisis. Por favor, contacta al administrador.';
    }
    
    return {
      analysis: userMessage,
      hasInsights: false,
      rawData: data,
      error: true
    };
  }
}

// Detectar si es una pregunta analítica (agregación/estadísticas)
function isAnalyticalQuery(query) {
  const analyticalKeywords = [
    'cuantos', 'cuántos', 'cantidad', 'total', 'suma',
    'mayor', 'menor', 'mas', 'más', 'menos',
    'promedio', 'media', 'estadisticas', 'estadísticas',
    'top', 'ranking', 'listado',
    'distribucion', 'distribución', 'agrupado', 'agrupados',
    'por estado', 'por tema', 'por tipo', 'por aplicacion', 'por aplicación',
    'resumen', 'overview', 'panorama',
    'comparar', 'comparación', 'diferencia',
    'tendencia', 'patron', 'patrón'
  ];
  
  const queryLower = query.toLowerCase();
  return analyticalKeywords.some(keyword => queryLower.includes(keyword));
}

// ============================================
// GENERADOR DE RESPUESTAS CONVERSACIONALES
// ============================================
/**
 * Genera una respuesta conversacional natural usando Claude
 * @param {string} systemPrompt - Instrucciones del sistema
 * @param {string} userMessage - Mensaje del usuario con contexto
 * @returns {Promise<string>} - Respuesta conversacional generada
 */
async function generateConversationalResponse(systemPrompt, userMessage) {
  if (!anthropic) {
    console.log('⚠️ Claude AI no disponible, usando respuesta por defecto');
    return 'Encontré información relevante para tu consulta. ¿Te gustaría que profundice en algún aspecto específico?';
  }
  
  try {
    console.log('🤖 Generando respuesta conversacional con Claude...');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      temperature: 0.7, // Más creativo para conversación natural
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: userMessage
      }]
    });
    
    const conversationalText = response.content[0].text;
    console.log(`✅ Respuesta generada (${conversationalText.length} caracteres)`);
    
    return conversationalText;
    
  } catch (error) {
    console.error('❌ Error al generar respuesta conversacional:', error.message);
    
    // Fallback a respuesta genérica pero útil
    if (error.status === 529 || error.message.includes('overloaded')) {
      return 'Estoy procesando mucha información en este momento. Encontré datos relevantes para tu consulta. ¿Quieres que te muestre los detalles?';
    }
    
    return 'He encontrado información relacionada con tu consulta. ¿Te gustaría revisar los detalles?';
  }
}

module.exports = {
  isAIEnabled,
  askClaudeSimple, // Nueva función simple para validaciones
  generateEnhancedResponse,
  summarizeText,
  translateText,
  analyzeSentiment,
  semanticSearch,
  classifyQuery,
  generateReport,
  analyzeDataInsights,
  isAnalyticalQuery,
  generateConversationalResponse, // Nuevo método
  // Funciones de memoria conversacional
  getConversationHistory,
  addToConversationHistory,
  updateSessionSentiment,
  getSessionContext,
  clearConversationHistory
};


