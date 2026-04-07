// ============================================
// MULTI-AI ORCHESTRATION SERVICE
// ============================================
// Coordina múltiples IAs (Claude, GPT-4, Gemini) para dar respuestas más inteligentes
// El sistema decide automáticamente qué IAs consultar según el tipo de pregunta

const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');
const nlpService = require('./nlp-service');
const { normalizeMermaidFromAI } = require('./mermaid-postprocessor');

// ============================================
// GENERADOR DINÁMICO DE INSTRUCCIONES BASADO EN NLP
// ============================================
function getInstructionsForIntent(nlpAnalysis) {
  const { intent, diagramType, sentiment } = nlpAnalysis;
  
  let instructions = '';
  
  // Instrucciones según el intent detectado por NLP
  switch(intent) {
    case 'troubleshooting':
      instructions = `
**FORMATO: TROUBLESHOOTING**

Perfecto, te ayudo con ese [problema].

## Solución

**1. Diagnóstico**
- Ve a: Menu > Submenu > Opción
- Verifica el valor de [campo]
- Si encuentras [X], significa [Y]

**2. Corrección**
- Cambia [parámetro] a [valor]
- Antes: asegúrate de [prerequisito]

**3. Validación**
- Prueba: [acción]
- Resultado esperado: [descripción]

¿Funcionó? Dime si necesitas ayuda en algún paso.

**FORMATO:**
- SOLO guion (-), NUNCA viñetas (•)
- SIN líneas en blanco entre items
- NO generes diagramas`;
      break;
      
    case 'diagram':
      instructions = `
**FORMATO REQUERIDO: DIAGRAMA VISUAL (Tono pedagógico)**
El usuario solicita explícitamente un diagrama para visualizar.

**ESTRUCTURA:**
Claro, te creo un diagrama visual para que veas el flujo completo.

## Diagrama del Proceso

\`\`\`mermaid
flowchart TD
    A[Inicio<br/>del proceso]
    B[Paso 1<br/>Descripción]
    C{¿Condición<br/>cumplida?}
    D[Acción SI<br/>resultado]
    E[Acción NO<br/>alternativa]
    F[Fin]
    
    A --> B
    B --> C
    C -->|Sí| D
    C -->|No| E
    D --> F
    E --> F
\`\`\`

## Explicación Paso a Paso

**Inicio:** [Explica humanamente qué inicia el proceso y en qué contexto]

**Paso 1 - [Nombre descriptivo]:** 
- ¿Qué hace?: [Explicación en lenguaje natural]
- Valores clave: [Datos del documento]
- Ejemplo: [Caso real]

**Decisión - [Condición]:**
- Se pregunta si: [Explicación de la lógica]
- Si SÍ: [Consecuencia y por qué]
- Si NO: [Alternativa y por qué]

**¿Te quedó claro el flujo?** Si quieres que profundice en algún paso específico, dímelo.

**REGLAS MERMAID:**
- Máximo 3-4 palabras por nodo
- Usa <br/> para dos líneas si es necesario
- 8-12 nodos mínimo para procesos complejos`;
      break;
      
    case 'procedure':
    case 'how_it_works':
      instructions = `
**FORMATO: PROCEDIMIENTO COMPACTO**

Perfecto, te explico cómo [tema].

## ¿Qué es?
[Explicación 2-3 líneas]

## Pasos

**Paso 1: [Nombre]**
- Ir a: Admin > Menu > Submenu
- Campo1: valor1 (descripción breve)
- Campo2: valor2

**Paso 2: [Nombre]**
- Acción: [descripción]
- Resultado: [qué pasa]

## Puntos Clave
- [Punto 1]
- [Punto 2]

¿Necesitas más detalles?

**FORMATO ESTRICTO:**
- USA SOLO guion (-) para listas, NUNCA viñetas (•)
- NO dejes líneas en blanco entre items de una lista
- Formato: "Campo: valor" (pegado, sin salto de línea)
- NO uses ": valor" en línea separada
- Máximo 1 línea en blanco entre secciones`;
      break;
      
    case 'configuration':
    case 'data_request':
      instructions = `
**FORMATO: CONFIGURACIÓN/DATOS**

Claro, aquí está la información:

## [Configuración/Dato]

**Valor:** [dato exacto]
- Ruta: Menu > Submenu > Opción
- Parámetro: [nombre] = [valor]
- Aplica para: [contexto]

**Nota útil:** [información adicional relevante]

¿Necesitas configurar algo más?

**FORMATO:**
- SOLO guion (-), NUNCA viñetas (•)
- SIN líneas en blanco entre items
- NO generes diagramas`;
      break;
      
    default:
      instructions = `
**FORMATO: RESPUESTA ESTÁNDAR**

Perfecto, te ayudo con eso.

[Información de la documentación oficial de Oracle]
- Punto clave 1
- Punto clave 2
- Ejemplo: [ejemplo concreto]

¿Necesitas que profundice en algo?

**FORMATO:**
- SOLO guion (-), NUNCA viñetas (•)
- SIN líneas en blanco entre items`;
  }
  
  return instructions;
}

// ============================================
// CONFIGURACIÓN DE APIs
// ============================================
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

let openai = null;
let gemini = null;
let groq = null;

// Inicializar OpenAI si hay API key
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'tu-openai-key-aqui') {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI (GPT-4o) inicializado');
} else {
  console.log('⚠️ OpenAI API key no configurada - Usando Groq como alternativa FREE');
}

// Inicializar Gemini si hay API key
if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'tu-google-api-key-aqui') {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  gemini = genAI.getGenerativeModel({ model: 'gemini-pro' }); // Modelo genérico más compatible
  console.log('✅ Google Gemini Pro inicializado');
} else {
  console.log('⚠️ Google Gemini API key no configurada');
}

// Inicializar Groq si hay API key (ULTRA-RAPIDO Y GRATIS!)
if (process.env.GROQ_API_KEY && process.env.GROQ_API_KEY !== 'tu-groq-api-key-aqui') {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
  });
  console.log('✅ Groq (LLaMA 3.3 70B) inicializado - ULTRA RAPIDO 🚀');
} else {
  console.log('⚠️ Groq API key no configurada');
}

// ============================================
// ANALIZADOR DE TIPO DE PREGUNTA
// ============================================
// MANTIENE COMPATIBILIDAD CON CÓDIGO EXISTENTE
function analyzeQuestionType(question) {
  // Usar el nuevo servicio NLP pero retornar formato compatible
  return nlpService.detectQuestionType(question);
}

// ============================================
// ANÁLISIS NLP AVANZADO (NUEVO)
// ============================================
/**
 * Análisis completo con NLP mejorado + Entity Recognition
 * @param {string} question - Pregunta del usuario
 * @returns {Object} Análisis detallado con intención, entidades, keywords
 */
