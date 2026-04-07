// Script para parchear script.js con el código normalizeMermaidCode mejorado
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, 'script.js');
let content = fs.readFileSync(scriptPath, 'utf8');

// Encontrar la función normalizeMermaidCode
const functionStart = content.indexOf('function normalizeMermaidCode(rawCode)');
const functionEnd = content.indexOf('// Validar sintaxis básica de Mermaid', functionStart);

if(functionStart === -1 || functionEnd === -1) {
  console.error('❌ No se encontró la función normalizeMermaidCode');
  process.exit(1);
}

const newFunction = `function normalizeMermaidCode(rawCode) {
  if(!rawCode || typeof rawCode !== 'string') {
    return '';
  }

  let code = rawCode
    .replace(/\\r/g, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\\u00A0/g, ' ')
    .trim();

  // Normalizar flechas: ---> o ----> a -->
  code = code.replace(/---+>/g, '-->');

  // DETECTAR SI TODO ESTÁ EN UNA SOLA LÍNEA (problema común del AI)
  const hasNewlines = code.includes('\\n');
  const isFlowchart = /\\b(flowchart|graph)\\s+\\w+/i.test(code);
  
  if(!hasNewlines && isFlowchart) {
    console.log('⚠️ Mermaid en una línea - separando nodos y conexiones...');
    
    // Separar por espacios estratégicamente antes de IDs de nodos
    // flowchart TD A[x] B[y] A --> B  =>  flowchart TD\\nA[x]\\nB[y]\\nA --> B
    code = code
      .replace(/\\b(flowchart|graph)\\s+(\\w+)\\s+/i, '$1 $2\\n')
      .replace(/([A-Z][A-Z0-9_]*)([\\\[\\\{\\\(])/g, '\\n$1$2')
      .replace(/(\\]|\\}|\\))\\s+([A-Z][A-Z0-9_]*)([\\\[\\\{\\\(])/g, '$1\\n$2$3')
      .replace(/([A-Z][A-Z0-9_]*)\\s+(-->)/g, '\\n$1 $2')
      .split('\\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\\n');
    
    console.log('✅ Mermaid reconstruido con saltos de línea');
  }

  // Remover numeración típica de listas dentro del bloque Mermaid
  let lines = code
    .split('\\n')
    .map(line => line.replace(/^\\s*\\d+\\.\\s+/, '').trimRight());

  // Asegurar que el bloque empiece desde la declaración de diagrama
  const startIndex = lines.findIndex(line => /\\b(flowchart|graph|sequenceDiagram|stateDiagram)\\b/i.test(line));
  if(startIndex > 0) {
    lines = lines.slice(startIndex);
  }

  // Si es flowchart/graph, filtrar líneas narrativas que rompen Mermaid
  const header = (lines[0] || '').trim();
  if(/\\b(flowchart|graph)\\b/i.test(header)) {
    const cleaned = [header];

    for(let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if(!line) continue;

      // Comentarios Mermaid
      if(line.startsWith('%%')) {
        cleaned.push(line);
        continue;
      }

      // Mantener líneas que parezcan sintaxis Mermaid de flowchart
      const isMermaidLike = /(-->|---|==>|-.->|<-->|\\[[^\\]]*\\]|\\([^\\)]*\\)|\\{[^\\}]*\\}|\\bsubgraph\\b|\\bend\\b|\\bclassDef\\b|\\bclass\\b|\\bstyle\\b|\\blinkStyle\\b|^[A-Z0-9_]+[\\(\\[\\{])/i.test(line);
      if(isMermaidLike) {
        cleaned.push(line);
      } else {
        console.debug('Línea ignorada en Mermaid:', line);
      }
    }

    lines = cleaned;
  }

  const result = lines.join('\\n').trim();
  console.log('📊 Código Mermaid normalizado:', result);
  return result;
}

`;

// Reemplazar la función vieja con la nueva
const before = content.substring(0, functionStart);
const after = content.substring(functionEnd);
content = before + newFunction + '\n' + after;

// Guardar el archivo
fs.writeFileSync(scriptPath, content, 'utf8');
console.log('✅ script.js parcheado exitosamente');
console.log('📝 Función normalizeMermaidCode actualizada');
console.log('🔄 Recarga la página del chatbot para ver los cambios');
