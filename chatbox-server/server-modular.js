/**
 * 🚀 SERVER MODULAR (PRODUCCIÓN)
 * 
 * Servidor refactorizado con arquitectura MVC + Services.
 * Usa SOLO la carpeta src/ con código modular y organizado.
 * 
 * Ejecutar: node server-modular.js
 * Puerto: 3000 (producción)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// ============================================
// IMPORTAR ARQUITECTURA MODULAR
// ============================================
const config = require('./src/config');
const logger = require('./src/utils/logger');
const { registerRoutes } = require('./src/routes');

// ============================================
// IMPORTAR SERVICIOS
// ============================================
const aiService = require('./src/services/ai/legacy-ai.service');
const multiAIService = require('./src/services/multi-ai.service');

// ============================================
// CREAR APLICACIÓN EXPRESS
// ============================================
const app = express();
const PORT = 3000; // Puerto producción

// ============================================
// MIDDLEWARE
// ============================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../chatbox')));

// ============================================
// REGISTRAR RUTAS MODULARES (NUEVAS)
// ============================================
registerRoutes(app);

// ============================================
// RUTAS LEGACY (mantener por ahora)
// ============================================

// Endpoint para Smart Router (detección de intención)
app.post('/api/ai/smart-route', async (req, res) => {
  const { query, sessionId } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  try {
    logger.ai(`Smart Router: Analizando intención de: ${query}`);
    
    // 1. Clasificar tipo de consulta
    const classification = await aiService.classifyQuery(query);
    logger.info(`Clasificación: ${JSON.stringify(classification)}`);
    
    // 2. Expandir términos con búsqueda semántica
    const expandedTerms = await aiService.semanticSearch(query);
    logger.info(`Términos expandidos: ${expandedTerms.join(', ')}`);
    
    // 3. Analizar sentimiento
    const sentiment = await aiService.analyzeSentiment(query);
    logger.info(`Sentimiento: ${sentiment.sentiment}, Urgencia: ${sentiment.urgency}`);
    
    // 4. Actualizar contexto de sesión si existe
    if (sessionId) {
      aiService.updateSessionSentiment(sessionId, sentiment.sentiment, sentiment.urgency);
    }
    
    res.json({
      success: true,
      classification: classification,
      expandedTerms: expandedTerms,
      sentiment: sentiment,
      routing: {
        type: classification.type,
        category: classification.category,
        suggestedAction: classification.suggestedAction,
        confidence: classification.confidence
      }
    });
    
  } catch (error) {
    logger.error('Error en smart routing:', error.message);
    
    // Fallback a respuesta básica si AI falla
    res.json({
      success: true,
      classification: {
        type: 'general',
        category: 'general',
        confidence: 0.5,
        suggestedAction: 'search'
      },
      expandedTerms: [query],
      sentiment: { sentiment: 'neutral', urgency: 'normal' },
      routing: {
        type: 'general',
        category: 'general',
        suggestedAction: 'search',
        confidence: 0.5
      },
      fallback: true
    });
  }
});

// Endpoint para validación de scope (validar si pregunta está dentro del dominio)
app.post('/api/ai/validate-scope', async (req, res) => {
  const { question } = req.body;
  
  if (!question || question.trim().length === 0) {
    return res.json({ isValid: false, reason: 'Pregunta vacía' });
  }
  
  logger.ai(`Validando scope: ${question}`);
  
  try {
    // Usar Claude para determinar si la pregunta es relevante
    const validationPrompt = `Eres un filtro inteligente para un chatbot de Oracle C2M (Customer to Meter).

**TU TAREA:** Determinar si esta pregunta es relevante al dominio.

**DOMINIO VÁLIDO (Oracle C2M y ecosystem):**
- Oracle Utilities (C2M, CCB, MDM, FIELD, SALES, SERVICE)
- Sistemas de medición y facturación (billing, invoicing)
- Gestión de clientes, contratos, medidores, dispositivos
- Configuración, parametrización, troubleshooting de C2M
- Instalación de dispositivos, lectura de medidores
- Estructuras de datos (NIU, POD, SPID, Service Points, Premises)
- Procesos de negocio de utilities (billing, ciclos, rutas)
- **Facturación electrónica, reportes fiscales (DIAN, autoridades tributarias)**
- **Integraciones con sistemas externos (contabilidad, ERP, bancos)**
- **Archivos XML, formatos de intercambio, validaciones fiscales**
- **Procesos regulatorios y compliance de utilities**
- Casos de soporte OaaS históricos
- Documentación técnica y entrenamientos
- Consultas sobre funcionalidad, configuración, errores
- Análisis de datos, reportes, Excel relacionados con utilities

**FUERA DE DOMINIO (no relacionado con utilities/Oracle):**
- Preguntas personales sobre el bot (edad, nombre, sentimientos)
- Clima, deportes, entretenimiento, noticias generales
- Matemáticas/estadística no relacionadas con utilities
- Política, religión, celebridades
- Programación general no relacionada con C2M/Oracle
- Temas completamente no relacionados con utilities o tecnología

**IMPORTANTE:**
- Preguntas de definición cortas ("qué es NIU?", "qué significa POD?") son VÁLIDAS
- Términos técnicos de C2M pueden no estar en inglés (medidor=meter, dispositivo=device)
- Consultas vagas pero dentro del dominio son VÁLIDAS ("cómo crear un medidor")
- Preguntas sobre análisis de datos/Excel relacionados con C2M son VÁLIDAS

**PREGUNTA DEL USUARIO:**
"${question}"

**Responde SOLO con un JSON:**
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "reason": "breve explicación"
}

Ejemplos:
- "qué es NIU?" → {"isValid": true, "confidence": 1.0, "reason": "Pregunta sobre término técnico de C2M"}
- "cómo crear un medidor" → {"isValid": true, "confidence": 1.0, "reason": "Consulta sobre funcionalidad core de C2M"}
- "qué hora es" → {"isValid": false, "confidence": 1.0, "reason": "Pregunta no relacionada con C2M"}
- "clima mañana" → {"isValid": false, "confidence": 1.0, "reason": "Fuera del dominio de utilities"}`;

    const result = await aiService.askClaudeSimple(validationPrompt);
    
    // Parsear respuesta JSON de Claude
    let validation;
    try {
      // Intentar extraer JSON si viene con texto adicional
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        validation = JSON.parse(jsonMatch[0]);
      } else {
        validation = JSON.parse(result);
      }
    } catch (parseError) {
      logger.error('Error parseando respuesta de Claude:', result);
      // Si falla el parsing, asumir válido (fail-safe)
      validation = { isValid: true, confidence: 0.5, reason: 'No se pudo validar, permitiendo pregunta' };
    }
    
    logger.info(`Validación: ${validation.isValid ? '✓ VÁLIDA' : '✗ FUERA DE SCOPE'} (${(validation.confidence * 100).toFixed(0)}%)`);
    logger.info(`Razón: ${validation.reason}`);
    
    res.json(validation);
    
  } catch (error) {
    logger.error('Error en validación de scope:', error.message);
    // Fail-safe: si hay error, permitir la pregunta
    res.json({ 
      isValid: true, 
      confidence: 0.5, 
      reason: 'Error en validación, permitiendo pregunta por seguridad' 
    });
  }
});

// Endpoint para búsqueda en Confluence (mantener)
app.post('/api/search-confluence', async (req, res) => {
  // Implementación legacy...
  res.json({ message: 'Endpoint legacy en migración' });
});

// Endpoint para Multi-IA (mantener)
app.post('/api/ask-multi-ai', async (req, res) => {
  try {
    const { query, faqs = [], sessionId } = req.body;
    
    logger.ai(`Multi-IA request: ${query}`);
    
    // Usar askMultiAI (nombre correcto de la exportación)
    const result = await multiAIService.askMultiAI(query, faqs, sessionId);
    
    res.json({
      success: true,
      answer: result.answer,
      aiUsed: result.aiUsed,
      method: result.method,
      tokens: result.totalTokens || 0
    });
  } catch (error) {
    logger.error('Error en Multi-IA:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Más endpoints legacy aquí...
// (Se irán migrando gradualmente)

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint no encontrado',
    path: req.path
  });
});

// ============================================
// ERROR HANDLER GLOBAL
// ============================================
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({
    success: false,
    message: 'Error interno del servidor',
    error: config.IS_DEV ? err.message : undefined
  });
});

// ============================================
// INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  logger.banner([
    '🚀 SERVIDOR MODULAR - PRODUCCIÓN',
    '',
    '✅ Arquitectura: MVC + Services',
    '✅ Todos los servicios en src/',
    '✅ Código modular y mantenible',
    '✅ Logging mejorado',
    '',
    '📁 Estructura:',
    '   src/config/       - Configuración centralizada',
    '   src/services/     - Lógica de negocio',
    '   src/controllers/  - Handlers de endpoints',
    '   src/routes/       - Definición de rutas',
    '   src/utils/        - Utilidades',
    '',
    `🌐 Endpoints disponibles:`,
    `   - POST /api/ai/classify-question-type`,
    `   - GET  /api/ai/status`,
    `   - GET  /api/health`,
    `   - POST /api/ask-multi-ai`,
    '',
    `🚀 Servidor corriendo en puerto ${PORT}`,
    `   http://localhost:${PORT}`,
    `   ✅ Listo para producción con ngrok`,
    ''
  ]);
});

// ============================================
// MANEJO DE ERRORES NO CAPTURADOS
// ============================================
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});