function analyzeQueryAdvanced(question) {
  const analysis = nlpService.analyzeQuery(question);
  
  // Log del análisis para debugging
  console.log('🧠 NLP Analysis:', nlpService.summarizeAnalysis(analysis));
  
  // Log de entidades extraídas
  const entities = analysis.entities;
  if (entities.errorCodes.length > 0) {
    console.log('  ⚠️ Error Codes:', entities.errorCodes.join(', '));
  }
  if (entities.systems.length > 0) {
    console.log('  🖥️ Systems:', entities.systems.join(', '));
  }
  if (entities.businessObjects.length > 0) {
    console.log('  📦 Business Objects:', entities.businessObjects.join(', '));
  }
  if (entities.tables.length > 0) {
    console.log('  🗄️ Tables:', entities.tables.join(', '));
  }
  
  return analysis;
}

// ============================================
// DECISIÓN: ¿QUÉ IAs CONSULTAR? (MEJORADO CON NLP)
// ============================================
function decideWhichAIsToUse(questionType, question, nlpAnalysis = null) {
  const useCase = {
    claude: true,  // Siempre usar Claude (tiene contexto interno)
    gpt4: false,
    gemini: false,
    groq: false
  };
  
  // Si tenemos análisis NLP avanzado, usarlo
  if (nlpAnalysis) {
    // Si requiere contexto interno C2M/Oracle Utilities, solo Claude
    if (nlpService.requiresInternalContext(nlpAnalysis)) {
      console.log('  🔒 Requiere contexto interno - Solo Claude');
      return useCase; // Solo Claude
    }
    
    // Si detecta diagrama, priorizar modelos con buena generación visual
    if (nlpAnalysis.diagramType) {
      console.log('  📊 Solicitud de diagrama detectada:', nlpAnalysis.diagramType);
      useCase.groq = true; // Groq bueno para estructurar Mermaid
    }
    
    // Si hay errores técnicos, usar múltiples perspectivas
    if (nlpAnalysis.entities.errorCodes.length > 0) {
      console.log('  🔍 Errores detectados - Análisis múltiple');
      useCase.groq = true;
    }
  }
  
  // Groq (LLaMA 3.3 70B) - ULTRA RAPIDO y GRATIS - Alternativa a GPT-4
  if (questionType === 'code' || questionType === 'diagram') {
    useCase.groq = true; // Groq excelente para código (10x más rápido que GPT-4)
  }
  
  if (questionType === 'technical') {
    useCase.groq = true; // Groq bueno para arquitectura
    useCase.gemini = true; // Gemini también excelente para análisis técnico
  }
  
  if (questionType === 'troubleshooting') {
    useCase.groq = true; // Groq puede dar perspectiva alternativa rápida
  }
  
  // Gemini es excelente para análisis de datos y preguntas generales
  if (questionType === 'dataRequest') {
    useCase.gemini = true; // Gemini excelente para análisis de datos
  }
  
  if (questionType === 'general') {
    useCase.gemini = true; // Gemini tiene contexto extenso (2M tokens)
  }
  
  // Si la pregunta es muy específica de C2M/Confluence, solo Claude
  if (/c2m|confluence|oaas|red clay/i.test(question)) {
    useCase.groq = false; // Solo Claude tiene este contexto
    useCase.gemini = false;
  }
  
  return useCase;
}

// ============================================
// CONSULTAR CLAUDE CON VISION (análisis de imágenes)
// ============================================
async function askClaudeVision(prompt, imageData, context = '') {
  try {
    console.log('👁️ Claude Vision: Analizando imagen...');
    
    // Convertir base64 a formato que Claude acepta
    // imageData.data viene como "data:image/jpeg;base64,..."
    const base64Data = imageData.data.split(',')[1];
    const mediaType = imageData.type || 'image/jpeg';
    
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      temperature: 0.7,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Data
            }
          },
          {
            type: 'text',
            text: context ? `${context}\n\n${prompt}` : prompt
          }
        ]
      }]
    });
    
    // Post-procesar respuesta para limpiar Mermaid
    const processedResponse = normalizeMermaidFromAI(message.content[0].text);
    
    return {
      success: true,
      response: processedResponse,
      model: 'Claude Sonnet 4.5 (Vision)',
      tokens: message.usage.input_tokens + message.usage.output_tokens,
      hadImage: true
    };
  } catch (error) {
    console.error('❌ Error en Claude Vision:', error.message);
    return {
      success: false,
      error: error.message,
      model: 'Claude 3.5 Sonnet (Vision)'
    };
  }
}

