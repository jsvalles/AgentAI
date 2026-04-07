/**
 * Multi-PDF Document Manager
 * Carga y procesa TODOS los PDFs en la carpeta data/
 * Proporciona búsqueda semántica en todos los documentos
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Almacenamiento en memoria de TODOS los PDFs
let allDocuments = [];
let isLoaded = false;

/**
 * Escanea la carpeta data/ y carga TODOS los PDFs
 */
async function loadC2MGuide() {
  try {
    const dataDir = path.join(__dirname, 'data');
    
    if (!fs.existsSync(dataDir)) {
      console.warn('⚠️ Carpeta data/ no encontrada');
      return false;
    }

    console.log('📚 Cargando documentación...');
    
    // Obtener todos los archivos PDF en la carpeta
    const files = fs.readdirSync(dataDir);
    const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.warn('⚠️ No se encontraron archivos PDF en data/');
      return false;
    }

    console.log(`📄 Encontrados ${pdfFiles.length} archivos PDF`);
    
    // Cargar cada PDF
    const loadedDocs = [];
    
    for (const pdfFile of pdfFiles) {
      try {
        const pdfPath = path.join(dataDir, pdfFile);
        console.log(`📖 Cargando: ${pdfFile}...`);
        
        const dataBuffer = fs.readFileSync(pdfPath);
        const data = await pdfParse(dataBuffer);

        // Dividir el contenido en secciones manejables
        const fullText = data.text;
        const chunkSize = 3000;
        const chunks = [];
        
        for (let i = 0; i < fullText.length; i += chunkSize) {
          const chunk = fullText.substring(i, i + chunkSize);
          chunks.push({
            pageNum: Math.floor(i / chunkSize) + 1,
            content: chunk,
            documentName: pdfFile
          });
        }

        loadedDocs.push({
          fileName: pdfFile,
          displayName: pdfFile.replace('.pdf', ''),
          numPages: data.numpages,
          totalCharacters: fullText.length,
          sections: chunks,
          fullText: fullText
        });

        console.log(`   ✅ ${pdfFile} (${data.numpages} páginas, ${chunks.length} secciones)`);
        
      } catch (error) {
        console.error(`   ❌ Error cargando ${pdfFile}:`, error.message);
      }
    }
    
    allDocuments = loadedDocs;
    isLoaded = loadedDocs.length > 0;

    if (isLoaded) {
      const totalPages = allDocuments.reduce((sum, doc) => sum + doc.numPages, 0);
      const totalSections = allDocuments.reduce((sum, doc) => sum + doc.sections.length, 0);
      console.log(`✅ Guía de C2M cargada: ${totalPages} páginas, ${totalSections} secciones`);
      allDocuments.forEach(doc => {
        console.log(`   ✅ ${doc.displayName} (${doc.numPages} páginas, ${doc.sections.length} secciones)`);
      });
    }

    return isLoaded;

  } catch (error) {
    console.error('❌ Error cargando documentación:', error.message);
    return false;
  }
}

/**
 * Busca información relevante en TODOS los documentos PDF cargados
 * @param {string} query - Consulta del usuario
 * @param {number} maxResults - Máximo de resultados a retornar
 * @returns {Array} Resultados encontrados con su relevancia y fuente
 */
function searchC2MGuide(query, maxResults = 5) {
  if (!isLoaded || allDocuments.length === 0) {
    return [];
  }

  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);

  const allResults = [];

  // Buscar en CADA documento PDF cargado
  for (const doc of allDocuments) {
    // Buscar en cada sección del documento
    for (const section of doc.sections) {
      const contentLower = section.content.toLowerCase();
      let score = 0;
      let matchedWords = [];

      // Calcular relevancia basada en palabras clave
      for (const word of queryWords) {
        const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
        if (matches > 0) {
          score += matches;
          matchedWords.push(word);
        }
      }

      // Si hay coincidencias, agregar a resultados
      if (score > 0) {
        allResults.push({
          documentName: doc.fileName,
          displayName: doc.displayName,
          pageNum: section.pageNum,
          content: section.content,
          score: score,
          matchedWords: matchedWords
        });
      }
    }
  }

  // Ordenar por relevancia y retornar top N
  allResults.sort((a, b) => b.score - a.score);
  return allResults.slice(0, maxResults);
}

/**
 * Obtiene un extracto relevante del contenido encontrado
 * @param {string} content - Contenido completo de la sección
 * @param {string} query - Consulta original
 * @param {number} contextLength - Longitud del contexto a extraer
 * @returns {string} Extracto relevante
 */
function getRelevantExcerpt(content, query, contextLength = 500) {
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Buscar la primera palabra clave de la consulta
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 3);
  
  for (const word of queryWords) {
    const index = contentLower.indexOf(word);
    if (index !== -1) {
      // Extraer contexto alrededor de la palabra encontrada
      const start = Math.max(0, index - contextLength / 2);
      const end = Math.min(content.length, index + contextLength / 2);
      
      let excerpt = content.substring(start, end);
      
      // Agregar puntos suspensivos si no es el inicio/final
      if (start > 0) excerpt = '...' + excerpt;
      if (end < content.length) excerpt = excerpt + '...';
      
      return excerpt.trim();
    }
  }
  
  // Si no se encuentra la palabra, retornar inicio del contenido
  return content.substring(0, contextLength) + '...';
}

/**
 * Formatea los resultados para enviar a Claude
 * @param {Array} results - Resultados de la búsqueda
 * @param {string} query - Consulta original
 * @returns {string} Contexto formateado para Claude
 */
function formatResultsForClaude(results, query) {
  if (results.length === 0) {
    return null;
  }

  let context = '**� Información encontrada en la documentación:**\n\n';

  // Agrupar resultados por documento
  const byDocument = {};
  for (const result of results) {
    if (!byDocument[result.displayName]) {
      byDocument[result.displayName] = [];
    }
    byDocument[result.displayName].push(result);
  }

  // Formatear cada documento
  for (const [docName, docResults] of Object.entries(byDocument)) {
    context += `**📕 ${docName}:**\n\n`;
    
    for (const result of docResults) {
      const excerpt = getRelevantExcerpt(result.content, query, 800);
      context += `Sección ${result.pageNum} (palabras clave: ${result.matchedWords.join(', ')}):\n`;
      context += `${excerpt}\n\n`;
    }
  }

  context += '\n*Nota: Este contenido puede estar en inglés y debe ser traducido al español en la respuesta.*';
  
  return context;
}

/**
 * Verifica si el módulo está listo para usar
 */
function isReady() {
  return isLoaded && allDocuments.length > 0;
}

/**
 * Obtiene estadísticas de los documentos cargados
 */
function getStats() {
  if (!isLoaded || allDocuments.length === 0) {
    return { loaded: false };
  }

  const totalPages = allDocuments.reduce((sum, doc) => sum + doc.numPages, 0);
  const totalSections = allDocuments.reduce((sum, doc) => sum + doc.sections.length, 0);
  const totalChars = allDocuments.reduce((sum, doc) => sum + doc.totalCharacters, 0);

  return {
    loaded: true,
    numDocuments: allDocuments.length,
    documents: allDocuments.map(doc => ({
      name: doc.displayName,
      pages: doc.numPages,
      sections: doc.sections.length
    })),
    totalPages: totalPages,
    totalSections: totalSections,
    totalCharacters: totalChars
  };
}

module.exports = {
  loadC2MGuide,
  searchC2MGuide,
  formatResultsForClaude,
  isReady,
  getStats
};
