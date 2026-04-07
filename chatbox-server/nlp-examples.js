// ============================================
// NLP SERVICE - EJEMPLOS DE USO PRÁCTICO
// ============================================
// Ejemplos funcionales para probar el servicio NLP mejorado

const nlpService = require('./nlp-service');

// ============================================
// EJEMPLO 1: Análisis Básico Completo
// ============================================
function ejemplo1_AnalisisBasico() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 1: Análisis Básico Completo');
  console.log('='.repeat(60));
  
  const consultas = [
    '¿Cómo soluciono el error ORA-12154 en C2M?',
    'Quiero un diagrama del flujo de validación VEE',
    '¿Cuántos tickets abiertos hay en el sistema?',
    'Ayuda urgente! El sistema MDM no funciona',
    '¿Qué es un Business Object CM-FacturaElectrica?'
  ];
  
  consultas.forEach(consulta => {
    console.log(`\n📝 Consulta: "${consulta}"`);
    const analysis = nlpService.analyzeQuery(consulta);
    
    console.log('   Intent:', analysis.intent);
    console.log('   Tipo:', analysis.questionType);
    console.log('   Confianza:', (analysis.confidence * 100).toFixed(1) + '%');
    console.log('   Keywords:', analysis.keywords.slice(0, 5).join(', '));
    console.log('   Urgencia:', analysis.urgency);
    console.log('   Sentimiento:', analysis.sentiment);
    
    // Mostrar entidades si hay
    const entities = analysis.entities;
    if (entities.errorCodes.length > 0) {
      console.log('   ⚠️  Errores:', entities.errorCodes.join(', '));
    }
    if (entities.systems.length > 0) {
      console.log('   🖥️  Sistemas:', entities.systems.join(', '));
    }
    if (entities.businessObjects.length > 0) {
      console.log('   📦 Business Objects:', entities.businessObjects.join(', '));
    }
    
    console.log('   ⏱️  Procesamiento:', analysis.metadata.processingTime + 'ms');
  });
}

// ============================================
// EJEMPLO 2: Preprocesamiento de Texto
// ============================================
function ejemplo2_Preprocesamiento() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 2: Preprocesamiento de Texto');
  console.log('='.repeat(60));
  
  const texto = '¿Cómo puedo configurar la validación de la tabla CI_ACCT_PER en el módulo MDM?';
  
  console.log(`\n📝 Texto original:\n   "${texto}"`);
  
  // Preprocesamiento sin stemming
  const prep1 = nlpService.preprocessText(texto, {
    removeAccents: false,
    removeStops: true,
    applyStemming: false
  });
  
  console.log('\n✅ Preprocesamiento (sin stemming):');
  console.log('   Normalizado:', prep1.normalized);
  console.log('   Tokens totales:', prep1.tokenCount);
  console.log('   Tokens significativos:', prep1.meaningfulTokenCount);
  console.log('   Tokens filtrados:', prep1.filteredTokens.join(', '));
  console.log('   Texto procesado:', prep1.processedText);
  
  // Preprocesamiento con stemming
  const prep2 = nlpService.preprocessText(texto, {
    removeAccents: false,
    removeStops: true,
    applyStemming: true
  });
  
  console.log('\n✅ Preprocesamiento (con stemming):');
  console.log('   Tokens con stemming:', prep2.processedTokens.join(', '));
  console.log('   Texto procesado:', prep2.processedText);
  console.log('   Tiempo:', prep2.processingTime + 'ms');
}

// ============================================
// EJEMPLO 3: Reconocimiento de Entidades
// ============================================
function ejemplo3_ReconocimientoEntidades() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 3: Reconocimiento de Entidades');
  console.log('='.repeat(60));
  
  const casos = [
    {
      nombre: 'Errores de Base de Datos',
      texto: 'Tengo los errores ORA-12154 y ORA-01017 en la conexión. También veo SQLCODE -1403.'
    },
    {
      nombre: 'Sistemas y Módulos',
      texto: 'El problema afecta a C2M, MDM, y el módulo VEE. También impacta Oracle Database y WebLogic.'
    },
    {
      nombre: 'Tablas y Business Objects',
      texto: 'La tabla CI_ACCT_PER y el BO CM-FacturaElectrica necesitan actualización en D1_MEASURE_QUALITY.'
    },
    {
      nombre: 'Error Técnico Completo',
      texto: 'Error ORA-00001 en tabla CI_SA insertando SP_ID 123456 desde el sistema C2M en el ambiente de pruebas.'
    }
  ];
  
  casos.forEach(caso => {
    console.log(`\n📋 Caso: ${caso.nombre}`);
    console.log(`   Texto: "${caso.texto}"`);
    
    const entities = nlpService.recognizeEntities(caso.texto);
    
    console.log('   🔍 Entidades detectadas:');
    if (entities.errorCodes.length > 0) {
      console.log('      ⚠️  Códigos de Error:', entities.errorCodes.join(', '));
    }
    if (entities.systems.length > 0) {
      console.log('      🖥️  Sistemas:', entities.systems.join(', '));
    }
    if (entities.tables.length > 0) {
      console.log('      🗄️  Tablas:', entities.tables.join(', '));
    }
    if (entities.businessObjects.length > 0) {
      console.log('      📦 Business Objects:', entities.businessObjects.join(', '));
    }
    if (entities.fields.length > 0) {
      console.log('      📊 Campos:', entities.fields.slice(0, 3).join(', '));
    }
    if (entities.numbers.length > 0) {
      console.log('      🔢 Numbers/IDs:', entities.numbers.join(', '));
    }
  });
}