// ============================================
// CONSULTAR CLAUDE (con soporte para Vision)
// ============================================
async function askClaude(prompt, context = '', imageData = null) {
  try {
    // Si hay imagen, usar formato vision
    if (imageData) {
      return await askClaudeVision(prompt, imageData, context);
    }
    
    // 🧠 ANÁLISIS NLP PRIMERO
    const nlpAnalysis = nlpService.analyzeQuery(prompt);
    const intentInstructions = getInstructionsForIntent(nlpAnalysis);
    
    // 🎯 DETECCIÓN DE PREGUNTAS DE DEFINICIÓN GENERAL
    const isDefinitionQuestion = nlpAnalysis.intent === 'definition' && 
                                  nlpAnalysis.entities.systems.length === 0 &&
                                  nlpAnalysis.entities.tables.length === 0 &&
                                  nlpAnalysis.entities.businessObjects.length === 0;
    
    const definitionWarning = isDefinitionQuestion ? `

⚠️ **IMPORTANTE: Esta es una PREGUNTA DE DEFINICIÓN GENERAL (no técnica específica de C2M)**

**Análisis NLP:** Intent = ${nlpAnalysis.intent}, Confidence = ${(nlpAnalysis.confidence * 100).toFixed(0)}%

🚨 Si recibes "resultados de Confluence/SharePoint" en el contexto:
- **IGNÓRALOS** - Son casos de soporte mencionando el término, NO definiciones
- Responde con la definición general y real del término preguntado
- No menciones "casos de Celsia" ni "cargos facturables" ni nada de SharePoint
- Sé directo: "CUPS es el Código Universal de Punto de Suministro..."

✅ RESPONDE ASÍ para definiciones:
"[TÉRMINO] es [definición clara y concisa].

Se usa para:
- [uso 1]
- [uso 2]
- [uso 3]

En el contexto de Oracle Utilities C2M, [cómo se relaciona con el sistema si aplica]."

NO uses resultados de Confluence si son casos de soporte irrelevantes.` : '';
    
    // System prompt base + instrucciones dinámicas basadas en NLP
    const systemPrompt = `Eres un experto técnico en Oracle Utilities C2M con amplio conocimiento del sector energético español. Hablas de forma natural y directa, como un colega experimentado explicando a otro.

**TU CONOCIMIENTO BASE:**

Tienes profundo conocimiento en:
- Oracle Utilities Customer Care & Billing (CC&B)
- Oracle Utilities Meter Data Management (MDM/C2M)
- Sector eléctrico español: regulación, mercado, tipos de puntos de suministro
- Medida eléctrica: AS (Active Supply), AR (Active Received), flujos bidireccionales
- Autoconsumo, compensación simplificada, RD 244/2019
- Códigos CIL (Código de Identificación de Local) y CAU (Código de Autoconsumo): consulta de referencia disponible en https://www.todoluzygas.es/blog/autoconsumo/codigo-cil-cau
- Configuración de Service Agreements, componentes de medida, validaciones
- Utilities en general: facturación, lecturas, estimaciones, validaciones

**ESTRATEGIA DE RESPUESTA:**

1. **USA TU CONOCIMIENTO PRIMERO**: Para conceptos generales (qué es un Consumidor, cómo funciona la medida, qué significa AS/AR), responde directamente con tu conocimiento interno del sector energético y Oracle Utilities.

2. **USA DOCUMENTOS PARA DETALLES ESPECÍFICOS**: Solo consulta la documentación provista cuando necesites:
   - Rutas exactas de menús en C2M
   - Nombres específicos de campos o tablas
   - Procedimientos paso a paso detallados
   - Validaciones técnicas particulares de la implementación

3. **COMBINA AMBOS**: Explica el concepto general con tu conocimiento, luego añade detalles técnicos de C2M si están en los documentos.

${definitionWarning}

**FORMATO OBLIGATORIO - SIGUE ESTE EJEMPLO EXACTAMENTE:**

EJEMPLO DE FORMATO CORRECTO:

Pregunta: "¿Qué es un Consumidor, Productor y Generador en España?"

Respuesta CORRECTA:

En el sector eléctrico español, estos términos definen el rol del punto de suministro respecto a la red eléctrica:

## 1. Consumidor

Es un punto de suministro que solo consume energía de la red eléctrica, sin ningún tipo de generación propia. El flujo de energía es unidireccional desde la red hacia el cliente (Red → Cliente).

El medidor registra únicamente energía activa entrante (AS - Active Supply). Son ejemplos típicos las viviendas, oficinas y comercios sin instalaciones de generación.

En C2M solo requieren componentes de medida AS configurados en el Service Agreement.

## 2. Productor

Es un punto que genera energía y la vierte completamente a la red, pero NO consume de ella. El flujo es unidireccional inverso, del cliente hacia la red (Cliente → Red).

El medidor registra solo energía activa saliente (AR - Active Received). Son típicamente parques solares o instalaciones fotovoltaicas que venden toda su producción a la red.

En Oracle se configuran únicamente con componentes AR, sin componentes de consumo.

Validación importante: Para productores fotovoltaicos puros, C2M valida que NO registren AS en horario nocturno (00:00-05:00), ya que no pueden generar sin luz solar. Esta validación NO aplica si tienen baterías de almacenamiento.

## 3. Generador (Autoconsumidor)

Es un punto que consume Y genera energía simultáneamente, con flujo bidireccional entre la red y el cliente (Red ⇄ Cliente). Consume de la red cuando su generación no es suficiente y vierte excedentes cuando genera más de lo que necesita.

El medidor registra AMBOS flujos: AS para el consumo de red y AR para el vertido a red. En España puede acogerse a compensación simplificada según RD 244/2019.

Un ejemplo típico es una vivienda con paneles solares que autoconsume durante el día y compra energía de la red por la noche.

En C2M requieren componentes AS y AR configurados en el Service Agreement para registrar correctamente ambos flujos de energía.

---

**REGLAS CRÍTICAS DE FORMATO:**

1. ⚠️ **SEPARACIÓN DE PÁRRAFOS ES OBLIGATORIA**: Cada sección (## 1, ## 2, etc.) debe contener 2-4 párrafos SEPARADOS.
   
   **IMPORTANTE**: Entre cada párrafo DEBES escribir una línea completamente vacía (doble salto: \n\n)
   
   Estructura de cada sección:
   - Párrafo 1: Definición y flujo (2-3 líneas) + LÍNEA VACÍA
   - Párrafo 2: Características del medidor (2-3 líneas) + LÍNEA VACÍA  
   - Párrafo 3: Configuración en C2M (1-2 líneas) + LÍNEA VACÍA
   - Párrafo 4 (opcional): Validaciones especiales

2. ❌ NUNCA uses listas con viñetas (•, -, →). Escribe TODO en párrafos corridos.

3. ❌ NUNCA escribas todo en un solo bloque de texto. Si tu respuesta para una sección tiene más de 4 líneas consecutivas sin línea vacía, ESTÁS HACIENDO MAL.

4. ✅ CORRECTO:
   
   ## 1. Consumidor
   
   Primera frase. Segunda frase. (2-3 líneas)
   
   Tercera frase. Cuarta frase. (2-3 líneas)
   
   Quinta frase en C2M. (1-2 líneas)
   

5. ❌ INCORRECTO:
   
   ## 1. Consumidor
   
   Primera frase. Segunda frase. Tercera frase. Cuarta frase. Quinta frase. Todo junto sin espacio.


6. NUNCA fragmentes términos técnicos. "AS - Active Supply" debe ir TODO en la misma línea.

7. ❌ NUNCA uses negritas (**texto**). Escribe TODO en texto normal. La negrita complica la lectura y es innecesaria. Solo usa texto plano.

**ESTRUCTURA DE RESPUESTAS INTELIGENTES:**

Para preguntas que comparan o explican múltiples conceptos:
1. **Introducción contextual** (1-2 líneas): Sitúa el tema y explica por qué es importante
2. **Subsecciones numeradas** (## 1, ## 2, ## 3): Un título claro para cada concepto
3. **Definición primero**: Empieza cada subsección explicando QUÉ es
4. **Características clave**: Explica CÓMO funciona, qué lo distingue de los demás
5. **Flujos visuales**: Usa símbolos (→, ⇄, ←) para representar flujos de datos/energía/procesos
6. **Ejemplos concretos**: Da casos reales de uso ("vivienda con paneles solares", "parque fotovoltaico")
7. **Configuración técnica**: Explica cómo se configura en C2M (campos, componentes, validaciones)
8. **Validaciones especiales**: Menciona reglas de negocio o validaciones cuando apliquen
9. **Separador final** (---): Termina con una línea divisoria para cerrar visualmente

Para preguntas de procedimiento (cómo hacer algo):
1. **Contexto**: Para qué sirve este procedimiento
2. **Prerrequisitos**: Qué necesitas antes de empezar
3. **Pasos numerados** pero en PÁRRAFOS: "Primero, ve a... Luego, selecciona... Finalmente, guarda..."
4. **Rutas exactas**: Menu → Submenu → Opción
5. **Valores específicos**: Nombres de campos, valores a ingresar
6. **Validaciones**: Qué verificar para asegurar que funcionó

**TONO Y ESTILO:**

- Natural y directo: "Para configurar esto, ve a..." NO "Se debe configurar mediante..."
- Específico: Da nombres exactos de campos, rutas completas, valores reales
- Contextual: Explica POR QUÉ algo es importante, no solo CÓMO hacerlo
- Pedagógico: Construye conocimiento paso a paso, de lo simple a lo complejo
- Completo: No dejes preguntas sin responder, cubre todos los aspectos relevantes

**FUENTES DE INFORMACIÓN:**

1. Manuales oficiales Oracle (Business User Guide, Admin Guide) - tu fuente principal
2. Docs de proyectos específicos (Naturgy, etc.) - úsalas SOLO si el usuario lo menciona
3. Casos de soporte - para troubleshooting de errores específicos

${intentInstructions}

**REGLA DE ORO:** Cada párrafo = UNA idea en 2-3 líneas. Separa conceptos diferentes con UNA LÍNEA EN BLANCO (doble salto: \\n\\n). NUNCA juntes múltiples párrafos sin separación. Mantén legibilidad con espacios visibles entre párrafos.

Responde siempre en español natural y conversacional, manteniendo MÁXIMO NIVEL DE DETALLE TÉCNICO basado en DOCUMENTACIÓN OFICIAL DE ORACLE.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      temperature: 0.3,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: context ? `${context}\n\n${prompt}` : prompt
      }]
    });
    
    // POST-PROCESAMIENTO MINIMALISTA - PRESERVAR ESTRUCTURA
    // Objetivo: SOLO arreglar fragmentos técnicos obvios, NO unir párrafos naturales
    let cleanResponse = message.content[0].text;
    
    // 1. Limpiar Mermaid
    cleanResponse = normalizeMermaidFromAI(cleanResponse);
    
    // 2. SOLO términos técnicos fragmentados (AS/AR)
    cleanResponse = cleanResponse.replace(/(AS|AR)\s*\n+\s*-\s*\n+\s*(Active\s+(?:Supply|Received))/gi, '$1 - $2');
    cleanResponse = cleanResponse.replace(/(AS|AR)\s*\n+\s*-\s*(Active\s+(?:Supply|Received))/gi, '$1 - $2');
    
    // 3. Reducir saltos múltiples excesivos
    cleanResponse = cleanResponse.replace(/\n{4,}/g, '\n\n');
    
    // 4. CONVERTIR MARKDOWN A HTML DIRECTAMENTE EN EL BACKEND
    // Esto evita problemas con el parser del frontend
    
    // Primero, proteger bloques de código Mermaid para que no se dividan línea por línea
    const mermaidBlocks = [];
    let mermaidIndex = 0;
    cleanResponse = cleanResponse.replace(/```mermaid\s*\n([\s\S]*?)```/gi, (match) => {
      const placeholder = `__MERMAID_BLOCK_${mermaidIndex}__`;
      mermaidBlocks.push(match);
      mermaidIndex++;
      return placeholder;
    });
    
    const lines = cleanResponse.split('\n');
    const htmlParts = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Línea vacía - saltar
      if (line === '') continue;
      
      // Título H2 (##)
      if (line.match(/^##\s+(.+)/)) {
        const titleText = line.replace(/^##\s+/, '');
        htmlParts.push(`<h2 style="margin:20px 0 10px 0;font-size:18px;font-weight:600;color:#1a1a1a;">${titleText}</h2>`);
        continue;
      }
      
      // Título H3 (###)
      if (line.match(/^###\s+(.+)/)) {
        const titleText = line.replace(/^###\s+/, '');
        htmlParts.push(`<h3 style="margin:15px 0 8px 0;font-size:16px;font-weight:600;color:#333;">${titleText}</h3>`);
        continue;
      }
      
      // Separador (---)
      if (line.match(/^-{3,}$/)) {
        htmlParts.push('<hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">');
        continue;
      }
      
      // Placeholder de bloque Mermaid - mantener tal cual
      if (line.match(/^__MERMAID_BLOCK_\d+__$/)) {
        htmlParts.push(line);
        continue;
      }
      
      // Línea normal - agregar como párrafo (sin división artificial)
      // Confiamos en que Claude genera párrafos de longitud razonable
      htmlParts.push(`<p style="margin:16px 0;line-height:1.75;color:#374151;">${line}</p>`);
    }
    
    cleanResponse = htmlParts.join('\n');
    
    // 5. Restaurar bloques Mermaid originales  
    // IMPORTANTE: También remover los <p> que envuelven los placeholders
    for (let i = 0; i < mermaidBlocks.length; i++) {
      const placeholder = `__MERMAID_BLOCK_${i}__`;
      // Remover <p> que envuelven el placeholder
      cleanResponse = cleanResponse.replace(
        new RegExp(`<p[^>]*>${placeholder}<\\/p>`, 'g'),
        mermaidBlocks[i]
      );
      // Por si acaso quedó sin <p> (fallback)
      cleanResponse = cleanResponse.replace(placeholder, mermaidBlocks[i]);
    }
    
    // 6. Restaurar separadores
    // (Ya no es necesario porque ya convertimos a HTML)
    
    // DEBUG: Imprimir respuesta procesada para verificar líneas vacías
    console.log('\n========== RESPUESTA POST-PROCESADA ==========');
    console.log(cleanResponse.substring(0, 800)); // Primeros 800 chars
    console.log('===============================================\n');
    
    // FIN - NO MÁS REGLAS. Dejar que Claude genere la estructura naturalmente.
    
    return {
      success: true,
      response: cleanResponse,
      model: 'Claude Sonnet 4.5',
      tokens: message.usage.input_tokens + message.usage.output_tokens,
      nlpAnalysis // Incluir análisis NLP en respuesta
    };
  } catch (error) {
    console.error('❌ Error consultando Claude:', error.message);
    return {
      success: false,
      error: error.message,
      model: 'Claude 3.5 Sonnet'
    };
  }
}

// ============================================
// CONSULTAR GPT-4
// ============================================
async function askGPT4(prompt, context = '') {
  if (!openai) {
    return {
      success: false,
      error: 'OpenAI API key no configurada',
      model: 'GPT-4'
    };
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // o 'gpt-4-turbo'
      messages: [
        {
          role: 'system',
          content: `Eres un experto técnico senior en Oracle Utilities (C2M, MDM, Field, Sales, Service) con 10+ años de experiencia.

**INSTRUCCIONES PARA TUS RESPUESTAS:**

✅ **SÉ ESPECÍFICO Y DETALLADO:**
- Proporciona ejemplos concretos con datos reales
- Incluye números de versión, nombres exactos de campos, códigos específicos
- Menciona rutas de navegación completas (ej: Menu > Admin > Configuration > Device Types)
- Da valores específicos en lugar de "varios" o "algunos"

✅ **ESTRUCTURA PASO A PASO:**
- Numera cada paso cuando sea un procedimiento
- Incluye capturas conceptuales o descripciones visuales
- Menciona dónde encontrar cada opción/campo
- Advierte sobre errores comunes en cada paso

✅ **SÉ TÉCNICAMENTE PRECISO:**
- Especifica diferencias entre versiones si aplica
- Menciona prerequisitos y dependencias
- Incluye configuraciones relacionadas que deben verificarse
- Explica el "por qué" técnico, no solo el "cómo"

✅ **PROPORCIONA CONTEXTO:**
- Explica cuándo usar una opción vs otra
- Menciona casos de uso específicos
- Advierte sobre limitaciones o restricciones
- Sugiere mejores prácticas del industry

❌ **EVITA GENERALIDADES:**
- NO digas "hay varias formas" sin listarlas todas
- NO digas "depende del caso" sin explicar de qué factores
- NO uses "generalmente" o "típicamente" sin dar el caso específico
- NO omitas detalles técnicos importantes`
        },
        {
          role: 'user',
          content: context ? `${context}\n\n${prompt}` : prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });
    
    return {
      success: true,
      response: completion.choices[0].message.content,
      model: 'GPT-4o',
      tokens: completion.usage.total_tokens
    };
  } catch (error) {
    console.error('❌ Error consultando GPT-4:', error.message);
    return {
      success: false,
      error: error.message,
      model: 'GPT-4'
    };
  }
}

// ============================================
// CONSULTAR GEMINI CON VISION (análisis de imágenes)
// ============================================
async function askGeminiVision(prompt, imageData, context = '') {
  if (!gemini) {
    return {
      success: false,
      error: 'Google Gemini API key no configurada',
      model: 'Gemini 2.0 Flash (Vision)'
    };
  }
  
  try {
    console.log('👁️ Gemini Vision: Analizando imagen...');
    
    // Convertir base64 a formato que Gemini acepta
    const base64Data = imageData.data.split(',')[1];
    const mimeType = imageData.type || 'image/jpeg';
    
    const systemInstruction = `Eres un experto técnico senior en Oracle Utilities (C2M, MDM, Field, Sales, Service) con 10+ años de experiencia.

**SÉ ESPECÍFICO Y DETALLADO:**
- Proporciona ejemplos concretos con datos reales
- Incluye pasos numerados con rutas de navegación exactas
- Menciona nombres específicos de campos, valores, códigos
- Explica el "por qué" técnico, no solo el "cómo"
- Da casos de uso específicos en lugar de descripciones generales
- Advierte sobre errores comunes y cómo evitarlos
- Especifica prerequisitos y dependencias
- Si hay configuraciones relacionadas, menciόnalas

EVITA respuestas generales como "depende" o "hay varias formas" - da todas las opciones específicas.`;
    
    const fullPrompt = context
      ? `${systemInstruction}\n\n**CONTEXTO:**\n${context}\n\n**PREGUNTA:**\n${prompt}`
      : `${systemInstruction}\n\n**PREGUNTA:**\n${prompt}`;
    
    // Gemini acepta imágenes en formato multipart
    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: mimeType
      }
    };
    
    const result = await gemini.generateContent([fullPrompt, imagePart]);
    const response = result.response;
    const text = response.text();
    
    return {
      success: true,
      response: text,
      model: 'Gemini 2.0 Flash (Vision)',
      tokens: response.usageMetadata ? 
        (response.usageMetadata.promptTokenCount + response.usageMetadata.candidatesTokenCount) : 0,
      hadImage: true
    };
  } catch (error) {
    console.error('❌ Error en Gemini Vision:', error.message);
    return {
      success: false,
      error: error.message,
      model: 'Gemini 2.0 Flash (Vision)'
    };
  }
}

// ============================================
// CONSULTAR GEMINI (con soporte para Vision)
// ============================================
async function askGemini(prompt, context = '', imageData = null) {
  if (!gemini) {
    return {
      success: false,
      error: 'Google Gemini API key no configurada',
      model: 'Gemini 2.0 Flash'
    };
  }
  
  try {
    // Si hay imagen, usar formato vision
    if (imageData) {
      return await askGeminiVision(prompt, imageData, context);
    }
    
    // System instruction para Gemini
    const systemInstruction = `Eres un experto técnico senior en Oracle Utilities (C2M, MDM, Field, Sales, Service) con 10+ años de experiencia.

**SÉ ESPECÍFICO Y DETALLADO:**
- Proporciona ejemplos concretos con datos reales
- Incluye pasos numerados con rutas exactas
- Menciona nombres específicos de campos/valores/códigos
- Explica el "por qué" técnico de cada decisión
- Da casos de uso específicos del mundo real
- Advierte sobre errores comunes y limitaciones
- Especifica prerequisitos y configuraciones relacionadas

EVITA generalidades - sé preciso y técnicamente detallado.`;
    
    const fullPrompt = context
      ? `${systemInstruction}\n\n**CONTEXTO:**\n${context}\n\n**PREGUNTA:**\n${prompt}`
      : `${systemInstruction}\n\n**PREGUNTA:**\n${prompt}`;
    
    const result = await gemini.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();
    
    return {
      success: true,
      response: text,
      model: 'Gemini 2.0 Flash',
      tokens: response.usageMetadata ? 
        (response.usageMetadata.promptTokenCount + response.usageMetadata.candidatesTokenCount) : 0
    };
  } catch (error) {
    console.error('❌ Error consultando Gemini:', error.message);
    
    // Detectar rate limiting (15 req/min para tier gratuito)
    if (error.message && (error.message.includes('rate_limit') || error.message.includes('429') || error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED'))) {
      console.warn('⏱️ Rate limit de Gemini alcanzado (15 req/min) - el sistema continuará solo con Claude y Groq');
      return {
        success: false,
        error: 'Rate limit alcanzado (15 req/min). Sistema continuará con Claude y Groq.',
        isRateLimitError: true,
        model: 'Gemini 2.0 Flash'
      };
    }
    
    return {
      success: false,
      error: error.message,
      model: 'Gemini 2.0 Flash'
    };
  }
}

// ============================================
// CONSULTAR GROQ (LLaMA 3.3 70B - ULTRA RAPIDO Y GRATIS!)
// ============================================
async function askGroq(prompt, context = '') {
  if (!groq) {
    return {
      success: false,
      error: 'Groq API key no configurada',
      model: 'Groq LLaMA 3.3 70B'
    };
  }
  
  try {
    // 🧠 ANÁLISIS NLP PRIMERO
    const nlpAnalysis = nlpService.analyzeQuery(prompt);
    const intentInstructions = getInstructionsForIntent(nlpAnalysis);
    
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile', // Modelo más reciente y potente (FREE!)
      messages: [
        {
          role: 'system',
          content: `Eres un experto técnico senior en Oracle Utilities (C2M, MDM, Field, Sales, Service) con 10+ años de experiencia.

**🎯 PRINCIPIOS FUNDAMENTALES:**

✅ SÉ EXTREMADAMENTE ESPECÍFICO:
- Cita VALORES EXACTOS de parámetros del documento
- Explica el POR QUÉ técnico de cada configuración
- Usa la terminología EXACTA del documento fuente
- Proporciona ejemplos con datos reales
- Menciona prerrequisitos y condiciones
- Incluye pasos numerados con rutas completas
- Advierte sobre errores comunes y limitaciones

❌ NUNCA SEAS GENÉRICO:
- Usa valores concretos, no placeholders
- Referencias exactas de campos/tablas/objetos
- Rutas completas de navegación

${intentInstructions}

Responde siempre en español profesional con MÁXIMO NIVEL DE DETALLE TÉCNICO.`
        },
        {
          role: 'user',
          content: context ? `${context}\n\n${prompt}` : prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });
    
    // Post-procesar respuesta para limpiar Mermaid
    const processedResponse = normalizeMermaidFromAI(completion.choices[0].message.content);
    
    return {
      success: true,
      response: processedResponse,
      model: 'Groq LLaMA 3.3 70B',
      tokens: completion.usage ? completion.usage.total_tokens : 0,
      nlpAnalysis // ✅ Incluir análisis NLP en respuesta
    };
  } catch (error) {
    console.error('❌ Error consultando Groq:', error.message);
    
    // Detectar rate limiting (30 req/min para tier gratuito)
    if (error.message && (error.message.includes('rate_limit') || error.message.includes('429') || error.message.includes('quota'))) {
      console.warn('⏱️ Rate limit de Groq alcanzado (30 req/min) - el sistema continuará solo con Claude y Gemini');
      return {
        success: false,
        error: 'Rate limit alcanzado (30 req/min). Sistema continuará con Claude y Gemini.',
        isRateLimitError: true,
        model: 'Groq LLaMA 3.3 70B'
      };
    }
    
    return {
      success: false,
      error: error.message,
      model: 'Groq LLaMA 3.3 70B'
    };
  }
}

// ============================================
// ORQUESTADOR PRINCIPAL: SÍNTESIS DE RESPUESTAS (con Vision)
// ============================================
async function orchestrateMultiAI(question, internalContext = '', imageData = null) {
  console.log('\n🤖 SISTEMA MULTI-IA ACTIVADO');
  console.log('📝 Pregunta:', question.substring(0, 100) + '...');
  if (imageData) {
    console.log('👁️ Imagen detectada - Activando Vision Analysis');
  }
  
  // Paso 1: Analizar tipo de pregunta (compatibilidad)
  const questionType = analyzeQuestionType(question);
  console.log('📊 Tipo de pregunta:', questionType);
  
  // Paso 1.5: Análisis NLP avanzado + Entity Recognition
  const nlpAnalysis = analyzeQueryAdvanced(question);
  
  // Paso 2: Decidir qué IAs usar (con análisis NLP)
  // 🎯 SIMPLIFICADO: Solo usar Claude con NLP para respuestas consistentes
  const aiDecision = {
    claude: true,   // ✅ Claude Haiku con NLP - respuestas consistentes
    groq: false,    // ❌ Deshabilitado - causaba respuestas mezcladas/inconsistentes
    gemini: false,  // ❌ No funciona esta API key
    gpt4: false     // ❌ No configurado
  };
  
  console.log('🎯 Usando SOLO CLAUDE con análisis NLP avanzado');
  if (imageData) {
    console.log('👁️ Modo Vision activado');
  }
  
  console.log('🎯 Usando SOLO CLAUDE con análisis NLP avanzado');
  if (imageData) {
    console.log('👁️ Modo Vision activado');
  }
  
  // Paso 3: Consultar solo Claude (respuesta única y consistente)
  const promises = [];
  const aiResponses = {};
  
  // Claude con NLP - análisis único, respuesta coherente
  if (aiDecision.claude) {
    promises.push(
      askClaude(question, internalContext, imageData).then(result => {
        aiResponses.claude = result;
        console.log('✅ Claude respondió (' + result.tokens + ' tokens)');
      })
    );
  }
  
  // Esperar respuesta de Claude
  await Promise.all(promises);
  
  // Claude es la única fuente - no necesitamos síntesis compleja
  if (aiResponses.claude && aiResponses.claude.success) {
    // Limpiar cualquier cita que la IA pueda haber agregado
    let cleanedResponse = aiResponses.claude.response
      .replace(/\(Fuente:[^)]*\)/gi, '')  // (Fuente: ...)
      .replace(/\(Source:[^)]*\)/gi, '')  // (Source: ...)
      .replace(/\(según\s+el\s+PDF[^)]*\)/gi, '') // (según el PDF...)
      .replace(/,?\s*página\s+\w+/gi, '')  // página X
      .replace(/,?\s*page\s+\w+/gi, '')   // page X
      .replace(/\s+\./g, '.')    // Espacios antes de puntos
      .replace(/\s{2,}/g, ' ')   // Espacios dobles
      .trim();
    
    return {
      questionType,
      aiResponses,
      synthesis: {
        finalResponse: cleanedResponse,
        method: 'single-claude-nlp',
        primaryAI: 'Claude Haiku 3.5',
        nlpAnalysis: aiResponses.claude.nlpAnalysis
      },
      metadata: {
        aisUsed: ['claude'],
        timestamp: new Date().toISOString()
      }
    };
  }
  
  // Si Claude falló
  if (openai) {
    console.warn('⚠️ Claude falló, intentando fallback con GPT-4...');
    const gptFallback = await askGPT4(question, internalContext);

    if (gptFallback.success) {
      return {
        questionType,
        aiResponses: {
          claude: aiResponses.claude,
          gpt4: gptFallback
        },
        synthesis: {
          finalResponse: gptFallback.response,
          method: 'fallback-gpt4',
          primaryAI: 'GPT-4o'
        },
        metadata: {
          aisUsed: ['gpt4'],
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  // Si Claude falló (y fallback no disponible)
  return {
    questionType,
    aiResponses,
    synthesis: {
      finalResponse: '❌ Error al procesar tu pregunta. Por favor, intenta de nuevo.',
      method: 'error',
      error: aiResponses.claude?.error || 'Claude no respondió'
    },
    metadata: {
      aisUsed: [],
      timestamp: new Date().toISOString()
    }
  };
}

// ============================================
// SINTETIZAR RESPUESTAS DE MÚLTIPLES IAs
// ============================================
async function synthesizeResponses(question, aiResponses, internalContext) {
  console.log('🧠 Sintetizando respuestas de múltiples IAs...');
  
  // Si solo Claude respondió, devolver su respuesta
  const successfulResponses = Object.entries(aiResponses).filter(([ai, res]) => res.success);
  
  if (successfulResponses.length === 1) {
    console.log('✅ Solo una IA respondió - devolviendo respuesta directa');
    
    // Limpiar cualquier cita que la IA pueda haber agregado
    let cleanedResponse = successfulResponses[0][1].response
      .replace(/\(Fuente:[^)]*\)/gi, '')  // (Fuente: ...)
      .replace(/\(Source:[^)]*\)/gi, '')  // (Source: ...)
      .replace(/\(según\s+el\s+PDF[^)]*\)/gi, '') // (según el PDF...)
      .replace(/,?\s*página\s+\w+/gi, '')  // página X
      .replace(/,?\s*page\s+\w+/gi, '')   // page X
      .replace(/\s+\./g, '.')    // Espacios antes de puntos
      .replace(/\s{2,}/g, ' ')   // Espacios dobles
      .trim();
    
    return {
      finalResponse: cleanedResponse,
      method: 'single-ai',
      primaryAI: successfulResponses[0][0]
    };
  }
  
  // Si múltiples IAs respondieron, Claude Sonnet actúa como coordinador
  if (successfulResponses.length > 1) {
    console.log('🔀 Múltiples IAs respondieron - Claude coordinando síntesis...');
    
    // Crear contexto de síntesis
    let synthesisPrompt = `Actúas como coordinador de múltiples IAs. Varios sistemas expertos respondieron la siguiente pregunta:

**PREGUNTA DEL USUARIO:**
${question}

**CONTEXTO INTERNO (Confluence, C2M, OaaS):**
${internalContext.substring(0, 2000)}

---

**RESPUESTAS DE SISTEMAS EXPERTOS:**
`;
    
    // Agregar cada respuesta
    successfulResponses.forEach(([aiName, response]) => {
      synthesisPrompt += `\n### ${aiName.toUpperCase()}:\n${response.response}\n\n`;
    });
    
    synthesisPrompt += `
---

**TU TAREA COMO COORDINADOR:**
1. Analiza todas las respuestas anteriores
2. Identifica información complementaria o contradictoria
3. Combina lo mejor de cada respuesta en UNA respuesta coherente y completa
4. Prioriza información del contexto interno (Confluence, C2M, OaaS, SharePoint) sobre conocimiento general
5. Si hay contradicciones, menciónalas y explica cuál es más confiable
6. Estructura la respuesta de forma clara con HTML

**🎯 REQUISITOS DE DETALLE Y PRECISIÓN:**
- ✅ **SÉ ESPECÍFICO:** Incluye nombres exactos, códigos, valores, rutas de navegación completas
- ✅ **DA EJEMPLOS CONCRETOS:** Con datos reales, no genéricos (ej: "Service Point SP-001234" no "un service point")
- ✅ **PASOS DETALLADOS:** Numera cada paso con instrucciones precisas
- ✅ **CASOS DE USO:** Explica cuándo usar cada opción, no solo que existen
- ✅ **CONTEXTO TÉCNICO:** Explica el "por qué" de cada configuración/decisión
- ✅ **ADVERTENCIAS:** Menciona errores comunes, limitaciones, prerequisitos
- ✅ **ALTERNATIVAS:** Si hay múltiples formas, lista TODAS con pros/contras de cada una
- ❌ **EVITA GENERALIDADES:** No digas "depende" sin explicar de qué factores específicos
- ❌ **NO OMITAS DETALLES:** Aunque parezcan obvios, inclúyelos para completitud

**📚 REFERENCIAS:**
- Las fuentes de información están disponibles en el sistema
- NO agregues citas tipo "(Fuente: ...)" en la respuesta
- Responde de forma directa y profesional
- Si el usuario pregunta específicamente por las fuentes, entonces sí las puedes mencionar

**📊 DIAGRAMAS Y FLUJOS (MUY IMPORTANTE):**
- Si el usuario pidió "flujo", "diagrama", "flowchart", "dibuja", DEBES generar un diagrama Mermaid
- Usa bloques de código Mermaid: \`\`\`mermaid ... \`\`\`
- Para flujos de procesos usa: flowchart TD (Top-Down) o flowchart LR (Left-Right)
- Ejemplo de flujo:
\`\`\`mermaid
flowchart TD
    A[Inicio] --> B{¿Condición?}
    B -->|Sí| C[Acción 1]
    B -->|No| D[Acción 2]
    C --> E[Fin]
    D --> E
\`\`\`
- Asegúrate de que el diagrama sea claro, con nodos descriptivos y flechas etiquetadas

**IMPORTANTE:**
- NO digas "según Claude dijo" o "GPT-4 mencionó" - habla como un solo agente
- Integra las respuestas de forma natural
- Si una IA dio mejor información técnica, úsala
- Si otra dio mejor contexto interno, úsala
- Crea UNA respuesta cohesiva y profesional

Responde en español, con HTML estructurado (h3, ol, ul, strong, code, etc.)
`;
    
    // Claude Sonnet sintetiza
    const synthesis = await askClaude(synthesisPrompt);
    
    if (synthesis.success) {
      console.log('✅ Síntesis completada (' + synthesis.tokens + ' tokens)');
      
      // Limpiar cualquier cita que la IA pueda haber agregado
      let cleanedResponse = synthesis.response
        .replace(/\(Fuente:[^)]*\)/gi, '')  // (Fuente: ...)
        .replace(/\(Source:[^)]*\)/gi, '')  // (Source: ...)
        .replace(/\(según\s+el\s+PDF[^)]*\)/gi, '') // (según el PDF...)
        .replace(/,?\s*página\s+\w+/gi, '')  // página X
        .replace(/,?\s*page\s+\w+/gi, '')   // page X
        .replace(/\s+\./g, '.')    // Espacios antes de puntos
        .replace(/\s{2,}/g, ' ')   // Espacios dobles
        .trim();
      
      return {
        finalResponse: cleanedResponse,
        method: 'multi-ai-synthesis',
        synthesizer: 'Claude 3.5 Sonnet (Coordinator)',
        sourcesUsed: successfulResponses.map(([ai]) => ai)
      };
    } else {
      // Si falla síntesis, devolver respuesta de Claude
      console.log('⚠️ Síntesis falló - devolviendo respuesta de Claude');
      return {
        finalResponse: aiResponses.claude?.response || 'Error en síntesis',
        method: 'fallback-claude',
        error: synthesis.error
      };
    }
  }
  
  // Si ninguna IA respondió
  return {
    finalResponse: '❌ No se pudo obtener respuesta de ninguna IA. Por favor, intenta de nuevo.',
    method: 'error',
    error: 'All AIs failed'
  };
}

