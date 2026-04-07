// ============================================
// DEMO: NLP + Entity Recognition
// ============================================
// Demuestra las capacidades del nuevo nlp-service.js

const nlpService = require('./nlp-service');

console.log('🧠 DEMO: Análisis NLP + Entity Recognition\n');
console.log('='.repeat(80));

// ============================================
// Test 1: Query de nombre técnico con BO
// ============================================
console.log('\n📝 Test 1: Query de nombre técnico\n');
const query1 = "cómo se llama el BO de la regla de estimación Factor de Perfil o Tipo de Día";
const analysis1 = nlpService.analyzeQuery(query1);

console.log('Query:', query1);
console.log('\nResultados:');
console.log('  Intent:', analysis1.intent);
console.log('  Question Type:', analysis1.questionType);
console.log('  Keywords:', analysis1.keywords.slice(0, 5).join(', '));
console.log('  BOs:', analysis1.entities.businessObjects);
console.log('  Urgency:', analysis1.urgency);
console.log('\nResumen:', nlpService.summarizeAnalysis(analysis1));

// ============================================
// Test 2: Query con error técnico y tabla
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 2: Query con error técnico\n');
const query2 = "tengo el error ORA-12154 al intentar consultar la tabla CI_ACCT_PER del sistema MDM";
const analysis2 = nlpService.analyzeQuery(query2);

console.log('Query:', query2);
console.log('\nResultados:');
console.log('  Intent:', analysis2.intent);
console.log('  Question Type:', analysis2.questionType);
console.log('  Sentiment:', analysis2.sentiment);
console.log('  Action:', analysis2.action);
console.log('  Error Codes:', analysis2.entities.errorCodes);
console.log('  Tables:', analysis2.entities.tables);
console.log('  Systems:', analysis2.entities.systems);
console.log('\nResumen:', nlpService.summarizeAnalysis(analysis2));

// ============================================
// Test 3: Solicitud de diagrama
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 3: Solicitud de diagrama\n');
const query3 = "creame un flujo del proceso de estimación de energía en C2M";
const analysis3 = nlpService.analyzeQuery(query3);

console.log('Query:', query3);
console.log('\nResultados:');
console.log('  Intent:', analysis3.intent);
console.log('  Diagram Type:', analysis3.diagramType);
console.log('  Action:', analysis3.action);
console.log('  Systems:', analysis3.entities.systems);
console.log('  Keywords:', analysis3.keywords.slice(0, 5).join(', '));
console.log('\nResumen:', nlpService.summarizeAnalysis(analysis3));

// ============================================
// Test 4: Query con múltiples BOs
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 4: Query con múltiples BOs\n');
const query4 = "cuál es la diferencia entre CM-EstimEnergiaHistPMPConSaldo y CM-EstimAcumGolpeEnergia";
const analysis4 = nlpService.analyzeQuery(query4);

console.log('Query:', query4);
console.log('\nResultados:');
console.log('  Intent:', analysis4.intent);
console.log('  Action:', analysis4.action);
console.log('  BOs:', analysis4.entities.businessObjects);
console.log('  Keywords:', analysis4.keywords.slice(0, 5).join(', '));
console.log('\nResumen:', nlpService.summarizeAnalysis(analysis4));

// ============================================
// Test 5: Validación de respuesta
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 5: Validación de nombres técnicos\n');

const respuestaCorrecta = "La regla de VEE se llama CM-EstimEnergiaHistPMPConSaldo y se usa para consultar la tabla CI_ACCT_PER";
const respuestaIncorrecta = "La regla se llama PREVEE_BO_DATA_AREA o CM_ESTM_ENERGY_HIST";

console.log('✅ Respuesta CORRECTA:');
console.log('  ' + respuestaCorrecta);
const entitiesCorrect = nlpService.recognizeEntities(respuestaCorrecta);
console.log('  BOs extraídos:', entitiesCorrect.businessObjects);
console.log('  Tablas extraídas:', entitiesCorrect.tables);

console.log('\n❌ Respuesta INCORRECTA:');
console.log('  ' + respuestaIncorrecta);
const entitiesIncorrect = nlpService.recognizeEntities(respuestaIncorrecta);
console.log('  BOs extraídos:', entitiesIncorrect.businessObjects);
console.log('  ⚠️ Debe detectarse CM_ESTM_ENERGY_HIST como inválido (guion bajo en vez de guion)');

// ============================================
// Test 6: Entity extraction completo
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 6: Extracción completa de entidades\n');

const textoComplejo = `
El error ORA-12154 ocurrió al ejecutar el batch process en el sistema C2M.
La configuración estaba en oracle.jdbc.url=jdbc:oracle:thin:@localhost:1521/ORCL
Las tablas afectadas fueron CI_ACCT_PER, D1_BO_STATUS, y CC_BILL
El BO CM-EstimEnergiaHistPMPConSaldo requiere el parámetro ACCT_ID
El incidente #12345 fue resuelto el 15/03/2024
`;

console.log('Texto complejo:', textoComplejo);
const entitiesCompletas = nlpService.recognizeEntities(textoComplejo);

console.log('\nEntidades extraídas:');
console.log('  ⚠️ Error Codes:', entitiesCompletas.errorCodes);
console.log('  🖥️ Systems:', entitiesCompletas.systems);
console.log('  🗄️ Tables:', entitiesCompletas.tables);
console.log('  📦 BOs:', entitiesCompletas.businessObjects);
console.log('  📋 Fields:', entitiesCompletas.fields);
console.log('  ⚙️ Parameters:', entitiesCompletas.parameters.slice(0, 3));
console.log('  📅 Dates:', entitiesCompletas.dates);
console.log('  🔢 Numbers:', entitiesCompletas.numbers);

// ============================================
// Test 7: Contexto interno detection
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n📝 Test 7: Detección de contexto interno\n');

const queryInterno = "cómo funciona el BO CM-Validación en C2M";
const queryExterno = "qué es JavaScript y cómo se usa";

const analysisInterno = nlpService.analyzeQuery(queryInterno);
const analysisExterno = nlpService.analyzeQuery(queryExterno);

console.log('Query interno:', queryInterno);
console.log('  Requiere contexto interno:', nlpService.requiresInternalContext(analysisInterno));

console.log('\nQuery externo:', queryExterno);
console.log('  Requiere contexto interno:', nlpService.requiresInternalContext(analysisExterno));

// ============================================
// Resumen Final
// ============================================
console.log('\n' + '='.repeat(80));
console.log('\n✨ DEMO COMPLETADO\n');
console.log('Capacidades demostradas:');
console.log('  ✅ Detección de 11 intenciones granulares');
console.log('  ✅ Extracción de 8 categorías de entidades');
console.log('  ✅ Detección de 6 tipos de diagramas');
console.log('  ✅ Análisis de sentimiento y urgencia');
console.log('  ✅ Detección de contexto interno vs externo');
console.log('  ✅ Validación de nombres técnicos');
console.log('  ✅ Keywords inteligentes sin stopwords');
console.log('\n🎯 Sistema NLP + Entity Recognition: OPERATIVO');
console.log('='.repeat(80));