// ============================================
// EJEMPLO 4: Sistema de Confianza
// ============================================
function ejemplo4_SistemaConfianza() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 4: Sistema de Confianza');
  console.log('='.repeat(60));
  
  const consultas = [
    { texto: 'ayuda', categoria: 'Muy vaga' },
    { texto: '¿qué es esto?', categoria: 'Vaga' },
    { texto: '¿Cómo funciona el sistema C2M?', categoria: 'General' },
    { texto: '¿Cómo configurar la tabla CI_ACCT_PER en C2M versión 2.8?', categoria: 'Específica' },
    { texto: 'Error ORA-12154 al conectar desde C2M a la BD, revisar tnsnames.ora y listener', categoria: 'Muy específica' }
  ];
  
  console.log('\n📊 Análisis de Confianza por Especificidad:\n');
  console.log('   Consulta'.padEnd(60) + ' | Confianza | Categoría');
  console.log('   ' + '-'.repeat(90));
  
  consultas.forEach(({ texto, categoria }) => {
    const analysis = nlpService.analyzeQuery(texto);
    const confidencePercent = (analysis.confidence * 100).toFixed(1);
    const confidenceBar = '█'.repeat(Math.round(analysis.confidence * 10));
    
    console.log(`   ${texto.slice(0, 55).padEnd(55)} | ${confidenceBar.padEnd(10)} ${confidencePercent}% | ${categoria}`);
  });
  
  console.log('\n💡 Interpretación:');
  console.log('   > 80%  : Alta confianza - Respuesta automática posible');
  console.log('   60-80% : Confianza media - Puede requerir validación');
  console.log('   < 60%  : Baja confianza - Requiere clarificación del usuario');
}

// ============================================
// EJEMPLO 5: Análisis Semántico (async)
// ============================================
async function ejemplo5_AnalisisSemantico() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 5: Análisis Semántico con Embeddings');
  console.log('='.repeat(60));
  
  // Base de conocimiento simulada
  const knowledgeBase = [
    {
      question: '¿Cómo soluciono errores de conexión a Oracle?',
      answer: 'Verifica el archivo tnsnames.ora en $ORACLE_HOME/network/admin...',
      category: 'database'
    },
    {
      question: '¿Qué es VEE en Oracle Utilities?',
      answer: 'VEE son las Reglas de Validación, Estimación y Edición para mediciones...',
      category: 'c2m'
    },
    {
      question: '¿Cómo crear un Business Object en C2M?',
      answer: 'Ve a Admin > Meta Data > Business Object > Agregar...',
      category: 'c2m'
    },
    {
      question: '¿Cómo generar diagramas de flujo en el sistema?',
      answer: 'Usa la funcionalidad de análisis visual o solicita al chatbot...',
      category: 'general'
    }
  ];
  
  const consultasUsuario = [
    '¿Cómo arreglar problemas de conexión con la BD Oracle?',
    '¿Cuál es el procedimiento para generar un BO en C2M?',
    'Necesito un flowchart del proceso de facturación'
  ];
  
  console.log('\n🔍 Búsqueda de preguntas similares en KB:\n');
  
  for (const consulta of consultasUsuario) {
    console.log(`📝 Usuario pregunta: "${consulta}"`);
    
    try {
      const semantic = await nlpService.analyzeSemantics(consulta, {
        knownQuestions: knowledgeBase,
        similarityThreshold: 0.6,
        maxSimilar: 2
      });
      
      if (semantic.hasEmbedding) {
        console.log('   ✅ Embedding generado (dimensiones:', semantic.embedding ? semantic.embedding.length : 'N/A', ')');
      } else {
        console.log('   ⚠️  Embeddings no disponibles - Usando similitud básica');
      }
      
      if (semantic.similarQuestions.length > 0) {
        console.log('   🎯 Preguntas similares encontradas:');
        semantic.similarQuestions.forEach((match, i) => {
          console.log(`      ${i + 1}. "${match.question}"`);
          console.log(`         Similitud: ${(match.similarity * 100).toFixed(1)}% (${match.matchType})`);
          console.log(`         Categoría: ${match.category}`);
        });
        
        if (semantic.bestMatch && semantic.bestMatch.similarity > 0.85) {
          console.log('   ✨ RESPUESTA AUTOMÁTICA POSIBLE (alta similitud)');
        }
      } else {
        console.log('   ❌ No se encontraron preguntas similares en la KB');
      }
      
      console.log('   ⏱️  Tiempo:', semantic.processingTime + 'ms\n');
      
    } catch (error) {
      console.log('   ❌ Error:', error.message);
      console.log('   💡 Asegúrate de configurar OPENAI_API_KEY para embeddings\n');
    }
  }
}