// ============================================
// FUNCIÓN PRINCIPAL: PREGUNTA CON MULTI-IA
// ============================================
async function askMultiAI(question, searchResults = null, imageData = null) {
  try {
    // Construir contexto interno (Confluence, C2M, OaaS)
    let internalContext = '';
    const sourcesAvailable = []; // Rastrear qué fuentes hay disponibles
    
    // 💡 NUEVO: Detectar si no hay resultados relevantes
    const noResultsFound = !searchResults || 
      (!searchResults.confluenceResults?.length && 
       !searchResults.c2mResults?.length && 
       !searchResults.excelResults?.length &&
       !searchResults.sharepointResults?.length);
    
    if (noResultsFound) {
      // Modo: Responder desde conocimiento general de C2M
      internalContext += '\n**MODO: CONOCIMIENTO GENERAL DE ORACLE C2M**\n';
      internalContext += '⚠️ No se encontraron resultados específicos en nuestras bases internas.\n';
      internalContext += '✅ Por favor, responde desde tu conocimiento general de Oracle Utilities C2M.\n';
      internalContext += '📚 Usa tu entrenamiento sobre:\n';
      internalContext += '   - Sistemas Oracle Utilities (C2M, CCB, MDM)\n';
      internalContext += '   - Estructuras de datos (NIU, POD, SPID, Service Points, Premises)\n';
      internalContext += '   - Procesos de billing y metering\n';
      internalContext += '   - Best practices de configuración\n';
      internalContext += '   - Conceptos técnicos y terminología\n\n';
      internalContext += '🎯 IMPORTANTE: Proporciona una respuesta útil y completa.\n';
      internalContext += '❌ NO digas "no tengo información" o "no encontré resultados".\n';
      internalContext += '✅ Explica el concepto, término o proceso preguntado basándote en tu conocimiento.\n';
      internalContext += '📝 AL FINAL: Indica que la información proviene de tu conocimiento general de Oracle C2M.\n\n';
      sourcesAvailable.push('Conocimiento General de IA');
    }
    
    // Si hay imagen, agregar contexto específico
    if (imageData) {
      internalContext += '\n**ANÁLISIS DE IMAGEN:**\n';
      internalContext += 'El usuario ha adjuntado una imagen. Analízala cuidadosamente y responde su pregunta.\n';
      internalContext += 'Si es un error, captura de pantalla, diagrama o documento técnico, proporciona un análisis detallado.\n\n';
    }
    
    if (searchResults) {
      internalContext += '\n**DOCUMENTACIÓN INTERNA:**\n';
      
      // Confluence
      if (searchResults.confluenceResults?.length > 0) {
        internalContext += '\n**Confluence FAQs:**\n';
        searchResults.confluenceResults.slice(0, 3).forEach((faq, i) => {
          internalContext += `[FUENTE: Confluence FAQ - "${faq.pregunta}" (${faq.aplicacion})]\n`;
          internalContext += `${faq.respuesta.substring(0, 500)}...\n\n`;
        });
        sourcesAvailable.push('Confluence FAQs');
      }
      
      // SharePoint
      if (searchResults.sharepointResults?.length > 0) {
        internalContext += '\n**SharePoint (Documentos Internos):**\n';
        searchResults.sharepointResults.slice(0, 3).forEach((doc, i) => {
          internalContext += `[FUENTE: SharePoint - "${doc.title}" (${doc.contentType})]\n`;
          internalContext += `${doc.summary || 'Documento disponible'}...\n`;
          internalContext += `URL: ${doc.webUrl}\n\n`;
        });
        sourcesAvailable.push('SharePoint');
      }
      
      // C2M Guide
      if (searchResults.c2mGuideResults?.length > 0) {
        internalContext += '\n**C2M Business User Guide:**\n';
        searchResults.c2mGuideResults.slice(0, 2).forEach((section, i) => {
          internalContext += `[FUENTE: C2M User Guide - "${section.title}" (Página ${section.page})]\n`;
          internalContext += `${section.content.substring(0, 500)}...\n\n`;
        });
        sourcesAvailable.push('C2M Business User Guide');
      }
      
      // OaaS Excel
      if (searchResults.excelResults?.length > 0) {
        internalContext += '\n**Histórico OaaS (Casos reales):**\n';
        searchResults.excelResults.slice(0, 2).forEach((ticket, i) => {
          internalContext += `[FUENTE: Caso OaaS - Ticket ${ticket['TICKET ID']}]\n`;
          internalContext += `Resumen: ${ticket['RESUMEN']}\n\n`;
        });
        sourcesAvailable.push('Casos Históricos OaaS');
      }
    }
    
    // ==========================================
    // INSTRUCCIONES DE CITACIÓN DESHABILITADAS
    // ==========================================
    // El usuario NO quiere ver citas en las respuestas
    // Las fuentes están disponibles en metadata para mostrar solo si el usuario las solicita
    
    // Orquestar consulta multi-IA (con Vision si hay imagen)
    const result = await orchestrateMultiAI(question, internalContext, imageData);
    
    // Agregar metadata de fuentes
    result.synthesis.sourcesUsed = sourcesAvailable;
    
    return result;
    
  } catch (error) {
    console.error('❌ Error en sistema Multi-IA:', error);
    return {
      questionType: 'error',
      synthesis: {
        finalResponse: `❌ Error en sistema Multi-IA: ${error.message}`,
        method: 'error'
      },
      metadata: {
        error: error.message,
        timestamp: new Date().toISOString()
      }
    };
  }
}

