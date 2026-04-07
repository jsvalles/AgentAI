// ============================================
// MERMAID POST-PROCESSOR
// ============================================
// Limpia y optimiza código Mermaid generado por AI para asegurar renderizado exitoso

/**
 * Acorta nombres largos preservando el significado
 */
function shortenLongLabels(mermaidCode) {
  if (!mermaidCode) return mermaidCode;
  
  // Diccionario de reemplazos para términos comunes largos
  const replacements = {
    'EstimMedidaFactorTipoDiaEstimMedidaFechaAnterior': 'Factor perfil<br/>fecha anterior',
    'CM-EstimMedidaFactorTipoDiaEstimMedidaFechaAnterior': 'Regla VEE<br/>factor perfil',
    'Crear regla de VEE CM-': 'Crear regla<br/>',
    'Habilitar parámetros de entrada': 'Config<br/>parámetros',
    'Aplicar estimación por Factor de Perfil o Tipo de Día': 'Aplicar<br/>factor',
    'Factor de Perfil o Tipo de Día Misma Fecha Anterior': 'Factor perfil<br/>año anterior',
    'verificando si existe una medida': 'verificar<br/>medida',
    'utiliza la estimación': 'usar estimación',
    'MDM-EST-R-003': 'MDM-EST-R-003<br/>',
  };
  
  // Aplicar reemplazos
  let cleaned = mermaidCode;
  for (const [long, short] of Object.entries(replacements)) {
    const regex = new RegExp(long.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleaned = cleaned.replace(regex, short);
  }
  
  // Detectar y acortar nodos con texto > 40 caracteres
  const longNodePattern = /(\b[A-Z][A-Z0-9_]*)\[([^\]]{40,})\]/g;
  cleaned = cleaned.replace(longNodePattern, (match, nodeId, text) => {
    console.log(`⚠️ Acortando nodo ${nodeId}: "${text.substring(0, 30)}..."`);
    
    // Intentar extraer palabras clave (primeras 3-4 palabras significativas)
    const words = text
      .replace(/["\(\)]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2); // Ignorar palabras cortas como "de", "la"
    
    let shortened = words.slice(0, 3).join(' ');
    
    // Si sigue siendo largo, usar solo primeras 2 palabras con <br/>
    if (shortened.length > 35) {
      shortened = words.slice(0, 2).join('<br/>');
    }
    
    return `${nodeId}[${shortened}]`;
  });
  
  return cleaned;
}

/**
 * Normaliza el código Mermaid generado por AI
 */
function normalizeMermaidFromAI(aiResponse) {
  if (!aiResponse || typeof aiResponse !== 'string') {
    return aiResponse;
  }
  
  // Buscar bloques de código Mermaid
  const mermaidBlockRegex = /```mermaid\n([\s\S]*?)\n```/g;
  
  let processed = aiResponse;
  let match;
  
  while ((match = mermaidBlockRegex.exec(aiResponse)) !== null) {
    const originalCode = match[1];
    let cleanedCode = originalCode;
    
    // 1. Acortar labels largos
    cleanedCode = shortenLongLabels(cleanedCode);
    
    // 2. Normalizar flechas múltiples (----> a -->)
    cleanedCode = cleanedCode.replace(/---+>/g, '-->');
    
    // 3. Eliminar espacios extra
    cleanedCode = cleanedCode
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    // Reemplazar el bloque original con el limpio
    const originalBlock = match[0];
    const cleanedBlock = '```mermaid\n' + cleanedCode + '\n```';
    processed = processed.replace(originalBlock, cleanedBlock);
  }
  
  return processed;
}

module.exports = {
  normalizeMermaidFromAI,
  shortenLongLabels
};