// ============================================
// EJEMPLO 6: Similitud entre Textos
// ============================================
async function ejemplo6_SimilitudTextos() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 6: Cálculo de Similitud entre Textos');
  console.log('='.repeat(60));
  
  const parejas = [
    {
      texto1: '¿Cómo crear un usuario en el sistema?',
      texto2: '¿Cuál es el procedimiento para agregar usuarios?',
      esperado: 'Alta'
    },
    {
      texto1: 'Error de conexión a la base de datos',
      texto2: 'No puedo conectarme a Oracle',
      esperado: 'Alta'
    },
    {
      texto1: '¿Qué es un Business Object?',
      texto2: '¿Cómo funciona el sistema de facturación?',
      esperado: 'Baja'
    }
  ];
  
  console.log('\n📊 Similitud Semántica:\n');
  
  for (const { texto1, texto2, esperado } of parejas) {
    try {
      const similarity = await nlpService.calculateSemanticSimilarity(texto1, texto2);
      const simPercent = (similarity * 100).toFixed(1);
      const simBar = '█'.repeat(Math.round(similarity * 10));
      
      console.log(`   Texto 1: "${texto1}"`);
      console.log(`   Texto 2: "${texto2}"`);
      console.log(`   Similitud: ${simBar} ${simPercent}% (Esperado: ${esperado})\n`);
      
    } catch (error) {
      console.log(`   ❌ Error calculando similitud: ${error.message}\n`);
    }
  }
}

// ============================================
// EJEMPLO 7: Cache y Performance
// ============================================
function ejemplo7_CachePerformance() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 7: Cache y Performance');
  console.log('='.repeat(60));
  
  const consulta = '¿Cómo soluciono el error ORA-12154 en la configuración de C2M?';
  
  console.log(`\n📝 Consulta de prueba: "${consulta}"\n`);
  
  // Primera ejecución (sin cache)
  console.log('🔄 Primera ejecución (sin cache):');
  const start1 = Date.now();
  const result1 = nlpService.analyzeQuery(consulta);
  const time1 = Date.now() - start1;
  console.log(`   Tiempo: ${time1}ms`);
  console.log(`   Cached: ${result1.metadata.cached}`);
  
  // Segunda ejecución (con cache)
  console.log('\n⚡ Segunda ejecución (con cache):');
  const start2 = Date.now();
  const result2 = nlpService.analyzeQuery(consulta);
  const time2 = Date.now() - start2;
  console.log(`   Tiempo: ${time2}ms`);
  console.log(`   Cached: ${result2.metadata.cached}`);
  console.log(`   Mejora: ${((time1 - time2) / time1 * 100).toFixed(0)}% más rápido`);
  
  // Estadísticas de cache
  console.log('\n📊 Estadísticas de Cache:');
  const stats = nlpService.getCacheStats();
  console.log(`   Análisis en cache: ${stats.analysis}`);
  console.log(`   Embeddings en cache: ${stats.embeddings}`);
  console.log(`   Similitudes en cache: ${stats.similarity}`);
  
  // Limpiar cache
  console.log('\n🧹 Limpiando caches...');
  nlpService.clearCache();
  const statsAfter = nlpService.getCacheStats();
  console.log(`   Análisis en cache: ${statsAfter.analysis}`);
  console.log(`   Embeddings en cache: ${statsAfter.embeddings}`);
  console.log(`   Similitudes en cache: ${statsAfter.similarity}`);
}