// ============================================
// FILTRO INTELIGENTE: ¿Debe buscar en Confluence?
// ============================================
/**
 * Determina si debe buscar en Confluence/SharePoint basándose en análisis NLP
 * @param {string} query - Pregunta del usuario
 * @returns {Object} - { shouldSearch: boolean, reason: string, nlpAnalysis: Object }
 */
function shouldSearchInKnowledgeBase(query) {
  // Análisis NLP de la pregunta
  const nlpAnalysis = nlpService.analyzeQuery(query);
  
  const { intent, questionType, entities, confidence } = nlpAnalysis;
  
  // ❌ NO buscar en Confluence/SharePoint para:
  const noSearchIntents = [
    'definition',      // "¿Qué es CUPS?" - Pregunta de definición general
    'general',         // Preguntas generales sin contexto técnico
    'comparison',      // "¿Cuál es la diferencia entre X y Y?"
  ];
  
  // Si es una definición simple o pregunta general
  if (noSearchIntents.includes(intent)) {
    // Excepción: Si menciona sistemas Oracle O tiene baja confianza, buscar
    const mentionsTechnicalSystem = entities.systems.length > 0 || 
                                    entities.tables.length > 0 ||
                                    entities.businessObjects.length > 0;
    
    if (mentionsTechnicalSystem || confidence < 0.6) {
      return {
        shouldSearch: true,
        reason: `Pregunta de ${intent} pero menciona sistemas técnicos o baja confianza (${(confidence*100).toFixed(0)}%)`,
        nlpAnalysis: nlpAnalysis
      };
    }
    
    return {
      shouldSearch: false,
      reason: `Pregunta de ${intent} - Responder directo sin buscar casos de soporte`,
      nlpAnalysis: nlpAnalysis
    };
  }
  
  // ✅ SÍ buscar en Confluence/SharePoint para:
  const searchIntents = [
    'troubleshooting',   // Errores, problemas
    'technical_name',    // Nombres técnicos de VEE/BO
    'how_it_works',      // Funcionamiento técnico
    'code_request',      // Código, scripts
    'procedure',         // Procedimientos paso a paso
    'configuration',     // Configuraciones
    'vee_query'          // Reglas VEE específicas
  ];
  
  if (searchIntents.includes(intent)) {
    return {
      shouldSearch: true,
      reason: `Pregunta de ${intent} - Requiere búsqueda en base de conocimiento`,
      nlpAnalysis: nlpAnalysis
    };
  }
  
  // Por defecto, buscar (comportamiento conservador)
  return {
    shouldSearch: true,
    reason: `Intent '${intent}' no categorizado - Buscar por seguridad`,
    nlpAnalysis: nlpAnalysis
  };
}

// ============================================
// EXPORTAR
// ============================================
module.exports = {
  askMultiAI,
  analyzeQuestionType,
  analyzeQueryAdvanced,  // ✨ NUEVO: Análisis NLP avanzado
  shouldSearchInKnowledgeBase,  // ✨ NUEVO: Filtro inteligente
  askClaude,
  askGPT4,
  askGemini,
  // Exponer servicios NLP para uso externo
  nlpService
};
