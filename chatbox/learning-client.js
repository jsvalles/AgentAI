// ============================================
// SISTEMA DE AUTOAPRENDIZAJE - CLIENTE
// ============================================

// Buscar interacciones similares en la base de aprendizaje
async function searchLearningData(userQuestion){
  try {
    const response = await fetch('/api/learning/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: userQuestion, limit: 3 })
    });
    
    const data = await response.json();
    return data.results || [];
  } catch(err) {
    console.error('Error searching learning data:', err);
    return [];
  }
}

// Guardar nueva interacción aprendida
function saveLearningData(userQuestion, botResponse, context = {}){
  fetch('/api/learning/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userQuestion,
      botResponse,
      context
    })
  }).catch(err => console.log('Learning save error:', err));
}

// Incrementar contador de veces que se reutilizó una respuesta
function incrementLearningUse(id){
  fetch('/api/learning/increment-use', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  }).catch(err => console.log('Learning increment error:', err));
}

// Aplicar aprendizaje antes de procesar pregunta
// DESACTIVADO - El autoaprendizaje está deshabilitado
async function applyLearning(userText){
  // Autoaprendizaje desactivado - siempre retornar false para procesamiento normal
  return false;
  
  /* CÓDIGO ORIGINAL COMENTADO:
  const similarInteractions = await searchLearningData(userText);
  
  if(similarInteractions.length > 0) {
    const best = similarInteractions[0];
    
    // Solo usar si tiene alta similitud
    if(best.score > 50) {
      // Analizar el contexto de la respuesta para mostrar información más detallada
      const context = best.context || {};
      const response = best.response || '';
      
      // Crear mensaje más detallado con información del contexto
      let detailedMessage = `💡 <strong>Recuerdo una consulta similar:</strong>\n\n`;
      detailedMessage += `<div style="background:#f0f9ff;padding:12px;border-left:4px solid #0284c7;border-radius:4px;margin:10px 0;">`;
      detailedMessage += `<strong style="color:#0c4a6e;">❓ Pregunta anterior:</strong><br/>`;
      detailedMessage += `<em style="color:#475569;">"${best.question}"</em>`;
      detailedMessage += `</div>\n\n`;
      
      // Parsear la respuesta para extraer información estructurada
      const hasConfluence = /Confluence:\s*(\d+)\s*resultado/i.test(response);
      const hasExcel = /Excel:\s*(\d+)\s*resultado/i.test(response);
      
      if(hasConfluence || hasExcel) {
        const confluenceMatch = response.match(/Confluence:\s*(\d+)\s*resultado/i);
        const excelMatch = response.match(/Excel:\s*(\d+)\s*resultado/i);
        
        detailedMessage += `<div style="background:#fef3c7;padding:12px;border-left:4px solid #f59e0b;border-radius:4px;margin:10px 0;">`;
        detailedMessage += `<strong style="color:#92400e;">📊 Resumen de resultados encontrados:</strong><br/><br/>`;
        
        if(confluenceMatch) {
          const count = confluenceMatch[1];
          detailedMessage += `📚 <strong>Confluence:</strong> ${count} recurso${count !== '1' ? 's' : ''} de conocimiento<br/>`;
        }
        
        if(excelMatch) {
          const count = excelMatch[1];
          detailedMessage += `📊 <strong>Excel:</strong> ${count} caso${count !== '1' ? 's' : ''} histórico${count !== '1' ? 's' : ''}<br/>`;
        }
        
        if(context.sistema) {
          detailedMessage += `<br/>🖥️ <strong>Sistema:</strong> ${context.sistema}`;
        }
        
        detailedMessage += `</div>\n\n`;
        detailedMessage += `<small style="color:#666;">✅ Esta respuesta fue útil ${best.useCount} veces anteriormente</small>\n\n`;
        detailedMessage += `<strong>💡 Sugerencia:</strong> Haz la misma consulta para ver los resultados completos con todos los detalles.`;
      } else {
        detailedMessage += `<div style="background:#ecfdf5;padding:12px;border-left:4px solid #10b981;border-radius:4px;margin:10px 0;">`;
        detailedMessage += `<strong style="color:#065f46;">✅ Respuesta:</strong><br/><br/>`;
        detailedMessage += `${response}`;
        detailedMessage += `</div>\n\n`;
        detailedMessage += `<small style="color:#666;">✅ Esta respuesta fue útil ${best.useCount} veces anteriormente</small>`;
      }
      
      appendMessage('bot', detailedMessage);
      incrementLearningUse(best.id);
      
      setTimeout(() => {
        showOptions([
          { label: '✅ Sí, me sirvió', value: 'yes' },
          { label: '🔍 Ver resultados completos', value: 'full' },
          { label: '❌ No, necesito más info', value: 'no' }
        ], (choice) => {
          hideOptions();
          if(choice === 'yes'){
            appendMessage('user', 'Sí, me sirvió');
            appendMessage('bot', '¡Perfecto! Me alegra que mi memoria te haya ayudado. 😊');
            saveLearningData(userText, best.response, { helpful: true, sourceId: best.id });
          } else if(choice === 'full'){
            appendMessage('user', 'Ver resultados completos');
            appendMessage('bot', '🔍 Perfecto, déjame buscar los resultados completos con todos los detalles...');
            return false;
          } else {
            appendMessage('user', 'No, necesito más info');
            appendMessage('bot', 'Entiendo, déjame buscar información más específica para ti... 🔍');
            return false;
          }
        });
      }, 500);
      
      return true;
    }
  }
  
  return false;
  */
}