// ============================================
// EJEMPLO 8: Caso de Uso Real - Auto-Respuesta
// ============================================
async function ejemplo8_CasoUsoAutoRespuesta() {
  console.log('\n' + '='.repeat(60));
  console.log('EJEMPLO 8: Caso de Uso - Sistema de Auto-Respuesta');
  console.log('='.repeat(60));
  
  // Simular una base de conocimiento
  const knowledgeBase = [
    {
      question: '¿Cómo reiniciar el servidor WebLogic?',
      answer: 'Para reiniciar WebLogic: 1) Detener servicios, 2) Verificar procesos, 3) Restart...',
      category: 'infrastructure'
    },
    {
      question: '¿Qué hacer con error ORA-12154?',
      answer: 'El error ORA-12154 indica que no se puede resolver el identificador de conexión TNS...',
      category: 'database'
    }
  ];
  
  async function handleUserQuery(query) {
    console.log(`\n👤 Usuario: "${query}"`);
    
    // 1. Analizar consulta
    const analysis = nlpService.analyzeQuery(query);
    console.log(`   🧠 Intent: ${analysis.intent} | Confianza: ${(analysis.confidence * 100).toFixed(1)}%`);
    
    // 2. Decisión de auto-respuesta
    if (analysis.confidence > 0.7) {
      try {
        const semantic = await nlpService.analyzeSemantics(query, {
          knownQuestions: knowledgeBase,
          similarityThreshold: 0.75
        });
        
        if (semantic.bestMatch && semantic.bestMatch.similarity > 0.80) {
          console.log(`   ✅ AUTO-RESPUESTA (Similitud: ${(semantic.bestMatch.similarity * 100).toFixed(1)}%)`);
          console.log(`   🤖 Respuesta: ${semantic.bestMatch.answer.slice(0, 80)}...`);
          return { autoResponse: true, answer: semantic.bestMatch.answer };
        }
      } catch (error) {
        console.log('   ⚠️  Error en análisis semántico, escalando...');
      }
    }
    
    // 3. Escalar a agente humano
    console.log(`   👨‍💼 ESCALAR A AGENTE HUMANO (Confianza: ${(analysis.confidence * 100).toFixed(1)}%)`);
    console.log(`   📋 Contexto: ${analysis.entities.systems.join(', ') || 'general'}`);
    return { autoResponse: false, requiresHuman: true };
  }
  
  // Probar con diferentes consultas
  const consultas = [
    '¿Cómo reinicio WebLogic?',
    'Tengo el error ORA-12154 en C2M',
    '¿Qué es un diagrama de secuencia?'
  ];
  
  for (const consulta of consultas) {
    await handleUserQuery(consulta);
  }
}

// ============================================
// EJECUTAR EJEMPLOS
// ============================================
async function runAllExamples() {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'NLP SERVICE - EJEMPLOS PRÁCTICOS' + ' '.repeat(16) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  
  try {
    // Ejemplos síncronos
    ejemplo1_AnalisisBasico();
    ejemplo2_Preprocesamiento();
    ejemplo3_ReconocimientoEntidades();
    ejemplo4_SistemaConfianza();
    ejemplo7_CachePerformance();
    
    // Ejemplos asíncronos (requieren OpenAI API key)
    console.log('\n\n' + '='.repeat(60));
    console.log('EJEMPLOS ASÍNCRONOS (Requieren OpenAI API Key)');
    console.log('='.repeat(60));
    
    if (process.env.OPENAI_API_KEY) {
      await ejemplo5_AnalisisSemantico();
      await ejemplo6_SimilitudTextos();
      await ejemplo8_CasoUsoAutoRespuesta();
    } else {
      console.log('\n⚠️  NOTA: Los ejemplos de análisis semántico requieren OPENAI_API_KEY');
      console.log('   Configura la variable de entorno para probar embeddings y similitud.');
      console.log('   Ejemplo: OPENAI_API_KEY=sk-... node nlp-examples.js\n');
    }
    
  } catch (error) {
    console.error('\n❌ Error ejecutando ejemplos:', error.message);
    console.error(error.stack);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Ejemplos completados');
  console.log('='.repeat(60) + '\n');
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAllExamples().catch(console.error);
}

// Exportar para uso en otros módulos
module.exports = {
  ejemplo1_AnalisisBasico,
  ejemplo2_Preprocesamiento,
  ejemplo3_ReconocimientoEntidades,
  ejemplo4_SistemaConfianza,
  ejemplo5_AnalisisSemantico,
  ejemplo6_SimilitudTextos,
  ejemplo7_CachePerformance,
  ejemplo8_CasoUsoAutoRespuesta,
  runAllExamples
};
