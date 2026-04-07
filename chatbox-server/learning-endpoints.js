// ============================================
// MÓDULO DE AUTOAPRENDIZAJE
// Sistema que guarda y reutiliza conversaciones previas
// ============================================

const fs = require('fs');
const path = require('path');

const LEARNING_FILE = path.join(__dirname, 'learning-data.json');

// Guardar interacción aprendida
function saveLearningData(userQuestion, botResponse, context = {}) {
  let learningData = [];
  
  if(fs.existsSync(LEARNING_FILE)) {
    try {
      learningData = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
    } catch(e) {
      learningData = [];
    }
  }
  
  learningData.push({
    id: Date.now(),
    question: userQuestion,
    response: botResponse,
    context: context,
    timestamp: new Date().toISOString(),
    useCount: 0
  });
  
  // Mantener solo últimas 1000 interacciones
  if(learningData.length > 1000) {
    learningData = learningData.slice(-1000);
  }
  
  fs.writeFileSync(LEARNING_FILE, JSON.stringify(learningData, null, 2));
  console.log(`📚 Aprendizaje guardado: "${userQuestion.substring(0, 50)}..."`);
}

// Buscar interacciones similares
function searchLearningData(query, limit = 5) {
  if(!fs.existsSync(LEARNING_FILE)) {
    return [];
  }
  
  let learningData = [];
  try {
    learningData = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
  } catch(e) {
    return [];
  }
  
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
  
  // Calcular relevancia
  const scored = learningData.map(item => {
    const questionLower = item.question.toLowerCase();
    let score = 0;
    
    // Coincidencia exacta de frase
    if(questionLower.includes(queryLower)) {
      score += 100;
    }
    
    // Coincidencia de palabras clave
    queryWords.forEach(word => {
      if(questionLower.includes(word)) {
        score += 10;
      }
    });
    
    // Bonificación por uso previo exitoso
    score += (item.useCount || 0) * 2;
    
    return { ...item, score };
  });
  
  // Filtrar y ordenar
  const results = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  
  console.log(`🔍 Búsqueda: "${query.substring(0, 50)}..." → ${results.length} resultados`);
  
  return results;
}

// Incrementar contador de uso
function incrementUseCount(id) {
  if(!fs.existsSync(LEARNING_FILE)) {
    return false;
  }
  
  let learningData = [];
  try {
    learningData = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
  } catch(e) {
    return false;
  }
  
  const item = learningData.find(i => i.id === id);
  if(item) {
    item.useCount = (item.useCount || 0) + 1;
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(learningData, null, 2));
    console.log(`✅ Incrementado useCount para ID ${id}: ${item.useCount}`);
    return true;
  }
  
  return false;
}

module.exports = {
  saveLearningData,
  searchLearningData,
  incrementUseCount
};
