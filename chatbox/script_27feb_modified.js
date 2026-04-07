const messagesEl = document.getElementById('messages');
const inputForm = document.getElementById('inputForm');
const messageInput = document.getElementById('messageInput');
const optionsContainer = document.getElementById('optionsContainer');
const translateToggle = document.getElementById('translateToggle');

let reportState = { step: null, sistema: null, modulo: null };
let lastJiraTicket = null; // Guardar el código del último ticket creado
let currentOptions = []; // Opciones actuales disponibles
let stateHistory = []; // Historial para volver atrás
let waitingForAdvisorySystem = false; // Flag para detectar cuando espera sistema de asesoría
let waitingForIncidentSystem = false; // Flag para detectar cuando espera sistema de incidencia
let lastDataContext = null; // Contexto de los últimos datos cargados (para consultas de seguimiento)
let lastDataFilter = null; // Último filtro aplicado en consultas de datos
let currentLanguage = 'es'; // Idioma actual: 'es' o 'en'
let originalMessagesCache = new Map(); // Cache de mensajes originales para traducción

// TRADUCCIÓN DESACTIVADA TEMPORALMENTE - API key no tiene acceso a modelos de Claude
/*
if(translateToggle){
  translateToggle.addEventListener('click', async () => {
    const newLang = currentLanguage === 'es' ? 'en' : 'es';
    translateToggle.disabled = true;
    const originalText = translateToggle.textContent;
    translateToggle.textContent = '⏳ Traduciendo...';
    
    try {
      // Esperar un momento para asegurar que el DOM esté listo
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Obtener todos los mensajes del bot
      const botMessages = Array.from(document.querySelectorAll('.message.bot'));
      
      console.log(`🔍 Encontrados ${botMessages.length} mensajes del bot para traducir`);
      
      if(botMessages.length === 0){
        alert('No hay mensajes para traducir aún. Escribe algo primero.');
        translateToggle.textContent = originalText;
        translateToggle.disabled = false;
        return;
      }
      
      let translatedCount = 0;
      
      for(let msgEl of botMessages){
        // Guardar mensaje original si no existe en cache
        if(!originalMessagesCache.has(msgEl)){
          originalMessagesCache.set(msgEl, msgEl.innerHTML);
        }
        
        // Si volvemos a español, restaurar original
        if(newLang === 'es'){
          msgEl.innerHTML = originalMessagesCache.get(msgEl);
          translatedCount++;
          continue;
        }
        
        // Obtener texto a traducir (del original)
        const textToTranslate = originalMessagesCache.get(msgEl);
        
        // Extraer solo texto sin HTML para traducir
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = textToTranslate;
        const plainText = tempDiv.textContent || tempDiv.innerText;
        
        if(plainText.length > 10){ // Solo traducir mensajes con contenido
          try {
            const response = await fetch('/api/ai/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                text: plainText.substring(0, 1000), // Limitar tamaño
                targetLang: newLang 
              })
            });
            
            const data = await response.json();
            
            if(data.success && data.translation){
              msgEl.innerHTML = data.translation;
              translatedCount++;
            }
          } catch(err) {
            console.error('Error traduciendo mensaje individual:', err);
          }
          
          // Pequeño delay entre traducciones para no saturar la API
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      currentLanguage = newLang;
      translateToggle.textContent = `🌐 ${newLang.toUpperCase()}`;
      translateToggle.style.background = newLang === 'en' ? '#ef4444' : '#10b981';
      
      console.log(`✅ ${translatedCount} mensajes traducidos a ${newLang}`);
      
      if(translatedCount === 0){
        alert('No se pudieron traducir los mensajes. Verifica la consola para más detalles.');
      }
      
    } catch(error) {
      console.error('Error al traducir:', error);
      alert('Error al traducir. Verifica que Claude AI esté configurado.');
      translateToggle.textContent = originalText;
    } finally {
      translateToggle.disabled = false;
    }
  });
}
*/

// Función global para normalizar texto (quitar acentos, caracteres especiales)
function normalizeText(text){
  if(!text) return '';
  return String(text).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9\s]/g, ' '); // Reemplazar caracteres especiales por espacios
}

// Función para validar si la pregunta está relacionada con el dominio de la aplicación
function isRelatedToApplicationDomain(text){
  const normalized = normalizeText(text);
  
  // Palabras clave relacionadas con el dominio de Oracle Utilities
  const domainKeywords = [
    // Sistemas
    'c2m', 'customer', 'meter', 'field', 'sales', 'service', 'oracle', 'utilities',
    'mdm', 'd1', 'ccb',
    
    // Módulos y funcionalidades
    'medidor', 'medidores', 'lectura', 'lecturas', 'instalacion', 'dispositivo',
    'contrato', 'contratos', 'cliente', 'clientes', 'facturacion', 'factura',
    'cargo', 'cargos', 'tarifa', 'tarifas', 'consumo', 'consumos',
    'orden', 'ordenes', 'trabajo', 'servicio', 'tecnico',
    'venta', 'ventas', 'prospecto', 'lead', 'cotizacion',
    'comunicacion', 'comunicaciones', 'actividad', 'actividades',
    'saliente', 'entrante', 'salientes', 'entrantes',
    
    // Términos técnicos específicos de C2M
    'niu', 'niiu', 'device', 'sp', 'service point', 'premise', 'account',
    'billing', 'route', 'ruta', 'ciclo', 'cycle', 'cutoff', 'corte',
    'reconnect', 'reconexion', 'suspender', 'suspend', 'activar',
    'dian', 'impuesto', 'facturacion electronica', 'xml', 'cufe',
    
    // Términos técnicos
    'configuracion', 'integracion', 'interfaz', 'api', 'webservice',
    'batch', 'proceso', 'algoritmo', 'regla', 'validacion',
    'sincronizacion', 'mapeo', 'transformacion', 'parser',
    
    // Acciones relacionadas
    'ticket', 'caso', 'incidencia', 'incidente', 'error', 'problema', 'fallo',
    'bug', 'reporte', 'reportar', 'consulta', 'consultar', 'asesoria',
    'ayuda', 'soporte', 'documentacion', 'manual', 'guia',
    
    // Términos de búsqueda válidos
    'como', 'configurar', 'instalar', 'crear', 'modificar', 'eliminar',
    'buscar', 'encontrar', 'ver', 'mostrar', 'listar',
    
    // Análisis de datos y estadísticas (AGREGADO)
    'datos', 'data', 'analisis', 'analizar', 'analicemos', 'analizamos',
    'revisar', 'revision', 'revisemos', 'revisamos',
    'estadistica', 'estadisticas', 'estadistico', 'estadisticos',
    'metricas', 'metrica', 'indicador', 'indicadores',
    'grafico', 'graficos', 'reporte', 'reportes', 'informe', 'informes',
    'total', 'suma', 'promedio', 'cantidad', 'conteo', 'cuantos',
    'excel', 'archivo', 'tabla', 'registros', 'columna', 'columnas',
    'filtro', 'filtros', 'filtrar', 'agrupar', 'agrupacion',
    
    // Confluence y JIRA
    'confluence', 'jira', 'wiki', 'documentacion', 'pagina'
  ];
  
  // Verificar si la pregunta contiene al menos una palabra clave del dominio
  const hasKeyword = domainKeywords.some(keyword => normalized.includes(keyword));
  
  return hasKeyword;
}

// Función para validar si la pregunta está fuera del alcance del sistema
function isOutOfScopeQuestion(text){
  const normalized = normalizeText(text);
  
  // Comandos de salida y frases de cortesía SIEMPRE son válidas
  const validCommandsAndCourtesy = [
    /^(salir|exit|cerrar|terminar|finalizar)$/i,
    /gracias/i,
    /me sirvio/i,
    /me ayudo/i,
    /resuelto/i,
    /perfecto/i,
    /excelente/i,
    /ok$/i,
    /^si$/i,
    /^no$/i,
    /hola$/i,
    /buenos dias/i,
    /buenas tardes/i,
    /buenas noches/i
  ];
  
  // Si es un comando válido o cortesía, no está fuera de alcance
  if(validCommandsAndCourtesy.some(pattern => pattern.test(text.trim()))){
    return false;
  }
  
  // Preguntas sobre definiciones (qué es, qué son, etc.) siempre son válidas
  if(/^(que|qué)\s+(es|son|significa|significan)/i.test(text.trim())){
    console.log('✅ Pregunta sobre definición detectada - aceptada automáticamente');
    return false;
  }
  
  // Si hay un contexto de datos activo y el usuario escribe solo un número, es válido
  if(lastDataContext && /^\s*\d+\s*$/.test(text.trim())){
    console.log('✅ Número detectado con contexto de datos activo');
    return false;
  }
  
  // Primero verificar si tiene palabras clave del dominio
  if(!isRelatedToApplicationDomain(text)){
    console.log('⚠️ Pregunta sin palabras clave del dominio');
    return true; // Es fuera de alcance si no tiene palabras del dominio
  }
  
  // Patrones específicos de preguntas fuera del alcance (incluso si tienen alguna palabra similar)
  const outOfScopePatterns = [
    // Preguntas personales sobre el bot
    /cuantos? anos? tienes?/,
    /cuanto tiempo tienes/,
    /que edad tienes/,
    /cuando naciste/,
    /eres humano/,
    /eres robot/,
    /quien eres tu/,
    /como te llamas/,
    /cual es tu nombre/,
    
    // Preguntas sobre hora/fecha/tiempo
    /que hora es/,
    /que hora son/,
    /que dia es/,
    /que fecha es/,
    /que ano es/,
    
    // Preguntas generales/conversacionales
    /como estas/,
    /como te va/,
    /que tal estas/,
    /como amaneciste/,
    /que haces/,
    /donde vives/,
    /de donde eres/,
    
    // Preguntas sobre clima
    /que clima hace/,
    /como esta el tiempo/,
    /va a llover/,
    
    // Preguntas matemáticas o de cálculo general
    /cuanto es \d+.*\d+/,
    /calcula \d+/,
    /resuelve \d+/,
    
    // Deportes, entretenimiento, celebridades
    /donde juega/,
    /quien juega/,
    /partido de/,
    /quien gano/,
    /pelicula/,
    /serie de/,
    /cancion de/,
    /actor/,
    /actriz/
  ];
  
  // Verificar si coincide con algún patrón específico
  return outOfScopePatterns.some(pattern => pattern.test(normalized));
}

// Función para mostrar mensaje de pregunta fuera de alcance
function showOutOfScopeMessage(){
  const messages = [
    "⚠️ Lo siento, esa pregunta está fuera del propósito de esta aplicación.",
    "🎯 Estoy diseñado para ayudarte con:<br>" +
    "• <strong>Consultas</strong> sobre Oracle Utilities (C2M, FIELD, SALES, SERVICE)<br>" +
    "• <strong>Reportar incidencias</strong> técnicas<br>" +
    "• <strong>Asesoría</strong> sobre configuraciones y procesos<br>" +
    "• <strong>Búsqueda</strong> de documentación en Confluence<br><br>" +
    "¿En qué puedo ayudarte con estos temas? 😊"
  ];
  
  messages.forEach((msg, index) => {
    setTimeout(() => {
      appendMessage('bot', msg);
    }, index * 800);
  });
}

function appendMessage(kind, text){
  const el = document.createElement('div');
  el.className = 'message ' + (kind === 'user' ? 'user' : 'bot');
  el.innerHTML = text;
  messagesEl.appendChild(el);
  
  // Asegurar que todos los enlaces funcionen correctamente
  const links = el.querySelectorAll('a[href]');
  links.forEach(link => {
    // Si no tiene target, añadir _blank
    if(!link.hasAttribute('target')){
      link.setAttribute('target', '_blank');
    }
    // Asegurar que el enlace sea clickeable
    link.style.cursor = 'pointer';
    // Prevenir que eventos padre interfieran
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      // No preventDefault, dejar que el navegador abra el enlace normalmente
    });
  });
  
  // Si es mensaje del bot y es largo (>300 caracteres), agregar botón de resumir
  if(kind === 'bot' && text.length > 300){
    const summarizeBtn = document.createElement('button');
    summarizeBtn.textContent = '📝 Resumir con IA';
    summarizeBtn.style.cssText = 'margin-top:8px;background:#8b5cf6;color:white;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all 0.2s;';
    summarizeBtn.onmouseover = () => summarizeBtn.style.background = '#7c3aed';
    summarizeBtn.onmouseout = () => summarizeBtn.style.background = '#8b5cf6';
    
    summarizeBtn.onclick = async () => {
      summarizeBtn.disabled = true;
      summarizeBtn.textContent = '⏳ Resumiendo...';
      
      try {
        const response = await fetch('/api/ai/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: text.replace(/<[^>]*>/g, ''), maxLength: 200 })
        });
        
        const data = await response.json();
        
        if(data.success){
          summarizeBtn.style.display = 'none';
          
          const summaryDiv = document.createElement('div');
          summaryDiv.style.cssText = 'margin-top:10px;padding:12px;background:#f3e8ff;border-left:3px solid #8b5cf6;border-radius:6px;font-size:13px;';
          summaryDiv.innerHTML = `<strong style="color:#7c3aed;">📝 Resumen:</strong><br>${data.summary}`;
          el.appendChild(summaryDiv);
        } else {
          summarizeBtn.textContent = '❌ Error';
          setTimeout(() => {
            summarizeBtn.disabled = false;
            summarizeBtn.textContent = '📝 Resumir con IA';
          }, 2000);
        }
      } catch(error) {
        console.error('Error al resumir:', error);
        summarizeBtn.textContent = '❌ Error';
        setTimeout(() => {
          summarizeBtn.disabled = false;
          summarizeBtn.textContent = '📝 Resumir con IA';
        }, 2000);
      }
    };
    
    el.appendChild(summarizeBtn);
  }
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Nueva función para mensajes con efecto de escritura progresiva (tipo ChatGPT)
function appendMessageStreaming(kind, text, speed = 10) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'message ' + (kind === 'user' ? 'user' : 'bot');
    el.innerHTML = ''; // Empezar vacío
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Convertir HTML a texto y tags
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    
    let currentIndex = 0;
    const fullText = text;
    let isInTag = false;
    let currentTag = '';
    
    function typeNextChar() {
      if (currentIndex < fullText.length) {
        const char = fullText[currentIndex];
        
        // Manejar tags HTML
        if (char === '<') {
          isInTag = true;
          currentTag = char;
        } else if (char === '>' && isInTag) {
          currentTag += char;
          isInTag = false;
          el.innerHTML += currentTag;
          currentTag = '';
        } else if (isInTag) {
          currentTag += char;
        } else {
          el.innerHTML += char;
        }
        
        currentIndex++;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        
        // Velocidad variable: más rápido para espacios y saltos de línea
        const nextSpeed = (char === ' ' || char === '\n') ? speed / 3 : speed;
        setTimeout(typeNextChar, nextSpeed);
      } else {
        resolve(); // Terminar cuando se complete
      }
    }
    
    typeNextChar();
  });
}

function showOptions(options, onSelect, allowBack = true){
  currentOptions = options; // Guardar opciones actuales
  optionsContainer.innerHTML = '';
  optionsContainer.style.display = 'flex';
  
  options.forEach(opt=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = opt.label;
    btn.addEventListener('click', ()=>{
      currentOptions = []; // Limpiar opciones al seleccionar
      onSelect(opt.value);
    });
    optionsContainer.appendChild(btn);
  });
  
  // Agregar botón de volver si hay historial y está permitido
  if(allowBack && stateHistory.length > 0){
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '⬅️ Volver';
    backBtn.style.cssText = 'background:#6b7280;';
    backBtn.addEventListener('click', ()=>goBack());
    optionsContainer.appendChild(backBtn);
  }
}

function hideOptions(){
  currentOptions = []; // Limpiar opciones actuales
  optionsContainer.innerHTML = '';
  optionsContainer.style.display = 'none';
}

// Buscar en archivo Excel como base de conocimiento
async function searchInExcelKnowledgeBase(query, sistema){
  try {
    // Listar archivos disponibles
    const listResponse = await fetch('/api/data/list-files');
    const listData = await listResponse.json();
    
    console.log('Respuesta de list-files:', listData);
    
    if(!listData.success || !listData.files || listData.files.length === 0){
      console.error('No hay archivos disponibles');
      showNoResultsOptions(query, sistema);
      return;
    }
    
    // El endpoint devuelve un array de strings con los nombres de archivos
    const fileName = typeof listData.files[0] === 'string' ? listData.files[0] : listData.files[0].name;
    console.log('Nombre de archivo a usar:', fileName);
    
    // Obtener todos los datos del Excel
    const dataResponse = await fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`);
    const dataResult = await dataResponse.json();
    
    console.log('Respuesta de analyze:', dataResult);
    
    if(!dataResult.success || !dataResult.allData || dataResult.allData.length === 0){
      console.error('No hay datos en el archivo');
      showNoResultsOptions(query, sistema);
      return;
    }
    
    const allData = dataResult.allData;
    const stats = dataResult.stats;
    
    // Buscar columna "Asunto" con más flexibilidad
    const asuntoCol = stats.columns.find(col => /asunto|subject|titulo|title|descripci[oó]n|description/i.test(col));
    const solucionCol = stats.columns.find(col => /soluci[oó]n|causa|resoluci[oó]n|resolution/i.test(col));
    const aplicacionCol = stats.columns.find(col => /aplicaci[oó]n|app|sistema|system/i.test(col));
    
    console.log('Todas las columnas disponibles:', stats.columns);
    console.log('Columnas detectadas:', { asuntoCol, solucionCol, aplicacionCol });
    
    if(!asuntoCol){
      console.error('No se encontró columna de asunto/título en el Excel');
      console.log('Intentando buscar en todas las columnas de texto...');
      
      // Si no hay columna específica, usar columnas de texto
      const textColumns = stats.columns.filter(col => 
        !/fecha|date|n[uú]mero|number|id|estado|status|prioridad|priority/i.test(col)
      );
      
      if(textColumns.length === 0){
        showNoResultsOptions(query, sistema);
        return;
      }
    }
    
    // Filtrar por sistema primero (si existe columna de aplicación y se especificó sistema)
    let filteredBySystem = allData;
    if(aplicacionCol && sistema){
      filteredBySystem = allData.filter(row => {
        const appValue = String(row[aplicacionCol] || '').toLowerCase();
        return appValue.includes(sistema.toLowerCase());
      });
      console.log(`Filtrado por sistema ${sistema}: ${filteredBySystem.length} casos`);
      
      if(filteredBySystem.length === 0){
        console.log('No hay casos para este sistema, buscando en todos');
        filteredBySystem = allData; // Si no hay casos del sistema, buscar en todos
      }
    }
    
    // Extraer palabras clave de la consulta (ignorar palabras muy comunes)
    const stopWords = ['el', 'la', 'los', 'las', 'un', 'una', 'de', 'en', 'a', 'con', 'por', 'para', 'como', 'que', 'es', 'se', 'al', 'del'];
    
    const normalizedQuery = normalizeText(query);
    const keywords = normalizedQuery
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word));
    
    console.log('Consulta original:', query);
    console.log('Consulta normalizada:', normalizedQuery);
    console.log('Palabras clave de búsqueda:', keywords);
    console.log('Buscando en columna:', asuntoCol);
    console.log('Total de registros a revisar:', filteredBySystem.length);
    
    // Buscar casos relevantes en la columna Asunto
    const relevantCases = filteredBySystem.filter(row => {
      const asuntoValue = String(row[asuntoCol] || '');
      const normalizedAsunto = normalizeText(asuntoValue);
      
      if(!normalizedAsunto) return false;
      
      // Mostrar los primeros 5 registros para debugging
      if(filteredBySystem.indexOf(row) < 5){
        console.log(`Registro ${filteredBySystem.indexOf(row) + 1}:`, asuntoValue.substring(0, 80));
      }
      
      // Contar cuántas palabras clave coinciden (al menos 1)
      let matchCount = 0;
      keywords.forEach(keyword => {
        if(normalizedAsunto.includes(keyword)){
          matchCount++;
          console.log(`  ✓ Encontró: "${keyword}" en "${asuntoValue.substring(0, 60)}..."`);
        }
      });
      return matchCount > 0;
    }).map(row => {
      // Calcular score de relevancia
      const asuntoValue = String(row[asuntoCol] || '').toLowerCase();
      let score = 0;
      keywords.forEach(keyword => {
        if(asuntoValue.includes(keyword)) score++;
      });
      return { row, score };
    }).sort((a, b) => b.score - a.score).slice(0, 5); // Top 5 más relevantes
    
    if(relevantCases.length === 0){
      showNoResultsOptions(query, sistema);
      return;
    }
    
    // Mostrar resultados
    const sistemaText = sistema ? ` en <strong>${sistema}</strong>` : '';
    appendMessage('bot', `📊 Encontré <strong>${relevantCases.length}</strong> caso${relevantCases.length > 1 ? 's' : ''} similar${relevantCases.length > 1 ? 'es' : ''}${sistemaText} en la base de conocimiento:`);
    
    relevantCases.forEach((item, i) => {
      const row = item.row;
      const caseDiv = document.createElement('div');
      caseDiv.style.cssText = 'margin:10px 0;padding:12px;background:#e0f2fe;border-left:4px solid #0284c7;border-radius:4px;';
      
      // Título del caso (Asunto)
      const titleDiv = document.createElement('div');
      titleDiv.style.cssText = 'font-weight:600;color:#0c4a6e;font-size:15px;margin-bottom:8px;';
      titleDiv.textContent = `📌 ${row[asuntoCol] || 'Caso #' + (i+1)}`;
      caseDiv.appendChild(titleDiv);
      
      // Solución (si existe)
      if(solucionCol && row[solucionCol]){
        const solucionDiv = document.createElement('div');
        solucionDiv.style.cssText = 'padding:10px;background:#f0f9ff;border-radius:4px;border:1px solid #bae6fd;font-size:14px;line-height:1.6;color:#0c4a6e;margin-bottom:8px;';
        
        const solucionTitle = document.createElement('div');
        solucionTitle.style.cssText = 'font-weight:600;color:#0369a1;margin-bottom:6px;';
        solucionTitle.textContent = '💡 Solución sugerida:';
        solucionDiv.appendChild(solucionTitle);
        
        const solucionText = document.createElement('div');
        solucionText.style.cssText = 'color:#0c4a6e;';
        solucionText.textContent = String(row[solucionCol]);
        solucionDiv.appendChild(solucionText);
        
        caseDiv.appendChild(solucionDiv);
      }
      
      // Información adicional
      const infoDiv = document.createElement('div');
      infoDiv.style.cssText = 'font-size:12px;color:#075985;margin-top:6px;';
      
      const estadoCol = stats.columns.find(col => /estado|status/i.test(col));
      const especialistaCol = stats.columns.find(col => /especialista|assigned|asignado/i.test(col));
      
      if(estadoCol) infoDiv.innerHTML += `📊 Estado: <strong>${row[estadoCol]}</strong> `;
      if(especialistaCol) infoDiv.innerHTML += `👤 Especialista: <strong>${row[especialistaCol]}</strong>`;
      
      caseDiv.appendChild(infoDiv);
      messagesEl.appendChild(caseDiv);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
    
    // Preguntar si la información fue útil
    askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
    
  } catch(error) {
    console.error('Error buscando en Excel:', error);
    showNoResultsOptions(query, sistema);
  }
}

// Función auxiliar para mostrar opciones cuando no hay resultados
function showNoResultsOptions(query, sistema){
  appendMessage('bot', 'No encontré casos similares en la base de conocimiento. He registrado tu consulta para revisión. 📝');
  appendMessage('bot', '¿Deseas crear un ticket para que un especialista revise tu consulta?');
  showOptions([
    { label: '📋 Crear ticket', value: 'ticket' },
    { label: '❌ No, gracias', value: 'cancel' }
  ], (choice)=>{
    if(choice === 'ticket'){
      appendMessage('user', 'Crear ticket');
      hideOptions();
      if(sistema) reportState.sistema = sistema;
      startSmartTicketCreation();
    }else{
      appendMessage('user', 'No, gracias');
      hideOptions();
      appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
    }
  });
}

// Función para mostrar detalles de caso(s) específico(s)
async function showCaseDetails(caseNumbers){
  try {
    // Obtener lista de archivos
    const listResponse = await fetch('/api/data/list-files');
    const listData = await listResponse.json();
    
    if(!listData.success || !listData.files || listData.files.length === 0){
      appendMessage('bot', '❌ No hay archivos Excel disponibles para buscar.');
      return;
    }
    
    const fileName = typeof listData.files[0] === 'string' ? listData.files[0] : listData.files[0].name;
    
    // Obtener datos del Excel
    const dataResponse = await fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`);
    const dataResult = await dataResponse.json();
    
    if(!dataResult.success || !dataResult.allData || dataResult.allData.length === 0){
      appendMessage('bot', '❌ No se pudo cargar el archivo Excel.');
      return;
    }
    
    const allData = dataResult.allData;
    const columns = Object.keys(allData[0]);
    
    // Buscar columnas relevantes
    const numeroCol = columns.find(col => /n[uú]mero.*ticket|ticket.*number|number|num/i.test(col));
    const asuntoCol = columns.find(col => /asunto|subject|titulo|title|descripci[oó]n/i.test(col));
    const solucionCol = columns.find(col => /soluci[oó]n|causa|resoluci[oó]n|resolution/i.test(col));
    const estadoCol = columns.find(col => /estado|status|state/i.test(col));
    const especialistaCol = columns.find(col => /especialista|assigned|asignado|assignee/i.test(col));
    const fechaCol = columns.find(col => /fecha.*creaci[oó]n|created.*date|create.*date|fecha/i.test(col));
    const aplicacionCol = columns.find(col => /aplicaci[oó]n|app|sistema|system/i.test(col));
    const prioridadCol = columns.find(col => /prioridad|priority/i.test(col));
    const funcionalidadCol = columns.find(col => /funcionalidad|proceso|function|process/i.test(col));
    
    if(!numeroCol){
      appendMessage('bot', '❌ No se encontró columna de número de ticket en el archivo.');
      return;
    }
    
    // Buscar cada caso
    const casesFound = [];
    const casesNotFound = [];
    
    caseNumbers.forEach(caseNum => {
      const caso = allData.find(row => {
        const ticketNum = String(row[numeroCol] || '').trim();
        return ticketNum === caseNum || ticketNum === '#' + caseNum;
      });
      
      if(caso){
        casesFound.push({ numero: caseNum, data: caso });
      }else{
        casesNotFound.push(caseNum);
      }
    });
    
    // Mostrar casos no encontrados
    if(casesNotFound.length > 0){
      appendMessage('bot', `⚠️ No se encontraron los siguientes casos: ${casesNotFound.join(', ')}`);
    }
    
    // Mostrar casos encontrados
    if(casesFound.length === 0){
      appendMessage('bot', '❌ No se encontró ningún caso con los números proporcionados.');
      return;
    }
    
    appendMessage('bot', `✅ Encontré ${casesFound.length} caso${casesFound.length > 1 ? 's' : ''}:`);
    
    // Mostrar cada caso con formato bonito
    casesFound.forEach((caso, index) => {
      const casoDiv = document.createElement('div');
      casoDiv.style.cssText = 'margin:15px 0;padding:16px;background:#f8fafc;border-left:4px solid #8B0000;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);';
      
      let html = `<div style="font-size:18px;font-weight:700;color:#8B0000;margin-bottom:12px;">📋 Caso #${caso.numero}</div>`;
      
      if(asuntoCol && caso.data[asuntoCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">📌 Asunto:</strong><br/><span style="color:#334155;font-size:15px;">${caso.data[asuntoCol]}</span></div>`;
      }
      
      if(aplicacionCol && caso.data[aplicacionCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">🖥️ Aplicación:</strong> <span style="background:#dbeafe;padding:4px 8px;border-radius:4px;font-weight:600;">${caso.data[aplicacionCol]}</span></div>`;
      }
      
      if(estadoCol && caso.data[estadoCol]){
        const estado = caso.data[estadoCol];
        const estadoColor = estado.toLowerCase().includes('closed') ? '#10b981' : 
                           estado.toLowerCase().includes('active') ? '#f59e0b' : '#6b7280';
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">📊 Estado:</strong> <span style="background:${estadoColor};color:white;padding:4px 8px;border-radius:4px;font-weight:600;">${estado}</span></div>`;
      }
      
      if(prioridadCol && caso.data[prioridadCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">⚡ Prioridad:</strong> <span style="color:#dc2626;font-weight:600;">${caso.data[prioridadCol]}</span></div>`;
      }
      
      if(especialistaCol && caso.data[especialistaCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">👤 Especialista Asignado:</strong> <span style="color:#334155;">${caso.data[especialistaCol]}</span></div>`;
      }
      
      if(fechaCol && caso.data[fechaCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">📅 Fecha de Creación:</strong> <span style="color:#334155;">${caso.data[fechaCol]}</span></div>`;
      }
      
      if(funcionalidadCol && caso.data[funcionalidadCol]){
        html += `<div style="margin:8px 0;"><strong style="color:#1e3a8a;">⚙️ Funcionalidad/Proceso:</strong> <span style="background:#e0e7ff;padding:4px 8px;border-radius:4px;color:#3730a3;font-weight:500;">${caso.data[funcionalidadCol]}</span></div>`;
      }
      
      if(solucionCol && caso.data[solucionCol]){
        // Formatear la solución para mejor legibilidad
        let solucionFormateada = caso.data[solucionCol];
        
        // 1. Separar secciones con "---" usando líneas horizontales
        solucionFormateada = solucionFormateada.replace(/---/g, '<hr style="border:none;border-top:2px solid #86efac;margin:16px 0;"/>');
        
        // 2. Formatear listas numeradas (1. 2. 3.)
        solucionFormateada = solucionFormateada.replace(/(\d+\.\s)/g, '<br/><strong style="color:#166534;">$1</strong>');
        
        // 3. Detectar y formatear tablas simples (líneas con múltiples espacios)
        const lineas = solucionFormateada.split('\n');
        solucionFormateada = lineas.map(linea => {
          // Si la línea tiene múltiples espacios seguidos, es probablemente una tabla
          if(/\s{3,}/.test(linea)){
            return '<div style="font-family:monospace;background:#f0fdf4;padding:4px 8px;margin:2px 0;border-left:3px solid #86efac;">' + linea + '</div>';
          }
          return linea;
        }).join('\n');
        
        // 4. Agregar saltos de línea donde no hay
        solucionFormateada = solucionFormateada.replace(/\n/g, '<br/>');
        
        html += `<div style="margin:12px 0;padding:12px;background:#dcfce7;border:1px solid #86efac;border-radius:6px;">`;
        html += `<strong style="color:#166534;font-size:16px;">✅ Solución:</strong><br/><br/>`;
        html += `<span style="color:#14532d;line-height:1.8;font-size:14px;">${solucionFormateada}</span>`;
        html += `</div>`;
      }else{
        html += `<div style="margin:12px 0;padding:12px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;">`;
        html += `<span style="color:#92400e;">⚠️ Este caso no tiene solución registrada.</span>`;
        html += `</div>`;
      }
      
      casoDiv.innerHTML = html;
      messagesEl.appendChild(casoDiv);
    });
    
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Preguntar si necesita más ayuda
    // setTimeout(() => {
    //   appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
    //   showOptions([
    //     { label: '🔍 Ver otro caso', value: 'otro' },
    //     { label: '📊 Buscar casos similares', value: 'similares' },
    //     { label: '✅ Finalizar', value: 'finalizar' }
    //   ], (choice) => {
    //     if(choice === 'otro'){
    //       appendMessage('user', 'Ver otro caso');
    //       hideOptions();
    //       appendMessage('bot', 'Por favor escribe el número del caso que deseas consultar. Por ejemplo: "muéstrame el caso 307903"');
    //     }else if(choice === 'similares'){
    //       appendMessage('user', 'Buscar casos similares');
    //       hideOptions();
    //       if(asuntoCol && casesFound[0].data[asuntoCol]){
    //         const palabrasClave = casesFound[0].data[asuntoCol].split(' ').slice(0, 3).join(' ');
    //         appendMessage('bot', `Buscando casos similares a "${palabrasClave}"...`);
    //         simulateBot(`cuantos casos tienen la palabra ${palabrasClave}`);
    //       }else{
    //         appendMessage('bot', '¿Qué palabra clave quieres buscar?');
    //       }
    //     }else{
    //       appendMessage('user', 'Finalizar');
    //       hideOptions();
    //       showFinalizarButton();
    //     }
    //   });
    // }, 500);
    
  } catch(err){
    console.error('Error al buscar casos:', err);
    appendMessage('bot', '❌ Hubo un error al buscar los casos. Por favor intenta de nuevo.');
  }
}

function searchInFAQs(query, sistema){
  // Validar si la pregunta está fuera del alcance ANTES de buscar
  if(isOutOfScopeQuestion(query)){
    console.log('⚠️ Pregunta fuera de alcance detectada en searchInFAQs');
    showOutOfScopeMessage();
    return;
  }
  
  // Detectar si es una pregunta de definición (qué es, cómo funciona, etc.)
  const isDefinitionQuestion = /^(que|qué|what|como|cómo|how|para que|para qué|cuál|cual|which)\s+(es|son|is|are|funciona|works?|sirve)/i.test(query);
  
  // Mostrar mensaje de búsqueda con estilo mejorado
  const searchingMsg = document.createElement('div');
  searchingMsg.id = 'searching-msg';
  searchingMsg.style.cssText = 'margin:10px 0;padding:14px;background:linear-gradient(135deg, #667eea15 0%, #764ba215 100%);border-left:4px solid #667eea;border-radius:8px;';
  
  if(isDefinitionQuestion){
    searchingMsg.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="spinner" style="border:3px solid #f3f4f6;border-top:3px solid #667eea;border-radius:50%;width:22px;height:22px;animation:spin 1s linear infinite;"></div><span style="color:#5b21b6;font-weight:600;font-size:15px;">📚 Buscando en documentación de Oracle C2M...</span></div>';
  } else {
    searchingMsg.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="spinner" style="border:3px solid #f3f4f6;border-top:3px solid #667eea;border-radius:50%;width:22px;height:22px;animation:spin 1s linear infinite;"></div><span style="color:#5b21b6;font-weight:600;font-size:15px;">🔍 Buscando en casos históricos...</span></div>';
  }
  
  // Agregar animación del spinner si no existe
  if(!document.getElementById('spinner-style')){
    const style = document.createElement('style');
    style.id = 'spinner-style';
    style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  
  messagesEl.appendChild(searchingMsg);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  console.log('🔍 Tipo de pregunta:', isDefinitionQuestion ? 'DEFINICIÓN (usar C2M PDF)' : 'CASO (usar Confluence/Excel)');
  
  // Si es pregunta de definición, buscar en C2M Guide (PDF de Oracle)
  if(isDefinitionQuestion){
    fetch('/api/c2m-guide/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query })
    })
    .then(r => r.json())
    .then(data => {
      console.log('📚 Resultados C2M Guide:', data);
      
      if(!data.success || !data.results || data.results.length === 0){
        // No hay resultados en documentación, ofrecer crear ticket
        const searchingEl = document.getElementById('searching-msg');
        if(searchingEl) searchingEl.remove();
        
        appendMessage('bot', 'No encontré información sobre eso en la documentación de Oracle C2M. 😕');
        appendMessage('bot', '¿Deseas crear un ticket para que un especialista revise tu consulta?');
        
        showOptions([
          { label: '✅ Crear ticket', value: 'ticket' },
          { label: '❌ No, gracias', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'ticket'){
            appendMessage('user', 'Crear ticket');
            hideOptions();
            if(sistema) reportState.sistema = sistema;
            startSmartTicketCreation();
          }else{
            appendMessage('user', 'No, gracias');
            hideOptions();
            appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
          }
        });
        return;
      }
      
      // Actualizar mensaje para mostrar análisis con IA
      const searchingEl = document.getElementById('searching-msg');
      if(searchingEl){
        searchingEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="spinner" style="border:3px solid #f3f4f6;border-top:3px solid #667eea;border-radius:50%;width:22px;height:22px;animation:spin 1s linear infinite;"></div><span style="color:#5b21b6;font-weight:600;font-size:15px;">🧠 Analizando con IA (Claude + Groq + Gemini)...</span></div>';
      }
      
      // Llamar a Multi-IA con los resultados del PDF
      fetch('/api/ai/multi-ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          searchResults: {
            c2mGuideResults: data.results,
            confluenceResults: [],
            excelResults: []
          }
        })
      })
      .then(response => response.json())
      .then(aiData => {
        const searchingEl = document.getElementById('searching-msg');
        if(searchingEl) searchingEl.remove();
        
        if(aiData.success && aiData.conversationalResponse){
          // Mostrar respuesta de IA
          const aiResponseDiv = document.createElement('div');
          aiResponseDiv.style.cssText = 'margin:15px 0;padding:16px;background:linear-gradient(135deg, #667eea15 0%, #764ba215 100%);border-left:4px solid #667eea;border-radius:8px;';
          
          const aiLabel = document.createElement('div');
          aiLabel.style.cssText = 'font-weight:700;color:#667eea;margin-bottom:8px;font-size:14px;display:flex;align-items:center;gap:8px;';
          const aisUsed = aiData.multiAI?.aisUsed || ['claude'];
          aiLabel.innerHTML = `🤖 AI-Assisted (${aisUsed.join(' + ').toUpperCase()})`;
          aiResponseDiv.appendChild(aiLabel);
          
          const aiText = document.createElement('div');
          aiText.style.cssText = 'font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap;';
          aiText.textContent = aiData.conversationalResponse;
          aiResponseDiv.appendChild(aiText);
          
          messagesEl.appendChild(aiResponseDiv);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          
          // Botón para ver fuentes (PDF)
          const detailsBtn = document.createElement('button');
          detailsBtn.textContent = '📄 Ver en documentación de Oracle';
          detailsBtn.style.cssText = 'margin:10px 0;padding:8px 16px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;';
          detailsBtn.onclick = () => {
            detailsBtn.remove();
            // Mostrar extractos del PDF
            appendMessage('bot', `📚 <strong>Encontrado en Oracle C2M User Guide:</strong>`);
            data.results.forEach((result, i) => {
              const resultDiv = document.createElement('div');
              resultDiv.style.cssText = 'margin:10px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;';
              
              const pageDiv = document.createElement('div');
              pageDiv.style.cssText = 'font-weight:600;color:#92400e;font-size:13px;margin-bottom:6px;';
              pageDiv.textContent = `📄 Página ${result.pageNum}`;
              resultDiv.appendChild(pageDiv);
              
              const textDiv = document.createElement('div');
              textDiv.style.cssText = 'padding:8px;background:#fffbeb;border-radius:4px;font-size:13px;line-height:1.6;color:#451a03;';
              textDiv.textContent = result.excerpt;
              resultDiv.appendChild(textDiv);
              
              messagesEl.appendChild(resultDiv);
            });
            messagesEl.scrollTop = messagesEl.scrollHeight;
          };
          messagesEl.appendChild(detailsBtn);
          messagesEl.scrollTop = messagesEl.scrollHeight;
        } else {
          appendMessage('bot', '⚠️ La IA no está disponible temporalmente.');
        }
        
        askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
      })
      .catch(error => {
        console.error('❌ Error en Multi-IA:', error);
        const searchingEl = document.getElementById('searching-msg');
        if(searchingEl) searchingEl.remove();
        appendMessage('bot', 'Hubo un error al procesar tu consulta.');
      });
    })
    .catch(err => {
      console.error('❌ Error buscando en C2M Guide:', err);
      const searchingEl = document.getElementById('searching-msg');
      if(searchingEl) searchingEl.remove();
      appendMessage('bot', 'Hubo un error al buscar en la documentación.');
    });
    
    return; // No continuar con búsqueda en Confluence
  }
  
  // Si NO es pregunta de definición, buscar en Confluence/Excel (casos históricos)
  const params = new URLSearchParams();
  if(query) params.append('q', query);
  if(sistema) params.append('sistema', sistema);
  
  console.log('Buscando en Confluence y Excel con:', query, 'sistema:', sistema);
  
  // Buscar en AMBOS lugares simultáneamente
  const confluencePromise = fetch('/api/confluence/faq-search?' + params.toString())
    .then(r => r.json())
    .catch(err => {
      console.error('Error en Confluence:', err);
      return { error: true, results: [] };
    });
  
  const excelPromise = searchInExcelKnowledgeBasePromise(query, sistema);
  
  // Esperar ambas búsquedas
  Promise.all([confluencePromise, excelPromise])
    .then(([confluenceData, excelResults]) => {
      console.log('Resultados Confluence:', confluenceData);
      console.log('Resultados Excel:', excelResults);
      
      const faqResults = confluenceData.results || [];
      const hasConfluenceResults = !confluenceData.error && faqResults.length > 0;
      const hasExcelResults = excelResults && excelResults.length > 0;
      
      // Si no hay resultados en ninguno
      if(!hasConfluenceResults && !hasExcelResults){
        // Guardar pregunta sin respuesta
        fetch('/api/confluence/save-pending-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, sistema: sistema })
        }).catch(err => console.error('Error guardando pregunta:', err));
        
        appendMessage('bot', 'No encontré información relacionada en ninguna de nuestras bases de conocimiento. 😕');
        appendMessage('bot', '¿Deseas crear un ticket para que un especialista revise tu consulta?');
        
        showOptions([
          { label: '✅ Crear ticket', value: 'ticket' },
          { label: '❌ No, gracias', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'ticket'){
            appendMessage('user', 'Crear ticket');
            hideOptions();
            if(sistema) reportState.sistema = sistema;
            startSmartTicketCreation();
          }else{
            appendMessage('user', 'No, gracias');
            hideOptions();
            appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
          }
        });
        return;
      }
      
      // 🤖 USAR IA PARA GENERAR RESPUESTA INTELIGENTE
      console.log('🤖 Usando Multi-IA para generar respuesta...');
      
      // Actualizar el mensaje de búsqueda para mostrar que está analizando
      const searchingEl = document.getElementById('searching-msg');
      if(searchingEl){
        searchingEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><div class="spinner" style="border:3px solid #f3f4f6;border-top:3px solid #667eea;border-radius:50%;width:22px;height:22px;animation:spin 1s linear infinite;"></div><span style="color:#5b21b6;font-weight:600;font-size:15px;">🧠 Analizando con IA (Claude + Groq + Gemini)...</span></div>';
      }
      
      // Llamar a Multi-IA
      fetch('/api/ai/multi-ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          searchResults: {
            confluenceResults: faqResults,
            excelResults: excelResults || []
          }
        })
      })
      .then(response => response.json())
      .then(data => {
        // Remover mensaje de búsqueda/pensando
        const searchingEl = document.getElementById('searching-msg');
        if(searchingEl) searchingEl.remove();
        
        if(data.success && data.conversationalResponse){
          // Mostrar respuesta de IA
          const aiResponseDiv = document.createElement('div');
          aiResponseDiv.style.cssText = 'margin:15px 0;padding:16px;background:linear-gradient(135deg, #667eea15 0%, #764ba215 100%);border-left:4px solid #667eea;border-radius:8px;';
          
          const aiLabel = document.createElement('div');
          aiLabel.style.cssText = 'font-weight:700;color:#667eea;margin-bottom:8px;font-size:14px;display:flex;align-items:center;gap:8px;';
          const aisUsed = data.multiAI?.aisUsed || ['claude'];
          aiLabel.innerHTML = `🤖 AI-Assisted (${aisUsed.join(' + ').toUpperCase()})`;
          aiResponseDiv.appendChild(aiLabel);
          
          const aiText = document.createElement('div');
          aiText.style.cssText = 'font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap;';
          aiText.textContent = data.conversationalResponse;
          aiResponseDiv.appendChild(aiText);
          
          messagesEl.appendChild(aiResponseDiv);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          
          // Mostrar detalles de fuentes si hay
          if(data.hasDetails && (hasConfluenceResults || hasExcelResults)){
            const detailsBtn = document.createElement('button');
            detailsBtn.textContent = '📚 Ver fuentes consultadas';
            detailsBtn.style.cssText = 'margin:10px 0;padding:8px 16px;background:#667eea;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;';
            detailsBtn.onclick = () => {
              detailsBtn.remove();
              showSourceDetails(faqResults, excelResults);
            };
            messagesEl.appendChild(detailsBtn);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        } else {
          // Si IA falla, mostrar resultados originales
          console.log('⚠️ IA no disponible, mostrando resultados directos');
          showSourceDetails(faqResults, excelResults);
        }
        
        // Preguntar si fue útil
        askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
      })
      .catch(error => {
        console.error('❌ Error al llamar a Multi-IA:', error);
        const searchingEl = document.getElementById('searching-msg');
        if(searchingEl) searchingEl.remove();
        
        // Si IA falla, mostrar resultados directos
        appendMessage('bot', '⚠️ La IA no está disponible temporalmente. Aquí están los resultados:');
        showSourceDetails(faqResults, excelResults);
        
        // Preguntar si fue útil
        askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
      });
      
    })
    .catch(err => {
      console.error('Error general en búsqueda:', err);
      console.error('Stack trace:', err.stack);
      appendMessage('bot', 'Hubo un error al realizar la búsqueda. Por favor, intenta de nuevo.');
    });
}

// Función para mostrar los detalles de las fuentes
function showSourceDetails(faqResults, excelResults){
  const hasConfluenceResults = faqResults && faqResults.length > 0;
  const hasExcelResults = excelResults && excelResults.length > 0;
  
  // Mostrar resultados de Confluence
  if(hasConfluenceResults){
    appendMessage('bot', `📚 <strong>Fuentes en Confluence (${faqResults.length}):</strong>`);
    
    faqResults.slice(0, 3).forEach((faq, i)=>{
          const faqDiv = document.createElement('div');
          faqDiv.style.cssText = 'margin:10px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;';
          
          const preguntaDiv = document.createElement('div');
          preguntaDiv.style.cssText = 'font-weight:600;color:#92400e;font-size:15px;margin-bottom:6px;';
          preguntaDiv.textContent = '❓ ' + faq.pregunta;
          faqDiv.appendChild(preguntaDiv);
          
          const appDiv = document.createElement('div');
          appDiv.style.cssText = 'font-size:12px;color:#78350f;margin-bottom:8px;font-style:italic;';
          appDiv.textContent = '📱 Aplicación: ' + faq.aplicacion;
          faqDiv.appendChild(appDiv);
          
          // Mostrar columnas adicionales si existen
          const metadataDiv = document.createElement('div');
          metadataDiv.style.cssText = 'font-size:12px;color:#78350f;margin-bottom:8px;display:flex;flex-wrap:wrap;gap:12px;';
          
          if(faq.numeroCaso){
            const casoSpan = document.createElement('span');
            casoSpan.style.cssText = 'background:#fef3c7;padding:4px 8px;border-radius:4px;';
            casoSpan.textContent = '🔢 NO. Caso: ' + faq.numeroCaso;
            metadataDiv.appendChild(casoSpan);
          }
          
          if(faq.especialista){
            const especialistaSpan = document.createElement('span');
            especialistaSpan.style.cssText = 'background:#fef3c7;padding:4px 8px;border-radius:4px;';
            especialistaSpan.textContent = '👤 Especialista: ' + faq.especialista;
            metadataDiv.appendChild(especialistaSpan);
          }
          
          if(faq.fechaCreacion){
            const fechaSpan = document.createElement('span');
            fechaSpan.style.cssText = 'background:#fef3c7;padding:4px 8px;border-radius:4px;';
            fechaSpan.textContent = '📅 Fecha de Creación: ' + faq.fechaCreacion;
            metadataDiv.appendChild(fechaSpan);
          }
          
          if(faq.funcionalidad){
            const funcSpan = document.createElement('span');
            funcSpan.style.cssText = 'background:#dbeafe;padding:4px 8px;border-radius:4px;color:#1e40af;font-weight:500;';
            funcSpan.textContent = '⚙️ Funcionalidad/Proceso: ' + faq.funcionalidad;
            metadataDiv.appendChild(funcSpan);
          }
          
          if(metadataDiv.children.length > 0){
            faqDiv.appendChild(metadataDiv);
          }
          
          const respuestaDiv = document.createElement('div');
          respuestaDiv.style.cssText = 'padding:10px;background:#fffbeb;border-radius:4px;border:1px solid #fde68a;font-size:14px;line-height:1.6;color:#451a03;white-space:pre-wrap;';
          
          // Función para formatear SQL agregando saltos de línea y organización
          function formatSQLText(text) {
            let formatted = text;
            
            // 1. Agregar saltos de línea antes de palabras clave principales
            const mainKeywords = ['SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION', 'INSERT', 'UPDATE', 'DELETE'];
            mainKeywords.forEach(keyword => {
              const regex = new RegExp(`([^\\n])(${keyword})`, 'gi');
              formatted = formatted.replace(regex, '$1\n$2');
            });
            
            // 2. Formatear JOINs en líneas separadas con indentación
            ['LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'JOIN'].forEach(join => {
              const regex = new RegExp(`([^\\n])(${join})`, 'gi');
              formatted = formatted.replace(regex, '$1\n  $2');
            });
            
            // 3. Formatear AND/OR con indentación
            formatted = formatted.replace(/([^\n])(AND\s+)/gi, '$1\n  $2');
            formatted = formatted.replace(/([^\n])(OR\s+)/gi, '$1\n  $2');
            
            // 4. Comentarios SQL en líneas separadas
            formatted = formatted.replace(/([^\n])(--)/g, '$1\n$2');
            
            // 5. Separar columnas en SELECT si hay comas (limitar a los primeros campos)
            formatted = formatted.replace(/SELECT\s+(.+?)(?=FROM)/gi, (match, cols) => {
              // Solo separar si hay múltiples columnas
              if (cols.includes(',')) {
                const columns = cols.split(',').map((col, idx) => {
                  const trimmed = col.trim();
                  return idx === 0 ? trimmed : `  ${trimmed}`;
                }).join(',\n');
                return `SELECT\n  ${columns}\n`;
              }
              return match;
            });
            
            // 6. Limpiar múltiples saltos de línea consecutivos
            formatted = formatted.replace(/\n{3,}/g, '\n\n');
            
            return formatted;
          }
          
          // Función para procesar enlaces en el texto
          function processLinksInText(text) {
            // Formatear SQL si contiene palabras clave
            const hasSQL = text.match(/SELECT|FROM|WHERE|JOIN/i);
            if (hasSQL) {
              text = formatSQLText(text);
            }
            
            const container = document.createElement('span');
            container.style.whiteSpace = 'pre-wrap'; // Preservar saltos de línea
            
            // Si tiene SQL, aplicar estilos de código
            if (hasSQL) {
              container.style.backgroundColor = '#f8f8f8';
              container.style.padding = '12px';
              container.style.borderRadius = '6px';
              container.style.border = '1px solid #e0e0e0';
              container.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace';
              container.style.fontSize = '13px';
              container.style.display = 'block';
              container.style.marginTop = '8px';
              container.style.overflowX = 'auto';
            }
            
            // Primero detectar URLs completas (SharePoint, Confluence, etc.) - PRIORIDAD
            const urlPattern = /(https?:\/\/[^\s<>"]+)/gi;
            const urlMatches = [];
            let match;
            while((match = urlPattern.exec(text)) !== null) {
              urlMatches.push({
                text: match[0],
                index: match.index,
                length: match[0].length,
                isUrl: true
              });
            }
            
            // Solo detectar nombres de archivo si hay un Confluence URL válido
            const fileMatches = [];
            if(faq.confluenceUrl && faq.confluenceUrl.match(/pageId=(\d+)/)) {
              // Patrón para archivos con extensión (permite espacios en el nombre)
              const filePattern = /([a-zA-Z0-9_\-\s]+\.(mp4|webm|avi|mov|mkv|flv|wmv|m4v|docx?|xlsx?|pptx?|pdf|sql|sh|bat|ps1|py|js|json|xml|csv|txt))/gi;
              while((match = filePattern.exec(text)) !== null) {
                // No agregar si ya está dentro de una URL detectada
                const isPartOfUrl = urlMatches.some(urlMatch => 
                  match.index >= urlMatch.index && match.index < (urlMatch.index + urlMatch.length)
                );
                if(!isPartOfUrl) {
                  fileMatches.push({
                    text: match[0],
                    index: match.index,
                    length: match[0].length,
                    isUrl: false
                  });
                }
              }
            }
            
            // Combinar y ordenar por índice
            const allMatches = [...urlMatches, ...fileMatches].sort((a, b) => a.index - b.index);
            
            if(allMatches.length === 0) {
              // No hay enlaces, retornar texto normal
              container.textContent = '✅ ' + text;
              return container;
            }
            
            // Procesar el texto con los enlaces encontrados
            let lastIndex = 0;
            container.textContent = '✅ ';
            
            allMatches.forEach((match, idx) => {
              // Agregar texto antes del enlace
              if(match.index > lastIndex) {
                container.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
              }
              
              // Crear el enlace
              const link = document.createElement('a');
              link.target = '_blank';
              link.style.cssText = 'color:#0284c7;text-decoration:underline;font-weight:600;margin:0 2px;';
              
              const fileName = match.text;
              const lowerFileName = fileName.toLowerCase();
              
              if(match.isUrl) {
                // Es una URL completa (prioridad máxima)
                link.href = fileName;
                
                // Determinar icono según la URL
                let icon = '🔗';
                let displayName = fileName;
                
                if(lowerFileName.includes('sharepoint.com')) {
                  icon = '📄';
                  displayName = 'Documento SharePoint';
                  
                  // Detectar tipo específico de archivo en SharePoint
                  if(lowerFileName.match(/\.docx?$/i)) {
                    icon = '📝';
                    displayName = 'Documento Word';
                  } else if(lowerFileName.match(/\.xlsx?$/i)) {
                    icon = '📊';
                    displayName = 'Hoja de cálculo Excel';
                  } else if(lowerFileName.match(/\.pptx?$/i)) {
                    icon = '📊';
                    displayName = 'Presentación PowerPoint';
                  } else if(lowerFileName.match(/\.pdf$/i)) {
                    icon = '📕';
                    displayName = 'Documento PDF';
                  } else if(lowerFileName.match(/\.sql$/i)) {
                    icon = '🗄️';
                    displayName = 'Script SQL';
                  } else if(lowerFileName.match(/\.(sh|bat|ps1)$/i)) {
                    icon = '⚙️';
                    displayName = 'Script';
                  } else if(lowerFileName.match(/\.(py|js|json|xml)$/i)) {
                    icon = '📜';
                    displayName = 'Código';
                  } else if(lowerFileName.match(/\.(csv|txt)$/i)) {
                    icon = '📋';
                    displayName = 'Archivo de texto';
                  }
                  
                  // Mostrar nombre amigable para SharePoint
                  link.textContent = icon + ' ' + displayName;
                } else if(lowerFileName.includes('atlassian.net')) {
                  icon = '📄';
                  link.textContent = icon + ' ' + 'Página Confluence';
                } else if(lowerFileName.match(/\.(jpg|jpeg|png|gif|bmp|svg)$/i)) {
                  icon = '🖼️';
                  link.textContent = icon + ' ' + (fileName.length > 60 ? fileName.substring(0, 57) + '...' : fileName);
                } else if(lowerFileName.match(/\.(mp4|webm|avi|mov|mkv)$/i)) {
                  icon = '🎥';
                  link.textContent = icon + ' ' + (fileName.length > 60 ? fileName.substring(0, 57) + '...' : fileName);
                } else {
                  link.textContent = icon + ' ' + (fileName.length > 60 ? fileName.substring(0, 57) + '...' : fileName);
                }
                link.title = 'Click para abrir: ' + fileName;
              } else {
                // Es un nombre de archivo (solo si hay Confluence URL)
                const pageId = faq.confluenceUrl.match(/pageId=(\d+)/)[1];
                link.href = `https://redclay.atlassian.net/wiki/download/attachments/${pageId}/${encodeURIComponent(fileName)}`;
                
                // Determinar icono según tipo de archivo
                let icon = '📄';
                if(lowerFileName.match(/\.(mp4|webm|avi|mov|mkv)$/i)) icon = '🎥';
                else if(lowerFileName.match(/\.docx?$/i)) icon = '📝';
                else if(lowerFileName.match(/\.xlsx?$/i)) icon = '📊';
                else if(lowerFileName.match(/\.pptx?$/i)) icon = '📊';
                else if(lowerFileName.match(/\.pdf$/i)) icon = '📕';
                else if(lowerFileName.match(/\.sql$/i)) icon = '🗄️';
                else if(lowerFileName.match(/\.(sh|bat|ps1)$/i)) icon = '⚙️';
                else if(lowerFileName.match(/\.(py|js|json|xml)$/i)) icon = '📜';
                else if(lowerFileName.match(/\.(csv|txt)$/i)) icon = '📋';
                
                link.textContent = icon + ' ' + fileName;
                link.title = 'Click para descargar el archivo';
              }
              
              container.appendChild(link);
              lastIndex = match.index + match.length;
            });
            
            // Agregar texto restante después del último enlace
            if(lastIndex < text.length) {
              container.appendChild(document.createTextNode(text.substring(lastIndex)));
            }
            
            return container;
          }
          
          // Procesar la respuesta con enlaces
          respuestaDiv.appendChild(processLinksInText(faq.respuesta));
          
          faqDiv.appendChild(respuestaDiv);
          
          // Agregar enlace a Confluence
          if(faq.confluenceUrl){
            const linkDiv = document.createElement('div');
            linkDiv.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px solid #fde68a;';
            const link = document.createElement('a');
            link.href = faq.confluenceUrl;
            link.target = '_blank';
            link.textContent = '🔗 Ver en Confluence';
            link.style.cssText = 'color:#d97706;text-decoration:none;font-weight:500;font-size:13px;';
            link.onmouseover = () => link.style.textDecoration = 'underline';
            link.onmouseout = () => link.style.textDecoration = 'none';
            linkDiv.appendChild(link);
            faqDiv.appendChild(linkDiv);
          }
          
          messagesEl.appendChild(faqDiv);
        });
        
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
      
      // Mostrar resultados de Excel
      if(hasExcelResults){
        appendMessage('bot', `📊 <strong>Casos Históricos en Excel (${excelResults.length}):</strong>`);
        
        excelResults.slice(0, 3).forEach((caso, i)=>{
          const casoDiv = document.createElement('div');
          casoDiv.style.cssText = 'margin:10px 0;padding:12px;background:#dbeafe;border-left:4px solid #3b82f6;border-radius:4px;';
          
          const asuntoDiv = document.createElement('div');
          asuntoDiv.style.cssText = 'font-weight:600;color:#1e3a8a;font-size:15px;margin-bottom:6px;';
          asuntoDiv.textContent = '📋 ' + caso.asunto;
          casoDiv.appendChild(asuntoDiv);
          
          if(caso.aplicacion){
            const appDiv = document.createElement('div');
            appDiv.style.cssText = 'font-size:12px;color:#1e40af;margin-bottom:8px;font-style:italic;';
            appDiv.textContent = '📱 Aplicación: ' + caso.aplicacion;
            casoDiv.appendChild(appDiv);
          }
          
          const solucionDiv = document.createElement('div');
          solucionDiv.style.cssText = 'padding:10px;background:#eff6ff;border-radius:4px;border:1px solid #bfdbfe;font-size:14px;line-height:1.6;color:#1e3a8a;';
          solucionDiv.textContent = '✅ ' + caso.solucion;
          casoDiv.appendChild(solucionDiv);
          
          messagesEl.appendChild(casoDiv);
        });
        
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

// Función auxiliar que retorna una Promise con resultados de Excel
async function searchInExcelKnowledgeBasePromise(query, sistema){
  try {
    const listResponse = await fetch('/api/data/list-files');
    const listData = await listResponse.json();
    
    if(!listData.success || !listData.files || listData.files.length === 0){
      return null;
    }
    
    const fileName = typeof listData.files[0] === 'string' ? listData.files[0] : listData.files[0].name;
    
    const dataResponse = await fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`);
    const dataResult = await dataResponse.json();
    
    if(!dataResult.success || !dataResult.allData || dataResult.allData.length === 0){
      return null;
    }
    
    const allData = dataResult.allData;
    const headers = Object.keys(allData[0]);
    
    // Buscar columnas relevantes
    const asuntoCol = headers.find(h => /asunto|subject|titulo|descripci[oó]n|description/i.test(h));
    const solucionCol = headers.find(h => /soluci[oó]n|causa|resoluci[oó]n|resolution/i.test(h));
    const aplicacionCol = headers.find(h => /aplicaci[oó]n|app|sistema|system/i.test(h));
    
    if(!asuntoCol || !solucionCol){
      return null;
    }
    
    // Filtrar por sistema/aplicación si se especifica
    let filteredData = allData;
    if(sistema && aplicacionCol){
      filteredData = allData.filter(row => {
        const appValue = row[aplicacionCol];
        if(!appValue) return false;
        return normalizeText(appValue).includes(normalizeText(sistema));
      });
    }
    
    // Normalizar query y buscar coincidencias
    const normalizedQuery = normalizeText(query);
    const keywords = normalizedQuery.split(/\s+/).filter(w => w.length > 3);
    
    const matches = filteredData.filter(row => {
      const asunto = normalizeText(row[asuntoCol] || '');
      return keywords.some(keyword => asunto.includes(keyword));
    }).slice(0, 5); // Máximo 5 resultados
    
    return matches.map(row => ({
      asunto: row[asuntoCol],
      solucion: row[solucionCol],
      aplicacion: aplicacionCol ? row[aplicacionCol] : null
    }));
    
  } catch(err){
    console.error('Error en búsqueda Excel:', err);
    return null;
  }
}

function goBack(){
  if(stateHistory.length === 0) return;
  
  const previousState = stateHistory.pop();
  reportState = previousState.reportState;
  
  hideOptions();
  appendMessage('bot', 'Volviendo al paso anterior...');
  
  // Ejecutar la acción para restaurar el estado anterior
  if(previousState.action){
    setTimeout(()=>{
      previousState.action();
    }, 300);
  }
}

function handleAdvisoryRequest(){
  stateHistory = []; // Limpiar historial
  reportState = { step: 'asesoria_sistema', sistema: null, modulo: null };
  appendMessage('bot', '¡Perfecto! Me encantaría asesorarte. 📚 ¿Sobre qué sistema necesitas asesoría?');
  appendMessage('bot', '<em>Puedes seleccionar una opción o escribir el nombre del sistema:</em>');
  
  showOptions([
    { label: 'C2M', value: 'C2M' },
    { label: 'FIELD', value: 'FIELD' },
    { label: 'SALES', value: 'SALES' },
    { label: 'SERVICE', value: 'SERVICE' }
  ], (sistema)=>{
    reportState.sistema = sistema;
    appendMessage('user', sistema);
    waitingForAdvisorySystem = false;
    askForAdvisoryTopic(sistema);
  }, false);
  
  // Activar modo de espera para detectar texto escrito
  waitingForAdvisorySystem = true;
}

function askForAdvisoryTopic(sistema){
  hideOptions();
  appendMessage('bot', `Excelente elección. ¿Sobre qué aspecto de ${sistema} te gustaría recibir asesoría? Por ejemplo:\n• Funcionalidades específicas\n• Procesos o flujos de trabajo\n• Configuraciones\n• Mejores prácticas\n• Reportes\n\nEscribe el tema que te interesa:`);
  
  // Crear input para el tema de asesoría
  const inputDiv = document.createElement('div');
  inputDiv.className = 'advisory-input-container';
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const textarea = document.createElement('textarea');
  textarea.placeholder = `Ej: Cómo crear órdenes de trabajo, configurar tarifas, etc...`;
  textarea.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  textarea.rows = 2;
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Buscar información';
  submitBtn.style.cssText = 'padding:8px 12px;background:#3b82f6;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const topic = textarea.value.trim();
    if(!topic || topic.length < 5){
      alert('Por favor, describe el tema con al menos 5 caracteres.');
      return;
    }
    const sanitized = topic.replace(/<script|<\/script|on\w+\s*=/gi, '');
    appendMessage('user', 'Tema: ' + sanitized);
    messagesEl.parentElement.removeChild(inputDiv);
    searchAdvisoryInKnowledgeBase(sistema, sanitized);
  });
  
  inputDiv.appendChild(textarea);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  textarea.focus();
}

function searchAdvisoryInKnowledgeBase(sistema, topic){
  const searchQuery = `${sistema} ${topic}`;
  
  appendMessage('bot', `🔍 Buscando información sobre "${topic}" en ${sistema}...`);
  
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchQuery))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No pude conectar con la base de conocimiento. ¿Te gustaría que un especialista te contacte para asesorarte?');
        showOptions([
          { label: '✅ Sí, contactar especialista', value: 'yes' },
          { label: '🔄 Intentar otro tema', value: 'retry' },
          { label: '❌ Cancelar', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, contactar especialista');
            hideOptions();
            askForUserDetailsForAdvisory(sistema, topic);
          }else if(choice === 'retry'){
            appendMessage('user', 'Intentar otro tema');
            hideOptions();
            askForAdvisoryTopic(sistema);
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Entendido. Si cambias de opinión, aquí estaré para ayudarte. 😊');
          }
        });
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        appendMessage('bot', `No encontré documentación específica sobre "${topic}" en ${sistema}. ¿Qué te gustaría hacer?`);
        showOptions([
          { label: '📧 Contactar especialista', value: 'contact' },
          { label: '🔄 Buscar otro tema', value: 'retry' },
          { label: '📋 Crear ticket de consulta', value: 'ticket' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'contact'){
            appendMessage('user', 'Contactar especialista');
            hideOptions();
            askForUserDetailsForAdvisory(sistema, topic);
          }else if(choice === 'retry'){
            appendMessage('user', 'Buscar otro tema');
            hideOptions();
            askForAdvisoryTopic(sistema);
          }else if(choice === 'ticket'){
            appendMessage('user', 'Crear ticket de consulta');
            hideOptions();
            reportState.sistema = sistema;
            startSmartTicketCreation();
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Sin problema. Si necesitas asesoría más tarde, no dudes en contactarme. 😊');
          }
        });
        return;
      }
      
      // Mostrar resultados de asesoría
      appendMessage('bot', `📚 Encontré ${results.length} ${results.length === 1 ? 'recurso' : 'recursos'} sobre "${topic}" en ${sistema}:`);
      
      results.forEach((result, i)=>{
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:12px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#1e40af;text-decoration:underline;font-weight:600;font-size:15px;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        const contentDiv = document.createElement('div');
        contentDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #dbeafe;font-size:14px;line-height:1.6;';
        contentDiv.textContent = result.solucion;
        contentDiv.style.color = '#1e3a8a';
        resultDiv.appendChild(contentDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si la información fue útil
      appendMessage('bot', '¿Esta información te fue útil? ¿Necesitas algo más?');
      showOptions([
        { label: '✅ Sí, muy útil', value: 'useful' },
        { label: '🔍 Buscar otro tema', value: 'another' },
        { label: '📧 Contactar especialista', value: 'contact' }
        // { label: '❌ Finalizar', value: 'finish' }
      ], (choice)=>{
        if(choice === 'useful'){
          appendMessage('user', '¡Sí, muy útil!');
          appendMessage('bot', '¡Excelente! 🎉 Me alegra haber podido ayudarte con la asesoría sobre ${sistema}. Si tienes más consultas, aquí estaré.');
          hideOptions();
          // showFinalizarButton();
        }else if(choice === 'another'){
          appendMessage('user', 'Buscar otro tema');
          hideOptions();
          appendMessage('bot', 'Perfecto. ¿Quieres buscar otro tema en ${sistema} o cambiar de sistema?');
          showOptions([
            { label: `Otro tema en ${sistema}`, value: 'same' },
            { label: 'Cambiar de sistema', value: 'change' }
          ], (choice2)=>{
            if(choice2 === 'same'){
              appendMessage('user', `Otro tema en ${sistema}`);
              hideOptions();
              askForAdvisoryTopic(sistema);
            }else{
              appendMessage('user', 'Cambiar de sistema');
              hideOptions();
              handleAdvisoryRequest();
            }
          });
        }else if(choice === 'contact'){
          appendMessage('user', 'Contactar especialista');
          hideOptions();
          askForUserDetailsForAdvisory(sistema, topic);
        }
        // else{
        //   appendMessage('user', 'Finalizar');
        //   hideOptions();
        //   appendMessage('bot', 'Gracias por usar el servicio de asesoría. ¡Hasta pronto! 😊');
        //   showFinalizarButton();
        // }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message);
      showOptions([
        { label: '🔄 Intentar de nuevo', value: 'retry' },
        { label: '📧 Contactar especialista', value: 'contact' }
      ], (choice)=>{
        if(choice === 'retry'){
          appendMessage('user', 'Intentar de nuevo');
          hideOptions();
          searchAdvisoryInKnowledgeBase(sistema, topic);
        }else{
          appendMessage('user', 'Contactar especialista');
          hideOptions();
          askForUserDetailsForAdvisory(sistema, topic);
        }
      });
    });
}

function askForUserDetailsForAdvisory(sistema, topic){
  appendMessage('bot', 'Perfecto. Un especialista te contactará para asesorarte sobre este tema. Por favor, proporciona tus datos:');
  
  const nombre = prompt('Por favor, ingresa tu nombre:');
  if(!nombre) return;
  
  const apellido = prompt('Por favor, ingresa tu apellido:');
  if(!apellido) return;
  
  const correo = prompt('Por favor, ingresa tu correo electrónico:');
  if(!correo) return;
  
  appendMessage('user', `${nombre} ${apellido} - ${correo}`);
  
  const ticketData = {
    searchQuery: `Solicitud de asesoría: ${topic}`,
    sistema: sistema,
    modulo: null,
    results: [],
    nombre: nombre,
    apellido: apellido,
    correo: correo,
    descripcion: `El usuario solicita asesoría sobre: ${topic} en el sistema ${sistema}`
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey;
      appendMessage('bot', `✅ Listo. Tu solicitud de asesoría ha sido registrada como ${data.ticketKey}. Un especialista en ${sistema} se pondrá en contacto contigo pronto.`);
      // showFinalizarButton();
    } else {
      appendMessage('bot', 'Hubo un error al crear la solicitud. Por favor, intenta nuevamente.');
    }
  })
  .catch(err => {
    appendMessage('bot', 'Hubo un error al crear la solicitud. Por favor, intenta nuevamente.');
  });
}

function handleReportIncident(){
  stateHistory = []; // Limpiar historial al iniciar nuevo reporte
  reportState = { step: 'sistema', sistema: null, modulo: null };
  appendMessage('bot', 'Selecciona el sistema donde se presentó la incidencia:');
  appendMessage('bot', '<em>Puedes seleccionar una opción o escribir el nombre del sistema:</em>');
  
  showOptions([
    { label: 'C2M', value: 'C2M' },
    { label: 'FIELD', value: 'FIELD' },
    { label: 'SALES', value: 'SALES' },
    { label: 'SERVICE', value: 'SERVICE' },
    { label: 'OTRO', value: 'OTRO' }
  ], (sistema)=>{
    reportState.sistema = sistema;
    appendMessage('user', sistema);
    waitingForIncidentSystem = false;
    hideOptions();
    
    // Todos los sistemas van directo a descripción del error
    appendMessage('bot', `Perfecto. Ahora describe el error o problema que tienes en ${sistema}:`);
    askForErrorDescription();
  }, false); // No mostrar volver en la primera pantalla
  
  // Activar modo de espera para detectar texto escrito
  waitingForIncidentSystem = true;
}

function showC2MModules(){
  // Guardar estado anterior para poder volver
  stateHistory.push({
    reportState: { step: 'sistema', sistema: null, modulo: null },
    action: handleReportIncident
  });
  
  reportState.step = 'modulo';
  appendMessage('bot', 'Selecciona el módulo dentro de C2M:');
  showOptions([
    { label: 'Actividades de campo', value: 'actividades_campo' },
    { label: 'Ventas', value: 'ventas' },
    { label: 'Facturación', value: 'facturacion' },
    { label: 'Reportes', value: 'reportes' },
    { label: 'Otro', value: 'otro' }
  ], (modulo)=>{
    reportState.modulo = modulo;
    appendMessage('user', modulo);
    
    // Guardar estado para poder volver a módulos
    stateHistory.push({
      reportState: { step: 'modulo', sistema: 'C2M', modulo: null },
      action: showC2MModules
    });
    
    if(modulo === 'actividades_campo'){
      hideOptions();
      appendMessage('bot', 'Perfecto. Ahora comparte el error que se presenta:');
      askForErrorDescription();
    }else{
      finishIncidentReport();
    }
  });
}

function finishIncidentReport(){
  hideOptions();
  const summary = 'Incidencia en ' + reportState.sistema + (reportState.modulo ? ' - Módulo: ' + reportState.modulo : '');
  appendMessage('bot', 'Gracias por reportar. Tu incidencia "' + summary + '" ha sido registrada. ¿Hay algo más?');
  reportState = { step: null, sistema: null, modulo: null };
}

function askForErrorDescription(){
  // Create a custom input container for error description
  const inputDiv = document.createElement('div');
  inputDiv.className = 'error-input-container';
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Describe el error que presentas (mínimo 10 caracteres)...';
  textarea.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  textarea.rows = 2;
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Buscar solución';
  submitBtn.style.cssText = 'padding:8px 12px;background:#10b981;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const errorText = textarea.value.trim();
    // Validation: minimum 10 characters
    if(!errorText || errorText.length < 10){
      alert('Por favor, describe el error con al menos 10 caracteres.');
      return;
    }
    // Sanitize input (remove potential script tags)
    const sanitized = errorText.replace(/<script|<\/script|on\w+\s*=/gi, '');
    appendMessage('user', 'Error: ' + sanitized);
    messagesEl.parentElement.removeChild(inputDiv);
    searchKnowledgeBase(sanitized);
  });
  
  inputDiv.appendChild(textarea);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  textarea.focus();
}

function askForUserDetailsAndCreateTicket(searchQuery, results){
  // Pedir nombre
  const nombreInput = prompt('Por favor, ingresa tu nombre:');
  if(!nombreInput) return;
  
  // Pedir apellido
  const apellidoInput = prompt('Por favor, ingresa tu apellido:');
  if(!apellidoInput) return;
  
  // Pedir correo
  const correoInput = prompt('Por favor, ingresa tu correo electrónico:');
  if(!correoInput) return;
  
  // Pedir descripción de la situación
  appendMessage('bot', 'Ahora, por favor describe la situación que presenta:');
  const descDiv = document.createElement('div');
  descDiv.style.cssText = 'margin:8px 0;padding:10px;';
  
  const descTextarea = document.createElement('textarea');
  descTextarea.placeholder = 'Describe tu situación aquí...';
  descTextarea.style.cssText = 'width:100%;height:100px;padding:8px;border:1px solid #ddd;border-radius:4px;font-family:Arial;font-size:14px;';
  
  const descSubmitBtn = document.createElement('button');
  descSubmitBtn.textContent = 'Enviar y Crear Ticket';
  descSubmitBtn.style.cssText = 'margin-top:8px;padding:8px 16px;background:#10b981;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;width:100%;';
  
  descSubmitBtn.addEventListener('click', ()=>{
    const descripcion = descTextarea.value.trim();
    if(!descripcion){
      alert('Por favor, describe la situación.');
      return;
    }
    
    appendMessage('user', `Descripción: ${descripcion}`);
    descDiv.remove();
    
    // Crear ticket con toda la información
    createSearchTicketWithUserDetails(searchQuery, results, nombreInput, apellidoInput, correoInput, descripcion);
  });
  
  descDiv.appendChild(descTextarea);
  descDiv.appendChild(descSubmitBtn);
  messagesEl.parentElement.insertBefore(descDiv, messagesEl.nextSibling);
  descTextarea.focus();
}

function createSearchTicket(searchQuery, results){
  const ticketData = {
    searchQuery: searchQuery,
    sistema: reportState.sistema || 'General',
    modulo: reportState.modulo || null,
    results: results
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey; // Guardar el código del ticket
      console.log('Ticket creado en Jira:', data.ticketKey);
    } else {
      console.error('Error creando ticket:', data.error);
    }
  })
  .catch(err => console.error('Error creating ticket:', err));
}

function createSearchTicketWithUserDetails(searchQuery, results, nombre, apellido, correo, descripcion){
  const ticketData = {
    searchQuery: searchQuery,
    sistema: reportState.sistema || 'General',
    modulo: reportState.modulo || null,
    results: results,
    nombre: nombre,
    apellido: apellido,
    correo: correo,
    descripcion: descripcion
  };
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => r.json())
  .then(data => {
    if(data.success) {
      lastJiraTicket = data.ticketKey;
      console.log('Ticket creado en Jira con datos de usuario:', data.ticketKey);
      const ticketMsg = `Listo. Tu solicitud ha sido registrada como ${data.ticketKey}. Un agente se pondrá en contacto pronto.`;
      appendMessage('bot', ticketMsg);
      // showFinalizarButton();
    } else {
      console.error('Error creando ticket:', data.error);
      appendMessage('bot', 'Hubo un error al crear el ticket. Por favor, intenta nuevamente.');
    }
  })
  .catch(err => {
    console.error('Error creating ticket:', err);
    appendMessage('bot', 'Hubo un error al crear el ticket. Por favor, intenta nuevamente.');
  });
}

// ========== NUEVO FLUJO INTELIGENTE DE CREACIÓN DE TICKETS ==========
let smartTicketState = {
  step: null,  // 'description', 'searching', 'user_data', 'creating'
  description: null,
  nombre: null,
  apellido: null,
  correo: null,
  foundSolutions: []
};

function startSmartTicketCreation(){
  smartTicketState = { step: 'description', description: null, nombre: null, apellido: null, correo: null, foundSolutions: [] };
  
  appendMessage('bot', '✅ <strong>Perfecto, vamos a crear tu ticket.</strong>');
  appendMessage('bot', '📝 <strong>¿Qué problema o consulta quieres reportar?</strong>');
  appendMessage('bot', '<em>Descríbelo con el mayor detalle posible (mínimo 15 caracteres)...</em>');
  
  // Crear textarea para la descripción
  const inputDiv = document.createElement('div');
  inputDiv.className = 'smart-ticket-input';
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;';
  
  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Ejemplo: "No puedo crear una orden en C2M, me sale error 500..."';
  textarea.style.cssText = 'width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:14px;min-height:80px;resize:vertical;';
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = '🔍 Continuar';
  submitBtn.style.cssText = 'margin-top:8px;padding:10px 20px;background:#10b981;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;width:100%;';
  
  submitBtn.addEventListener('click', ()=>{
    const description = textarea.value.trim();
    
    if(!description || description.length < 15){
      alert('⚠️ Por favor, describe tu problema con al menos 15 caracteres.');
      return;
    }
    
    smartTicketState.description = description;
    appendMessage('user', description);
    messagesEl.parentElement.removeChild(inputDiv);
    
    // Buscar soluciones sugeridas antes de continuar
    searchSuggestedSolutions(description);
  });
  
  inputDiv.appendChild(textarea);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.appendChild(inputDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  textarea.focus();
}

function searchSuggestedSolutions(description){
  smartTicketState.step = 'searching';
  appendMessage('bot', '🔍 <strong>Espera, déjame buscar si tengo una solución sugerida para tu caso...</strong>');
  
  // Buscar en Confluence, base de conocimiento Y Excel
  Promise.all([
    fetch('/api/confluence/search-faq?q=' + encodeURIComponent(description)).then(r => r.json()).catch(() => ({results: []})),
    fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(description)).then(r => r.json()).catch(() => ({results: []})),
    searchInExcelKnowledgeBasePromise(description).catch(() => [])
  ])
  .then(([faqData, knowledgeData, excelResults]) => {
    // Mapear resultados de Confluence FAQs
    const faqResults = (faqData.results || []).map(r => ({
      question: r.question || r.title || 'Sin título',
      answer: r.answer || r.excerpt || 'Sin respuesta',
      caseNumber: r.caseNumber || r.numero || null,
      date: r.date || r.createDate || r.fecha || null,
      specialist: r.specialist || r.especialista || r.assignedTo || null,
      url: r.url || r.link || null  // Añadir URL de Confluence
    }));
    
    // Mapear resultados de Confluence Knowledge
    const knowledgeResults = (knowledgeData.results || []).map(r => ({
      question: r.question || r.title || 'Sin título',
      answer: r.answer || r.excerpt || 'Sin respuesta',
      caseNumber: r.caseNumber || r.numero || null,
      date: r.date || r.createDate || r.fecha || null,
      specialist: r.specialist || r.especialista || r.assignedTo || null,
      url: r.url || r.link || null  // Añadir URL de Confluence
    }));
    
    // Mapear resultados de Excel
    const excelResultsFormatted = excelResults.map((r, index) => {
      console.log(`📊 Excel resultado ${index}:`, r);
      console.log(`📊 Columnas detectadas:`, Object.keys(r));
      
      const solucionText = r.solution || r.solucion || r.Solución || '';
      
      // Extraer número de caso del texto de la solución
      const caseMatch = solucionText.match(/caso\s+No\.\s*(\d+)/i);
      const caseNumber = caseMatch ? caseMatch[1] : null;
      
      // Extraer nombre del especialista del texto (después de "Atentamente,")
      const specialistMatch = solucionText.match(/Atentamente,?\s*([^\r\n]+?)(?:\s*Soporte|\s*$)/i);
      const specialist = specialistMatch ? specialistMatch[1].trim() : null;
      
      console.log(`🔍 Extraído: caso=${caseNumber}, especialista=${specialist}`);
      
      return {
        question: r.title || r.asunto || r.Asunto || 'Caso relacionado',
        answer: solucionText || r.excerpt || 'Ver caso completo',
        caseNumber: caseNumber,
        date: null,  // No hay fecha en el Excel
        specialist: specialist
      };
    });
    
    console.log('📊 Excel formateado:', excelResultsFormatted);
    
    const allResults = [...faqResults, ...knowledgeResults, ...excelResultsFormatted];
    
    console.log('🔍 Resultados búsqueda:', { faqResults: faqResults.length, knowledgeResults: knowledgeResults.length, excelResults: excelResultsFormatted.length, total: allResults.length });
    
    smartTicketState.foundSolutions = allResults;
    
    if(allResults.length > 0){
      // Encontró soluciones - mostrarlas
      appendMessage('bot', `✨ <strong>¡Encontré ${allResults.length} posible${allResults.length > 1 ? 's' : ''} solución${allResults.length > 1 ? 'es' : ''} que podrían ayudarte!</strong>`);
      
      allResults.slice(0, 3).forEach((result, index) => {
        const title = result.question || result.title || 'Sin título';
        const answer = result.answer || result.excerpt || 'Sin respuesta disponible';
        const caseNumber = result.caseNumber || null;
        let date = result.date || null;
        const specialist = result.specialist || null;
        const confluenceUrl = result.url || result.link || null; // URL de Confluence si está disponible
        
        console.log(`📋 Solución ${index + 1} - Raw data:`, {
          caseNumber: result.caseNumber,
          date: result.date,
          specialist: result.specialist,
          url: result.url,
          fullResult: result
        });
        
        // Si la fecha es un número (Excel serial date), convertirla
        if(date && typeof date === 'number'){
          const jsDate = excelDateToJSDate(date);
          date = jsDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }else if(date && typeof date === 'string' && date.includes('T')){
          // Si es ISO date string, formatear
          const jsDate = new Date(date);
          date = jsDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
        
        console.log(`📋 Metadata procesada:`, { caseNumber, date, specialist, url: confluenceUrl });
        
        // Construir título con enlace si está disponible
        let titleHtml = '';
        if(confluenceUrl){
          titleHtml = `<a href="${confluenceUrl}" target="_blank" style="color: #78350f; text-decoration: underline;">${title}</a>`;
        }else{
          titleHtml = `<span style="color: #78350f;">${title}</span>`;
        }
        
        // Construir metadatos (número de caso, fecha, especialista)
        let metadataHtml = '';
        if(caseNumber || date || specialist || confluenceUrl){
          metadataHtml = '<div style="margin-top: 10px; padding: 8px; background: #e0f2fe; border-left: 3px solid #0284c7; border-radius: 4px; font-size: 12px; color: #0c4a6e;">';
          if(caseNumber){
            metadataHtml += `<strong>📌 Caso:</strong> #${caseNumber} `;
          }
          if(date){
            metadataHtml += `<strong>📅 Fecha:</strong> ${date} `;
          }
          if(specialist){
            metadataHtml += `<strong>👤 Especialista:</strong> ${specialist} `;
          }
          if(confluenceUrl){
            metadataHtml += `<br/><strong>🔗 Ver en Confluence:</strong> <a href="${confluenceUrl}" target="_blank" style="color: #0284c7; text-decoration: underline;">Abrir artículo completo →</a>`;
          }
          metadataHtml += '</div>';
        }else{
          console.warn('⚠️ No hay metadata para mostrar');
        }
        
        appendMessage('bot', `<div style="margin: 10px 0; padding: 15px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px;">
          <strong style="color: #f59e0b; font-size: 15px;">💡 Solución ${index + 1}</strong><br>
          <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 4px;">
            <strong style="color: #92400e;">❓ Pregunta/Caso:</strong><br>
            ${titleHtml}
          </div>
          <div style="margin-top: 10px; color: #374151; font-size: 14px; line-height: 1.6;">
            <strong style="color: #059669;">✅ Solución aplicada:</strong><br>
            ${answer.substring(0, 400)}${answer.length > 400 ? '...' : ''}
          </div>
          ${metadataHtml}
        </div>`);
      });
      
      appendMessage('bot', '<strong>¿Te ayudó alguna de estas soluciones?</strong>');
      
      showOptions([
        { label: '✅ Sí, me sirvió', value: 'solved' },
        { label: '📝 No, quiero continuar con el ticket', value: 'continue' }
      ], (choice) => {
        if(choice === 'solved'){
          appendMessage('user', 'Sí, me sirvió');
          hideOptions();
          appendMessage('bot', '🎉 <strong>¡Excelente! Me alegra haber podido ayudarte.</strong>');
          appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte? 😊');
          smartTicketState = { step: null, description: null, nombre: null, apellido: null, correo: null, foundSolutions: [] };
        }else{
          appendMessage('user', 'No, quiero continuar con el ticket');
          hideOptions();
          askForUserDataForTicket();
        }
      });
    }else{
      // No encontró soluciones - continuar con creación directa
      appendMessage('bot', '🔍 <strong>No encontré soluciones exactas en la base de conocimiento.</strong>');
      appendMessage('bot', 'Vamos a crear tu ticket para que un especialista te ayude.');
      askForUserDataForTicket();
    }
  })
  .catch(err => {
    console.error('Error buscando soluciones:', err);
    appendMessage('bot', '⚠️ <strong>Hubo un problema al buscar soluciones.</strong>');
    appendMessage('bot', 'Vamos a continuar con la creación de tu ticket.');
    askForUserDataForTicket();
  });
}

function askForUserDataForTicket(){
  smartTicketState.step = 'user_data';
  
  appendMessage('bot', '📋 <strong>Perfecto, necesito algunos datos para crear tu ticket:</strong>');
  
  // Crear formulario
  const formDiv = document.createElement('div');
  formDiv.className = 'smart-ticket-form';
  formDiv.style.cssText = 'padding:15px;background:#f9fafb;border-radius:8px;margin:10px 12px;';
  
  const html = `
    <div style="margin-bottom:12px;">
      <label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;">👤 Nombre:</label>
      <input type="text" id="ticket-nombre" placeholder="Tu nombre" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;">👤 Apellido:</label>
      <input type="text" id="ticket-apellido" placeholder="Tu apellido" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;">📧 Correo electrónico:</label>
      <input type="email" id="ticket-correo" placeholder="tu@correo.com" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:14px;">
    </div>
    <div style="margin-bottom:12px;">
      <label style="display:block;font-weight:600;margin-bottom:4px;font-size:13px;">📝 Descripción detallada de tu incidencia:</label>
      <textarea id="ticket-descripcion-detallada" placeholder="Describe tu problema con el mayor detalle posible...\n\nℹ️ Incluye si es posible:\n• Número de cuenta\n• Número de actividad\n• Número de punto de servicio\n• Pasos para reproducir el error\n• Mensaje de error exacto" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:6px;font-size:13px;min-height:100px;resize:vertical;"></textarea>
      <small style="color:#666;font-size:12px;">💡 <strong>Tip:</strong> Mientras más detalles proporciones, más rápido podremos ayudarte.</small>
    </div>
    <button id="submit-ticket-data" style="width:100%;padding:12px;background:#10b981;border:none;color:#fff;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600;">
      🎫 Crear Ticket
    </button>
  `;
  
  formDiv.innerHTML = html;
  messagesEl.appendChild(formDiv);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  document.getElementById('submit-ticket-data').addEventListener('click', () => {
    const nombre = document.getElementById('ticket-nombre').value.trim();
    const apellido = document.getElementById('ticket-apellido').value.trim();
    const correo = document.getElementById('ticket-correo').value.trim();
    const descripcionDetallada = document.getElementById('ticket-descripcion-detallada').value.trim();
    
    if(!nombre || !apellido || !correo){
      alert('⚠️ Por favor, completa todos los campos obligatorios (nombre, apellido y correo).');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if(!emailRegex.test(correo)){
      alert('⚠️ Por favor, ingresa un correo electrónico válido.');
      return;
    }
    
    smartTicketState.nombre = nombre;
    smartTicketState.apellido = apellido;
    smartTicketState.correo = correo;
    
    // Si proporcionó descripción detallada, agregarla a la descripción original
    if(descripcionDetallada){
      smartTicketState.description += '\n\n📋 DETALLES ADICIONALES:\n' + descripcionDetallada;
    }
    
    messagesEl.removeChild(formDiv);
    appendMessage('user', `Nombre: ${nombre} ${apellido}\nCorreo: ${correo}${descripcionDetallada ? '\nDescripción detallada: ' + descripcionDetallada.substring(0, 100) + '...' : ''}`);
    
    createSmartTicket();
  });
  
  document.getElementById('ticket-nombre').focus();
}

function createSmartTicket(){
  smartTicketState.step = 'creating';
  
  appendMessage('bot', '⏳ <strong>Creando tu ticket...</strong>');
  
  console.log('🎫 Creando ticket con datos:', smartTicketState);
  
  const ticketData = {
    nombre: smartTicketState.nombre,
    apellido: smartTicketState.apellido,
    correo: smartTicketState.correo,
    email: smartTicketState.correo, // Por si el servidor espera "email"
    descripcion: smartTicketState.description,
    description: smartTicketState.description, // Por si el servidor espera "description"
    sistema: 'General',
    prioridad: 'Media',
    priority: 'Media' // Por si el servidor espera "priority"
  };
  
  console.log('📤 Enviando a Jira:', ticketData);
  
  fetch('/api/jira/create-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketData)
  })
  .then(r => {
    console.log('📥 Respuesta status:', r.status);
    return r.json();
  })
  .then(data => {
    console.log('📥 Respuesta completa de Jira:', data);
    
    if(data.success || data.ticketNumber || data.key || data.id){
      // Extraer número de ticket de múltiples posibles campos
      const ticketNumber = data.ticketNumber || data.key || data.issueKey || data.number || data.id || 'Sin número';
      
      appendMessage('bot', `✅ <strong>¡Ticket creado exitosamente!</strong>`);
      appendMessage('bot', `🎫 <strong>Número de caso:</strong> ${ticketNumber}`);
      appendMessage('bot', `📧 <strong>Confirmación enviada a:</strong> ${smartTicketState.correo}`);
      appendMessage('bot', '👤 <strong>Un especialista revisará tu caso pronto.</strong>');
      appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte? 😊');
    }else{
      appendMessage('bot', `❌ <strong>Error al crear el ticket:</strong> ${data.error || 'Error desconocido'}`);
      appendMessage('bot', 'Por favor, intenta nuevamente o contacta a soporte.');
    }
    
    smartTicketState = { step: null, description: null, nombre: null, apellido: null, correo: null, foundSolutions: [] };
  })
  .catch(err => {
    console.error('Error creando ticket:', err);
    appendMessage('bot', '❌ <strong>Hubo un problema al crear el ticket.</strong>');
    appendMessage('bot', 'Por favor, intenta nuevamente más tarde.');
    smartTicketState = { step: null, description: null, nombre: null, apellido: null, correo: null, foundSolutions: [] };
  });
}
// ========== FIN NUEVO FLUJO INTELIGENTE ==========

function searchKnowledgeBaseForProblem(searchTerm, sistema){
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchTerm))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No se pudo conectar con la base de conocimiento. ¿Deseas que creemos un ticket para que un agente te ayude?');
        showOptions([
          { label: 'Sí, crear ticket', value: 'yes' },
          { label: 'No, gracias', value: 'no' }
        ], (choice)=>{
          if(choice === 'yes'){
            appendMessage('user', 'Sí, crear ticket');
            hideOptions();
            handleReportIncident();
          }else{
            appendMessage('user', 'No, gracias');
            appendMessage('bot', 'Entendido. Si necesitas ayuda más tarde, aquí estaré. 😊');
            hideOptions();
          }
        });
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        const sistemaMsg = sistema ? ` en ${sistema}` : '';
        appendMessage('bot', `No encontré artículos específicos${sistemaMsg} para tu problema. ¿Te gustaría:`);
        showOptions([
          { label: '📋 Crear un ticket', value: 'ticket' },
          { label: '🔍 Describir más el problema', value: 'describe' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'ticket'){
            appendMessage('user', 'Crear un ticket');
            hideOptions();
            handleReportIncident();
          }else if(choice === 'describe'){
            appendMessage('user', 'Describir más el problema');
            appendMessage('bot', 'Por favor, cuéntame con más detalle qué está sucediendo. Incluye:\n• ¿Qué estabas intentando hacer?\n• ¿Qué mensaje de error ves?\n• ¿Cuándo empezó el problema?');
            hideOptions();
          }else{
            appendMessage('user', 'Cancelar');
            appendMessage('bot', 'Entendido. Si necesitas ayuda, no dudes en escribirme. 😊');
            hideOptions();
          }
        });
        return;
      }
      
      // Mostrar resultados encontrados
      appendMessage('bot', `Encontré ${results.length} ${results.length === 1 ? 'solución relacionada' : 'soluciones relacionadas'}:`);
      
      results.forEach((result, i)=>{
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:10px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#0b3b59;text-decoration:underline;font-weight:600;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        const solucionDiv = document.createElement('div');
        solucionDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #d1fae5;font-size:15px;line-height:1.5;';
        solucionDiv.textContent = result.solucion;
        solucionDiv.style.color = '#065f46';
        resultDiv.appendChild(solucionDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si las soluciones ayudaron
      appendMessage('bot', '¿Alguna de estas soluciones te ayudó?');
      showOptions([
        { label: '✅ Sí, resuelto', value: 'solved' },
        { label: '📋 No, crear ticket', value: 'ticket' },
        { label: '🔍 Necesito más ayuda', value: 'more' }
      ], (choice)=>{
        if(choice === 'solved'){
          appendMessage('user', '¡Sí, está resuelto!');
          appendMessage('bot', '¡Excelente! 🎉 Me alegra mucho haber podido ayudarte. Si tienes más consultas, aquí estaré.');
          hideOptions();
          // showFinalizarButton();
        }else if(choice === 'ticket'){
          appendMessage('user', 'No, crear ticket');
          hideOptions();
          appendMessage('bot', 'Entendido. Vamos a crear un ticket para que un especialista te ayude.');
          setTimeout(()=>{
            startSmartTicketCreation();
          }, 500);
        }else{
          appendMessage('user', 'Necesito más ayuda');
          appendMessage('bot', 'Sin problema. Puedes:\n• Describirme el problema con más detalle\n• Crear un ticket para un especialista\n• Contactar directamente a un agente\n\n¿Qué prefieres?');
          hideOptions();
        }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message + '. ¿Deseas crear un ticket?');
      showOptions([
        { label: 'Sí, crear ticket', value: 'yes' },
        { label: 'No, gracias', value: 'no' }
      ], (choice)=>{
        if(choice === 'yes'){
          appendMessage('user', 'Sí, crear ticket');
          hideOptions();
          handleReportIncident();
        }else{
          appendMessage('user', 'No, gracias');
          hideOptions();
        }
      });
    });
}

function searchKnowledgeBase(errorText){
  // Construir consulta de búsqueda más específica incluyendo sistema y módulo
  let searchQuery = errorText;
  
  // Agregar contexto del sistema para búsquedas más precisas
  if(reportState.sistema){
    searchQuery = `${reportState.sistema} ${searchQuery}`;
  }
  if(reportState.modulo){
    searchQuery = `${searchQuery} ${reportState.modulo}`;
  }
  
  appendMessage('bot', `Buscando soluciones para "${errorText}" en ${reportState.sistema || 'la base de conocimiento'}...`);
  
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchQuery))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        appendMessage('bot', 'No se pudo conectar con la base de conocimiento. Por favor, describe el error al agente.');
        showContactAgentButton();
        return;
      }
      const results = data.results || [];
      
      if(results.length === 0){
        // No encontró en Confluence, preguntar si quiere buscar en histórico
        appendMessage('bot', 'No encontré artículos en Confluence sobre este tema. 🔍');
        appendMessage('bot', '¿Te gustaría que busque en el histórico de casos resueltos anteriormente?');
        showOptions([
          { label: '✅ Sí, buscar en histórico', value: 'search_excel' },
          { label: '📋 Crear ticket directamente', value: 'create_ticket' },
          { label: '❌ Cancelar', value: 'cancel' }
        ], (choice)=>{
          if(choice === 'search_excel'){
            appendMessage('user', 'Sí, buscar en histórico');
            hideOptions();
            appendMessage('bot', 'Perfecto, buscando en la base de conocimiento de casos históricos...');
            searchInExcelKnowledgeBase(errorText, reportState.sistema);
          }else if(choice === 'create_ticket'){
            appendMessage('user', 'Crear ticket directamente');
            hideOptions();
            startSmartTicketCreation();
          }else{
            appendMessage('user', 'Cancelar');
            hideOptions();
            appendMessage('bot', 'Entendido. Si necesitas ayuda más tarde, aquí estaré. 😊');
            // showFinalizarButton();
          }
        });
        return;
      }
      
      // Show results with solutions
      appendMessage('bot', 'Encontramos la siguiente información:');
      
      results.forEach((result, i)=>{
        // Create result container with title and solution
        const resultDiv = document.createElement('div');
        resultDiv.style.cssText = 'margin:8px 0;padding:10px;background:#f0fdf4;border-left:4px solid #10b981;border-radius:4px;';
        
        const titleLink = document.createElement('a');
        titleLink.href = result.url;
        titleLink.target = '_blank';
        titleLink.style.cssText = 'color:#0b3b59;text-decoration:underline;font-weight:600;';
        titleLink.textContent = result.title;
        resultDiv.appendChild(titleLink);
        
        // Show the solution prominently
        const solucionDiv = document.createElement('div');
        solucionDiv.style.cssText = 'margin-top:8px;padding:10px;background:#fff;border-radius:4px;border:1px solid #d1fae5;font-size:15px;line-height:1.5;';
        solucionDiv.textContent = result.solucion;
        solucionDiv.style.color = '#065f46';
        resultDiv.appendChild(solucionDiv);
        
        messagesEl.appendChild(resultDiv);
      });
      
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Ask if user found the solution
      appendMessage('bot', '¿Pudiste encontrar lo que buscabas?');
      showOptions([
        { label: 'Sí, encontré la solución', value: 'yes' },
        { label: 'No, necesito más ayuda', value: 'no' }
      ], (choice)=>{
        if(choice === 'yes'){
          appendMessage('user', 'Sí, encontré la solución');
          appendMessage('bot', '¡Excelente! Me alegra haber podido ayudarte. Si vuelves a necesitar soporte, aquí estaré. ¡Hasta pronto!');
          hideOptions();
          showFinalizarButton();
        }else{
          appendMessage('user', 'No, necesito más ayuda');
          appendMessage('bot', 'Entendido. ¿Deseas que creemos un ticket para que un agente especializado te ayude?');
          showOptions([
            { label: 'Sí, crear ticket', value: 'yes_ticket' },
            { label: 'No, gracias', value: 'no_ticket' }
          ], (choice2)=>{
            if(choice2 === 'yes_ticket'){
              appendMessage('user', 'Sí, crear ticket');
              hideOptions();
              startSmartTicketCreation();
            }else{
              appendMessage('user', 'No, gracias');
              const finalMsg = lastJiraTicket
                ? `Entendido. Gracias por usar nuestro servicio de soporte. Tu código de seguimiento es: ${lastJiraTicket}. ¡Hasta pronto!`
                : 'Entendido. Gracias por usar nuestro servicio de soporte. ¡Hasta pronto!';
              appendMessage('bot', finalMsg);
              hideOptions();
              // showFinalizarButton();
            }
          });
        }
      });
    })
    .catch(err=>{
      appendMessage('bot', 'Error al buscar: ' + err.message);
      showContactAgentButton();
    });
}

// function showFinalizarButton(){
//   const containerDiv = document.createElement('div');
//   containerDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
//   
//   const finalizarBtn = document.createElement('button');
//   finalizarBtn.textContent = 'Finalizar sesión';
//   finalizarBtn.style.cssText = 'padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px;flex:1;';
//   finalizarBtn.addEventListener('click', ()=>{
//     const finalMsg = lastJiraTicket
//       ? `Sesión finalizada. Tu código de seguimiento es: ${lastJiraTicket}. ¡Gracias por usar nuestro servicio!`
//       : 'Sesión finalizada. ¡Gracias por usar nuestro servicio!';
//     appendMessage('bot', finalMsg);
//     containerDiv.remove();
//     lastJiraTicket = null; // Reset para nueva sesión
//     setTimeout(()=>location.reload(), 2000); // Reiniciar en 2 segundos
//   });
//   
//   containerDiv.appendChild(finalizarBtn);
//   messagesEl.parentElement.appendChild(containerDiv);
// }

// Función para preguntar si la respuesta fue útil
function askIfHelpful(options = {}) {
  const { 
    showTicketOption = true, 
    showNewQueryOption = true,
    onResolved = null,
    delayMs = 800 
  } = options;
  
  setTimeout(() => {
    appendMessage('bot', '¿Esta información te fue útil? ¿Necesitas algo más?');
  }, delayMs);
}

function showContactAgentButton(){
  const containerDiv = document.createElement('div');
  containerDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const contactBtn = document.createElement('button');
  contactBtn.textContent = 'Contactar con un agente';
  contactBtn.style.cssText = 'flex:1;padding:10px;background:#f59e0b;border:none;color:#fff;border-radius:6px;cursor:pointer;font-weight:600;';
  
  contactBtn.addEventListener('click', ()=>{
    messagesEl.parentElement.removeChild(containerDiv);
    appendMessage('user', 'Deseo contactar con un agente');
    appendMessage('bot', 'Perfecto. Un agente se pondrá en contacto contigo en breve. ¿Cuál es tu correo electrónico o número de teléfono?');
    askForContactInfo();
  });
  
  containerDiv.appendChild(contactBtn);
  messagesEl.parentElement.insertBefore(containerDiv, messagesEl.nextSibling);
}

function askForContactInfo(){
  const inputDiv = document.createElement('div');
  inputDiv.style.cssText = 'padding:10px 12px;border-top:1px solid #eee;display:flex;gap:6px;';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Correo o teléfono (ej: usuario@mail.com o +34 666 777 888)';
  input.style.cssText = 'flex:1;padding:8px;border:1px solid #ddd;border-radius:6px;font-size:13px;';
  
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Enviar';
  submitBtn.style.cssText = 'padding:8px 12px;background:#3b82f6;border:none;color:#fff;border-radius:6px;cursor:pointer;';
  
  submitBtn.addEventListener('click', ()=>{
    const contactInfo = input.value.trim();
    if(!contactInfo || contactInfo.length < 5){
      alert('Por favor, proporciona un correo o teléfono válido.');
      return;
    }
    appendMessage('user', contactInfo);
    messagesEl.parentElement.removeChild(inputDiv);
    submitAgentContact(contactInfo);
  });
  
  inputDiv.appendChild(input);
  inputDiv.appendChild(submitBtn);
  messagesEl.parentElement.insertBefore(inputDiv, messagesEl.nextSibling);
  input.focus();
}

function submitAgentContact(contactInfo){
  appendMessage('bot', 'Gracias por proporcionarnos tu información. Un agente se pondrá en contacto contigo a través de ' + contactInfo + ' en los próximos 30 minutos. ¿Hay algo más en lo que podamos ayudarte?');
  // Optionally, send this data to the backend
  fetch('/api/contact-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactInfo, sistema: reportState.sistema, modulo: reportState.modulo })
  }).catch(err=>console.log('Contact info sent or error:', err));
}

function botReply(userText){
  const txt = userText.toLowerCase().trim();
  
  // Saludos personalizados por hora
  if(/^(hola|buenas|hi|hey|buenos días|buenas tardes|buenas noches)$/i.test(txt)) {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? '¡Buenos días!' : hora < 19 ? '¡Buenas tardes!' : '¡Buenas noches!';
    return `${saludo} 👋 Soy tu asistente de soporte Oracle. ¿En qué puedo ayudarte?`;
  }
  
  // Si pregunta por "preguntas frecuentes" sin tema específico
  if(/^(preguntas? frecuentes?|faqs?|tengo una pregunta frecuente|ver preguntas frecuentes)$/i.test(txt)){
    return '¿Sobre qué sistema necesitas consultar las preguntas frecuentes? Por ejemplo: C2M, FIELD, SALES, SERVICE. O escribe directamente tu pregunta.';
  }
  
  // Preguntas sobre capacidades y funciones
  if(/qué puedes|que puedes|qué sabes|que sabes|qué haces|que haces|capacidades|funciones|ayuda|help|para qué sirves|para que sirves/i.test(txt)) {
    return getCapabilitiesResponse();
  }
  
  // Agradecimientos
  if(/^(gracias|muchas gracias|thank you|thanks)$/i.test(txt)) {
    return '¡Con gusto! Si necesitas algo más, aquí estoy. 😊';
  }
  
  // Respuestas negativas simples
  if(/^(no|nope|nop|no gracias)$/i.test(txt)) {
    return 'Entendido. Si necesitas algo más adelante, aquí estaré. 😊';
  }
  
  // Despedidas
  if(/^(adiós|adios|bye|hasta luego|nos vemos)$/i.test(txt)) {
    return '¡Hasta pronto! 👋';
  }
  
  // Si menciona sistema, redirigir a búsqueda
  if(/c2m|field|sales|service/.test(txt) && txt.length > 10){
    return 'Déjame buscar eso en la base de conocimiento... 🔍';
  }
  
  // Detectar palabras clave ambiguas y ofrecer sugerencias
  if(/^(ticket|tickets|caso|casos|incidencia|incidencias|problema|problemas|ayuda|soporte)$/i.test(txt)){
    return `💡 <strong>Veo que mencionaste "${userText}". Aquí hay algunas opciones:</strong>

🎫 <strong>¿Quieres crear un ticket?</strong>
   • Escribe algo como: "necesito crear un ticket" o "reportar un problema"
   • Te ayudaré paso a paso a crear tu caso

📊 <strong>¿Quieres consultar casos existentes?</strong>
   • "cuantos casos tienen la palabra liquidación"
   • "casos asignados a [nombre especialista]"
   • "mostrar 5 casos de C2M"
   • "quien es el analista que mas casos atiende"

📚 <strong>¿Necesitas ayuda con algún sistema?</strong>
   • "como crear una orden en C2M"
   • "preguntas frecuentes sobre FIELD"
   • "ayuda con facturación en SALES"

📈 <strong>¿Quieres análisis de datos?</strong>
   • "promedio de casos por mes"
   • "casos mas frecuentes"
   • "ranking de especialistas"

¿Con cuál te puedo ayudar? 😊`;
  }
  
  // Detectar frases relacionadas con reportar/crear incidencias
  if(/(reportar|crear|registrar|abrir|levantar|necesito|quiero|puedo|como).*(reportar|crear|registrar|abrir|levantar).*(incidencia|incidente|problema|caso|ticket|falla|error)/i.test(txt)){
    return `🎫 <strong>Veo que quieres reportar algo. ¿Qué necesitas hacer?</strong>

📝 <strong>¿Quieres CREAR un nuevo ticket?</strong>
   • Escribe: "crear ticket" o "necesito crear un ticket"
   • Te guiaré paso a paso para crear tu caso

🔍 <strong>¿Quieres BUSCAR una incidencia específica?</strong>
   • Escribe: "buscar caso [número]" o "ver caso 123456"
   • O: "casos con la palabra [tu palabra clave]"
   • O: "casos asignados a [nombre del especialista]"

📊 <strong>¿Quieres ver ESTADÍSTICAS de incidencias?</strong>
   • "cuantos casos hay"
   • "casos mas frecuentes"
   • "quien atiende mas casos"

¿Cuál prefieres? 😊`;
  }
  
  // Palabras clave ambiguas más largas
  if(/^(crear caso|ver casos|listar casos|ayuda con|como hacer|necesito ayuda)$/i.test(txt)){
    return `💡 <strong>Puedo ayudarte con eso. ¿Qué necesitas específicamente?</strong>

• Si quieres <strong>crear un ticket</strong>: dime "crear ticket" o "reportar problema"
• Si quieres <strong>buscar casos</strong>: dime "casos con la palabra X" o "casos asignados a [nombre]"
• Si necesitas <strong>asesoría</strong>: pregunta directamente, ejemplo "¿cómo crear una orden en C2M?"
• Si quieres <strong>estadísticas</strong>: pregunta "promedio de casos" o "quien atiende mas casos"

Escribe tu consulta con más detalle y te ayudaré. 😊`;
  }
  
  // Detectar palabras muy cortas o sin sentido (menos de 3 caracteres o palabras sin vocales/patrón raro)
  if(txt.length <= 2 && !/^(no|si|ok)$/i.test(txt)){
    return `🤔 <strong>No logro entender tu mensaje.</strong>

Por favor, escribe una pregunta más clara. Por ejemplo:
• "¿Cómo crear una orden en C2M?"
• "Casos asignados a Jonathan"
• "Crear un ticket"
• "Promedio de casos por mes"

¿En qué puedo ayudarte? 😊`;
  }
  
  // Detectar palabras sin sentido o con errores tipográficos evidentes
  // Palabras que no tienen vocales (excepto abreviaturas conocidas), o patrones muy raros
  const hasVowels = /[aeiouáéíóú]/i.test(txt);
  const isSingleWordNoSense = txt.split(/\s+/).length === 1 && txt.length >= 3 && txt.length <= 8 && !hasVowels;
  
  // Lista de palabras válidas conocidas para evitar falsos positivos
  const validWords = /^(c2m|mdm|crm|erp|sap|field|sales|service|pdf|xml|sql|api|url|dns|vpn|ftp|ssh|tcp|udp|http|https|smtp|pop|imap)$/i;
  
  if(isSingleWordNoSense && !validWords.test(txt)){
    return `❌ <strong>Lo siento, no puedo entender "${userText}".</strong>

Por favor, intenta de nuevo con una pregunta clara. Ejemplos:
• "¿Cómo crear un ticket?"
• "Necesito ayuda con C2M"
• "Casos con la palabra facturación"
• "Quien es el analista con más casos"

¿Qué necesitas? 😊`;
  }
  
  // Detectar palabras sin relación conocida (palabras sueltas sin contexto)
  if(txt.split(/\s+/).length === 1 && txt.length >= 3 && txt.length <= 15 && !validWords.test(txt)){
    // Verificar si la palabra tiene alguna relación con sistemas conocidos
    const knownTerms = /ticket|tickets|caso|casos|incidencia|problema|ayuda|soporte|crear|ver|listar|mostrar|buscar|analizar|promedio|ranking|frecuente|c2m|field|sales|service|oracle|factura|cliente|orden|contrato|medidor|lectura|consumo|pago|deuda|validar|corregir|actualizar|eliminar|configurar|usuario|password|contraseña|reporte|dashboard|excel|datos|archivo|informaci[oó]n|estad[ií]stica|consulta|pregunta|frecuente|faq|gu[ií]a|manual|documentaci[oó]n|confluence|jira|asignar|especialista|analista|t[eé]cnico|responsable|estado|prioridad|cerrado|abierto|pendiente|resuelto|cancelado|progreso/i;
    
    if(!knownTerms.test(txt)){
      return `🤔 <strong>No reconozco la palabra "${userText}".</strong>

¿Podrías reformular tu pregunta? Te puedo ayudar con:
• 🎫 <strong>Tickets:</strong> crear, buscar, consultar casos
• 📊 <strong>Análisis:</strong> estadísticas, rankings, promedios
• 📚 <strong>Asesoría:</strong> C2M, FIELD, SALES, SERVICE
• 🔍 <strong>Búsquedas:</strong> casos con palabras clave

Escribe tu consulta con más detalle. 😊`;
    }
  }
  
  // Respuesta por defecto - redirigir a inteligencia artificial
  return 'Déjame buscar esa información para ti... 🔍';
}

// Función que devuelve las capacidades reales basadas en el código
function getCapabilitiesResponse(){
  return `🤖 <strong>Mis capacidades actuales (basadas en mi programación):</strong>

<strong>📚 Sistema de Autoaprendizaje:</strong>
• Recuerdo conversaciones previas y las reutilizo
• Aprendo de cada interacción para mejorar mis respuestas
• Priorizo respuestas que han sido útiles anteriormente
• Almaceno hasta 1,000 interacciones en memoria

<strong>🔍 Búsqueda Inteligente:</strong>
• Busco en Preguntas Frecuentes de Confluence (página específica con tabla estructurada)
• Busco en la Base de Conocimiento general
• Detecto automáticamente el sistema mencionado (C2M, FIELD, SALES, SERVICE)
• Decodifico caracteres especiales (tildes, ñ, acentos)
• Guardo preguntas sin respuesta para revisión futura

<strong>📊 Análisis de Datos Excel:</strong>
• Listo automáticamente archivos Excel disponibles en la carpeta "data/"
• Te pregunto sobre cuál archivo quieres obtener información
• Genero estadísticas completas: total de registros, columnas, valores únicos
• Para columnas numéricas: suma, promedio, mínimo, máximo
• Detecto valores vacíos y nulos en los datos
• Respondo preguntas en lenguaje natural sobre los datos
• Puedo filtrar por rangos de fechas y condiciones específicas
• Solo escribe "analicemos datos" o "revisemos datos" para empezar

<strong>🎫 Gestión de Tickets:</strong>
• Creo tickets en Jira con integración completa
• Solicito datos personales antes de crear ticket (nombre, apellido, correo)
• Detecto sistema y módulo automáticamente
• Manejo diferentes prioridades según criticidad
• Genero código de seguimiento

<strong>💬 Modos de Interacción:</strong>
• <strong>Reportar Incidencia:</strong> Creo tickets para problemas técnicos
• <strong>Asesoría:</strong> Busco información en Confluence sobre temas específicos
• <strong>Preguntas Frecuentes:</strong> Busco en tabla estructurada de FAQs
• <strong>Análisis de Datos:</strong> Respondo consultas sobre archivos Excel
• <strong>Contacto con Agente:</strong> Facilito comunicación directa

<strong>🧠 Detección Inteligente:</strong>
• Detecto automáticamente si una pregunta tiene "?" o palabras interrogativas
• Identifico si mencionas un problema (error, falla, no funciona)
• Reconozco solicitudes de análisis de datos
• Detecto cuando escribes el nombre de un sistema (no solo botones)
• Priorizo búsquedas según el tipo de consulta

<strong>🌐 Sistemas Soportados:</strong>
• <strong>C2M</strong> (Customer to Meter) - 4 módulos: Actividades de Campo, Ventas, Facturación, Reportes
• <strong>FIELD</strong> - Gestión de trabajo de campo
• <strong>SALES</strong> - Módulo comercial y ventas
• <strong>SERVICE</strong> - Atención al cliente
• <strong>OTRO</strong> - Sistemas adicionales

<strong>🔄 Funcionalidades Adicionales:</strong>
• Historial de navegación con botón "Volver"
• Comando "salir" para cerrar sesión
• Respuestas personalizadas por hora del día
• Confirmación de utilidad de respuestas aprendidas
• Registro automático de preguntas sin respuesta
• Panel administrativo para revisar aprendizaje

<strong>🎨 Personalización:</strong>
• Tema rojo Blood Red (#8B0000)
• Logo de Red Clay en header
• Mensajes con HTML y estilos personalizados
• Links clickeables a Confluence
• Tablas de datos con formato responsive

¿Qué te gustaría que haga? 😊`;
}

// ============================================
// FUNCIONES DE ANÁLISIS DE DATOS
// ============================================
// ANÁLISIS DE DATOS CON IA PARA PREGUNTAS ANALÍTICAS
// ============================================

async function handleAnalyticalQueryWithAI(question){
  console.log('🤖 handleAnalyticalQueryWithAI llamado con:', question);
  appendMessage('bot', '🔍 Analizando datos con inteligencia artificial...');
  
  try {
    // 1. Obtener datos de Excel
    const filesData = await fetch('/api/data/list-files').then(r => r.json());
    
    if(filesData.error || !filesData.files || filesData.files.length === 0){
      appendMessage('bot', '⚠️ No hay archivos Excel disponibles. Sube un archivo a la carpeta "data".');
      return;
    }
    
    const fileName = filesData.files[0].name;
    const analyzeData = await fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`).then(r => r.json());
    
    if(analyzeData.error){
      appendMessage('bot', '⚠️ Error al leer datos: ' + analyzeData.error);
      return;
    }
    
    const allData = analyzeData.allData || [];
    const stats = analyzeData.stats;
    
    // 2. Detectar qué tipo de agregación necesita
    const queryLower = question.toLowerCase();
    let aggregatedData = null;
    let dataType = 'aggregated';
    
    // ¿Pregunta sobre temas/asuntos más frecuentes?
    if(/temas?.*mayor.*n[uú]mero|asuntos?.*m[aá]s.*frecuentes?|problemas?.*m[aá]s.*comunes?|m[aá]s.*reportados?|top.*temas?|top.*asuntos?|ranking.*temas?|casos?.*m[aá]s.*frecuentes?|cu[aá]les?.*fueron.*los.*casos|cu[aá]les?.*son.*los.*casos.*m[aá]s|temas?.*recurrentes?|frecuencia.*de.*casos/i.test(queryLower)){
      const asuntoCol = stats.columns.find(col => /asunto|tema|subject|title|descripci[oó]n/i.test(col));
      
      if(asuntoCol){
        const counts = {};
        allData.forEach(row => {
          const asunto = String(row[asuntoCol] || 'Sin asunto').trim();
          counts[asunto] = (counts[asunto] || 0) + 1;
        });
        
        aggregatedData = Object.entries(counts)
          .map(([asunto, count]) => ({ asunto, casos: count }))
          .sort((a, b) => b.casos - a.casos)
          .slice(0, 15); // Top 15
      }
    }
    // ¿Pregunta sobre estados?
    else if(/casos?.*por.*estado|distribuci[oó]n.*estados?|estados?.*mayor|cu[aá]ntos?.*en.*estado|cu[aá]ntos?.*casos?.*tienen.*estado|cu[aá]ntos?.*casos?.*est[aá]n?.*en.*estado|cu[aá]ntos?.*casos?.*se.*encuentra.*estado|casos?.*con.*estado|casos?.*estado.*cerrado|casos?.*estado.*abierto|casos?.*estado.*pendiente|casos?.*estado.*resuelto|tienen.*estado.*cerrado|est[aá]n?.*en.*estado.*cerrado|se.*encuentra.*en.*estado|estados?.*m[aá]s/i.test(queryLower)){
      const statusCol = stats.columns.find(col => /estado|status|state/i.test(col));
      
      if(statusCol){
        const counts = {};
        allData.forEach(row => {
          const estado = String(row[statusCol] || 'Sin estado').trim();
          counts[estado] = (counts[estado] || 0) + 1;
        });
        
        aggregatedData = Object.entries(counts)
          .map(([estado, count]) => ({ estado, casos: count }))
          .sort((a, b) => b.casos - a.casos);
      }
    }
    // ¿Pregunta sobre especialistas/asignados?
    else if(/especialistas?.*m[aá]s.*casos|qui[eé]n.*atiende.*m[aá]s|asignados?.*mayor|ranking.*especialistas?|casos?.*por.*especialista/i.test(queryLower)){
      const specialistCol = stats.columns.find(col => /especialista|asignado|assigned|specialist|owner/i.test(col));
      
      if(specialistCol){
        const counts = {};
        allData.forEach(row => {
          const specialist = String(row[specialistCol] || 'Sin asignar').trim();
          counts[specialist] = (counts[specialist] || 0) + 1;
        });
        
        aggregatedData = Object.entries(counts)
          .map(([especialista, count]) => ({ especialista, casos: count }))
          .sort((a, b) => b.casos - a.casos)
          .slice(0, 10); // Top 10
      }
    }
    // ¿Pregunta sobre aplicaciones/sistemas?
    else if(/aplicaciones?.*mayor|sistemas?.*m[aá]s.*casos|casos?.*por.*aplicaci[oó]n|casos?.*por.*sistema/i.test(queryLower)){
      const appCol = stats.columns.find(col => /aplicaci[oó]n|sistema|application|system|producto|product/i.test(col));
      
      if(appCol){
        const counts = {};
        allData.forEach(row => {
          const app = String(row[appCol] || 'Sin aplicación').trim();
          counts[app] = (counts[app] || 0) + 1;
        });
        
        aggregatedData = Object.entries(counts)
          .map(([aplicacion, count]) => ({ aplicacion, casos: count }))
          .sort((a, b) => b.casos - a.casos);
      }
    }
    // ¿Pregunta sobre funcionalidad comercial?
    else if(/funcionalidad.*comercial|funcionalidad.*mayor|funcionalidades?.*m[aá]s/i.test(queryLower)){
      const funcCol = stats.columns.find(col => /funcionalidad.*comercial|comercial|business.*function/i.test(col));
      
      if(funcCol){
        const counts = {};
        allData.forEach(row => {
          const func = String(row[funcCol] || 'Sin funcionalidad').trim();
          counts[func] = (counts[func] || 0) + 1;
        });
        
        aggregatedData = Object.entries(counts)
          .map(([funcionalidad, count]) => ({ funcionalidad, casos: count }))
          .sort((a, b) => b.casos - a.casos)
          .slice(0, 10); // Top 10
      }
    }
    // ¿Pregunta temporal (fechas, meses, años)?
    else if(/cerrados? en|creados? en|abiertos? en|durante \d{4}|durante.*20\d{2}|en.*20\d{2}|año.*20\d{2}|del.*20\d{2}|de.*20\d{2}|mes de|año \d{4}|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|por mes|por año|tendencia temporal|evoluci[oó]n casos|cu[aá]les?.*fueron.*los.*casos.*de|casos.*del.*año|casos.*del.*mes/i.test(queryLower)){
      // Para análisis temporal, enviar más datos (hasta 3000 filas para cubrir varios años)
      appendMessage('bot', '📅 Detectada consulta temporal. Analizando datos por fechas...');
      aggregatedData = allData.slice(0, 3000); // Más datos para análisis temporal
      dataType = 'temporal';
    }
    // ¿Pregunta sobre analistas/productividad?
    else if(/qui[eé]n.*analista|qui[eé]n.*cerr[oó]|analista.*m[aá]s casos|casos asignados|en espera por|pendiente por cliente|requiere cambio|pendiente por usuario|casos abiertos por analista|productividad analista/i.test(queryLower)){
      // Detectar si hay filtro temporal también
      const hasTemporal = /en octubre|en enero|durante 2025|mes de|año/i.test(queryLower);
      
      if(hasTemporal){
        appendMessage('bot', '📊 Analizando productividad de analistas con filtro temporal...');
      } else {
        appendMessage('bot', '👥 Analizando productividad y carga de analistas...');
      }
      
      aggregatedData = allData.slice(0, 3000); // Más datos para análisis con fechas
      dataType = 'analyst';
    }
    
    // Si no se pudo identificar tipo específico, usar datos raw (sin mensaje confuso)
    if(!aggregatedData){
      aggregatedData = allData.slice(0, 100); // Muestra más amplia
      dataType = 'general';
    }
    
    // Mostrar "AI-Assisted Support Agent está analizando..."
    const thinkingMsg = document.createElement('div');
    thinkingMsg.id = 'claude-thinking-analysis';
    thinkingMsg.style.cssText = 'margin:15px 0;padding:12px;background:linear-gradient(135deg, #667eea15 0%, #764ba215 100%);border-left:4px solid #667eea;border-radius:8px;text-align:center;';
    thinkingMsg.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;gap:10px;"><div class="spinner" style="border:3px solid #f3f4f6;border-top:3px solid #667eea;border-radius:50%;width:20px;height:20px;animation:spin 1s linear infinite;"></div><span style="color:#667eea;font-weight:600;">🤖 AI-Assisted Support Agent está analizando...</span></div>';
    messagesEl.appendChild(thinkingMsg);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // 3. Llamar a IA para análisis
    const aiResponse = await fetch('/api/ai/analyze-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: question,
        data: aggregatedData,
        dataType: dataType
      })
    }).then(r => r.json());
    
    // Remover "pensando"
    const thinkingEl = document.getElementById('claude-thinking-analysis');
    if(thinkingEl) thinkingEl.remove();
    
    if(aiResponse.success && aiResponse.analysis){
      // Mostrar análisis de IA
      const aiDiv = document.createElement('div');
      aiDiv.style.cssText = 'margin:15px 0;padding:16px;background:linear-gradient(135deg, #667eea15 0%, #764ba215 100%);border-left:4px solid #667eea;border-radius:8px;';
      
      const aiLabel = document.createElement('div');
      aiLabel.style.cssText = 'font-weight:700;color:#667eea;margin-bottom:8px;font-size:14px;';
      aiLabel.innerHTML = 'AI-Assisted Support Agent';
      aiDiv.appendChild(aiLabel);
      
      const aiText = document.createElement('div');
      aiText.style.cssText = 'font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap;';
      aiText.textContent = aiResponse.analysis;
      aiDiv.appendChild(aiText);
      
      messagesEl.appendChild(aiDiv);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      // Preguntar si fue útil
      askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
      
      // Ofrecer ver datos detallados
      // showOptions([
      //   { label: '📋 Ver datos completos', value: 'full_data' },
      //   { label: '🔄 Otra consulta', value: 'another' },
      //   { label: '✅ Finalizar', value: 'done' }
      // ], (choice)=>{
      //   if(choice === 'full_data'){
      //     appendMessage('user', 'Ver datos completos');
      //     hideOptions();
      //     analyzeExcelFile(fileName);
      //   }else if(choice === 'another'){
      //     appendMessage('user', 'Otra consulta');
      //     hideOptions();
      //     appendMessage('bot', '¿Qué más te gustaría saber sobre los datos?');
      //   }else{
      //     appendMessage('user', 'Finalizar');
      //     hideOptions();
      //     appendMessage('bot', '¡Perfecto! ¿Hay algo más en lo que pueda ayudarte?');
      //   }
      // });
    } else {
      // Mostrar el mensaje de error del servidor si existe
      const errorMsg = aiResponse.analysis || '⚠️ No pude analizar los datos con IA. Intenta reformular la pregunta.';
      appendMessage('bot', errorMsg);
    }
    
  } catch(error) {
    console.error('Error en handleAnalyticalQueryWithAI:', error);
    const thinkingEl = document.getElementById('claude-thinking-analysis');
    if(thinkingEl) thinkingEl.remove();
    
    // Mensaje más específico según el tipo de error
    let errorMsg = '❌ Error al analizar datos.';
    if (error.message.includes('fetch') || error.message.includes('network')) {
      errorMsg += ' Problema de conexión con el servidor.';
    } else {
      errorMsg += ' Por favor, intenta nuevamente.';
    }
    appendMessage('bot', errorMsg);
  }
}

// ============================================
// ANÁLISIS DE DATOS TRADICIONAL (sin IA)
// ============================================

function autoAnalyzeDataQuery(question){
  console.log('📊 autoAnalyzeDataQuery llamado con:', question);
  appendMessage('bot', '🔍 Analizando los datos para responder tu pregunta...');
  
  // Obtener el primer archivo Excel disponible
  fetch('/api/data/list-files')
    .then(r => r.json())
    .then(data => {
      console.log('📁 Respuesta de list-files:', data);
      if(data.error || !data.files || data.files.length === 0){
        console.error('❌ Error o sin archivos:', data);
        appendMessage('bot', '⚠️ No hay archivos Excel disponibles para analizar. Por favor, sube un archivo a la carpeta "data".');
        return;
      }
      
      console.log('✅ Archivos encontrados:', data.files);
      const fileName = data.files[0].name;
      appendMessage('bot', `📂 Usando archivo: ${fileName}`);
      
      // Analizar el archivo con datos completos
      fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}&fullData=true`)
        .then(r => r.json())
        .then(data => {
          if(data.error){
            appendMessage('bot', '⚠️ Error al analizar: ' + data.error);
            return;
          }
          
          const stats = data.stats;
          const allData = data.allData || [];
          const sheetName = data.sheetName || 'Sin especificar';
          
          // Guardar contexto para consultas de seguimiento
          lastDataContext = {
            fileName,
            sheetName,
            stats,
            allData
          };
          
          // Intentar responder la pregunta con filtros
          const answer = interpretDataQueryWithFiltering(question, stats, allData, fileName, sheetName);
          
          // Usar efecto de escritura progresiva para la respuesta
          appendMessageStreaming('bot', answer, 8).then(() => {
            // NO guardar en memoria de aprendizaje las consultas de datos (son dinámicas)
            // saveLearningData(question, answer, { type: 'data_analysis', fileName, rowsAnalyzed: allData.length });
            
            // Preguntar si fue útil
            askIfHelpful({ showTicketOption: true, showNewQueryOption: true });
            
            // Ofrecer más opciones después de terminar de escribir
            // showOptions([
            //   { label: '📊 Ver estadísticas completas', value: 'full_stats' },
            //   { label: '🔄 Hacer otra consulta', value: 'another' },
            //   { label: '✅ Finalizar', value: 'done' }
            // ], (choice)=>{
            //   if(choice === 'full_stats'){
            //     appendMessage('user', 'Ver estadísticas completas');
            //     hideOptions();
            //     analyzeExcelFile(fileName);
            //   }else if(choice === 'another'){
            //     appendMessage('user', 'Hacer otra consulta');
            //     hideOptions();
            //     appendMessage('bot', 'Claro, ¿qué más quieres saber sobre los datos?');
            //   }else{
            //     appendMessage('user', 'Finalizar');
            //     hideOptions();
            //     appendMessage('bot', '¡Gracias por usar el análisis de datos! ¿Hay algo más en lo que pueda ayudarte?');
            //   }
            // });
          });
        })
        .catch(err => {
          console.error('Error:', err);
          appendMessage('bot', '❌ Error al analizar el archivo.');
        });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al conectar con el servidor.');
    });
}

// Función para manejar consultas de seguimiento sobre datos ya cargados
function handleFollowUpDataQuery(question){
  if(!lastDataContext){
    console.log('⚠️ No hay contexto de datos previos');
    return false;
  }
  
  const txt = question.toLowerCase();
  
  // Detectar si el usuario escribió solo un número (para ver más casos)
  const onlyNumberPattern = /^\s*(\d+)\s*$/;
  const onlyNumberMatch = txt.match(onlyNumberPattern);
  
  if(onlyNumberMatch && lastDataFilter){
    // El usuario escribió solo un número, usar el último filtro
    const numCases = parseInt(onlyNumberMatch[1]);
    console.log(`📋 Consulta con solo número: ${numCases} casos, usando último filtro: "${lastDataFilter}"`);
    
    return showFilteredCases(numCases, lastDataFilter);
  }
  
  // NUEVO: Detectar "muestrame los casos de [palabras clave]" sin número específico
  const keywordPattern = /(?:mu[ée]strame|mostrar|ver|dame|lista(?:r)?)\s+(?:los\s+)?casos?\s+(?:de|con|que\s+contengan?|sobre|relacionados?\s+con?)\s+(.+)/i;
  const keywordMatch = txt.match(keywordPattern);
  
  if(keywordMatch){
    const keywords = keywordMatch[1].trim();
    console.log(`🔍 Búsqueda por palabras clave detectada: "${keywords}"`);
    
    // Guardar el filtro para consultas futuras
    lastDataFilter = keywords;
    
    return showCasesByKeywords(keywords);
  }
  
  // Detectar si es una consulta de seguimiento pidiendo ver casos específicos
  // Patrones: "muéstrame 4 casos", "ver 5 casos pendientes", "dame 3 casos cerrados", etc.
  const showCasesPattern = /(?:mu[ée]strame|mostrar|ver|dame|lista|listar)\s+(\d+)\s+casos?(?:\s+(?:que\s+)?(?:se\s+)?(?:encuentren?|est[eé]n?)\s+en\s+estado\s+)?([a-záéíóúñ\s]+)?/i;
  const match = txt.match(showCasesPattern);
  
  if(!match){
    return false; // No es una consulta de seguimiento
  }
  
  const numCases = parseInt(match[1]);
  const filterText = match[2] ? match[2].trim() : '';
  
  console.log(`📋 Consulta de seguimiento detectada: ${numCases} casos, filtro: "${filterText}"`);
  
  // Guardar el filtro para consultas futuras
  lastDataFilter = filterText;
  
  return showFilteredCases(numCases, filterText);
}

// NUEVA FUNCIÓN: Buscar y mostrar casos por palabras clave
function showCasesByKeywords(keywords, maxCases = 10){
  if(!lastDataContext){
    console.error('⚠️ No hay contexto de datos en showCasesByKeywords');
    appendMessage('bot', '⚠️ No hay datos cargados. Por favor, primero escribe "analicemos datos".');
    return false;
  }
  
  const { stats, allData, fileName, sheetName } = lastDataContext;
  
  // Limpiar y separar palabras clave
  const keywordList = keywords.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  console.log(`🔍 Palabras clave para búsqueda:`, keywordList);
  
  // Buscar en todas las columnas que contengan texto relevante
  const searchColumns = stats.columns.filter(col => 
    /asunto|title|subject|descripci[oó]n|description|soluci[oó]n|solution|error|problema|issue|comentario|comment|detalle|detail/i.test(col)
  );
  
  console.log(`🔍 Buscando en columnas:`, searchColumns);
  
  // Filtrar casos que contengan las palabras clave
  const filteredData = allData.filter(row => {
    // Concatenar todo el texto relevante del caso
    const caseText = searchColumns
      .map(col => String(row[col] || '').toLowerCase())
      .join(' ');
    
    // Verificar si contiene al menos una palabra clave
    return keywordList.some(keyword => caseText.includes(keyword));
  });
  
  console.log(`✅ Encontrados ${filteredData.length} casos con palabras clave: "${keywords}"`);
  
  if(filteredData.length === 0){
    appendMessage('bot', `❌ No se encontraron casos que contengan: <strong>"${keywords}"</strong>\n\n💡 Intenta con otros términos de búsqueda.`);
    return true;
  }
  
  // Limitar a maxCases
  const casesToShow = filteredData.slice(0, maxCases);
  
  // Buscar columnas relevantes
  const titleCol = stats.columns.find(col => /asunto|title|subject|titulo|descripci[oó]n/i.test(col));
  const solutionCol = stats.columns.find(col => /soluci[oó]n|solution|resoluci[oó]n|resolution|respuesta/i.test(col));
  const specialistCol = stats.columns.find(col => /especialista|asignado|assigned|specialist|owner/i.test(col));
  const statusCol = stats.columns.find(col => /estado|status|state/i.test(col));
  const dateCol = stats.columns.find(col => /fecha|date|creado|created/i.test(col));
  const caseNumCol = stats.columns.find(col => /n[uú]mero.*ticket|ticket.*number|case.*number|n[uú]mero/i.test(col));
  const appCol = stats.columns.find(col => /app|aplicaci[oó]n|application|sistema|system/i.test(col));
  
  // Mostrar resultados
  let response = `🔍 <strong>Encontrados ${filteredData.length} caso${filteredData.length > 1 ? 's' : ''} con: "${keywords}"</strong>\n`;
  response += `📊 Mostrando ${casesToShow.length} de ${filteredData.length}\n\n`;
  
  casesToShow.forEach((row, index) => {
    const title = titleCol ? row[titleCol] : 'Sin título';
    const solution = solutionCol ? row[solutionCol] : 'Sin solución';
    const specialist = specialistCol ? row[specialistCol] : 'Sin asignar';
    const status = statusCol ? row[statusCol] : 'Sin estado';
    const app = appCol ? row[appCol] : null;
    let date = dateCol ? row[dateCol] : null;
    const caseNum = caseNumCol ? row[caseNumCol] : null;
    
    // Formatear fecha
    if(date){
      if(typeof date === 'number'){
        date = excelDateToJSDate(date).toLocaleDateString('es-ES');
      }else if(typeof date === 'string' && date.includes('T')){
        date = new Date(date).toLocaleDateString('es-ES');
      }
    }
    
    // Limitar longitud de solución
    const solutionText = String(solution).substring(0, 250) + (String(solution).length > 250 ? '...' : '');
    
    response += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #8B0000; border-radius: 6px;">`;
    response += `<strong style="color: #8B0000; font-size: 16px;">📌 Caso ${index + 1}${caseNum ? ` - #${caseNum}` : ''}</strong><br/>`;
    
    if(app){
      response += `<div style="margin-top: 6px;"><strong>💻 Aplicación:</strong> <span style="background: #fef3c7; padding: 2px 8px; border-radius: 4px; font-weight: 500;">${app}</span></div>`;
    }
    
    if(title && title !== 'Sin título'){
      response += `<div style="margin-top: 8px;"><strong>📋 Título:</strong> ${title}</div>`;
    }
    
    if(status && status !== 'Sin estado'){
      let statusColor = '#e0f2fe';
      if(/closed|cerrado/i.test(status)) statusColor = '#d1fae5';
      if(/pending|pendiente/i.test(status)) statusColor = '#fef3c7';
      if(/active|activo|open|abierto/i.test(status)) statusColor = '#dbeafe';
      
      response += `<div style="margin-top: 6px;"><strong>📊 Estado:</strong> <span style="background: ${statusColor}; padding: 2px 8px; border-radius: 4px;">${status}</span></div>`;
    }
    
    if(specialist && specialist !== 'Sin asignar'){
      response += `<div style="margin-top: 6px;"><strong>👤 Especialista:</strong> ${specialist}</div>`;
    }
    
    if(date){
      response += `<div style="margin-top: 6px;"><strong>📅 Fecha:</strong> ${date}</div>`;
    }
    
    if(solution && solution !== 'Sin solución'){
      response += `<div style="margin-top: 10px; padding: 10px; background: white; border-radius: 4px;">`;
      response += `<strong style="color: #059669;">✅ Solución:</strong><br/>`;
      response += `<span style="color: #374151;">${solutionText}</span>`;
      response += `</div>`;
    }
    
    response += `</div>\n`;
  });
  
  if(filteredData.length > maxCases){
    response += `\n<div style="background: #fffbeb; padding: 12px; border-radius: 6px; border-left: 4px solid #f59e0b; margin-top: 10px;">`;
    response += `ℹ️ <strong>Hay ${filteredData.length - maxCases} caso${filteredData.length - maxCases > 1 ? 's' : ''} más disponible${filteredData.length - maxCases > 1 ? 's' : ''}</strong><br/>`;
    response += `<small>Escribe un número para ver más casos. Ejemplo: "10", "20", "50"</small>`;
    response += `</div>`;
  }
  
  appendMessage('bot', response);
  
  return true; // Se manejó la consulta
}

function showFilteredCases(numCases, filterText){
  if(!lastDataContext){
    console.error('⚠️ No hay contexto de datos en showFilteredCases');
    appendMessage('bot', '⚠️ No hay datos cargados. Por favor, primero escribe "analicemos datos".');
    return false;
  }
  
  const { stats, allData, fileName, sheetName } = lastDataContext;
  
  // Aplicar filtros si se especifican
  let filteredData = [...allData];
  let filterDescription = '';
  
  if(filterText){
    // Normalizar estado para búsqueda
    const normalizeTerms = {
      'pending for client': 'pending for client',
      'pendientes por cliente': 'pending for client',
      'pendiente por cliente': 'pending for client',
      'cerrados': 'closed',
      'cerrado': 'closed',
      'activos': 'active',
      'activo': 'active',
      'resueltos': 'resolved',
      'resuelto': 'resolved',
      'en progreso': 'in progress',
      'abiertos': 'open',
      'abierto': 'open'
    };
    
    const normalizedFilter = normalizeTerms[filterText] || filterText;
    
    // Buscar columna de estado
    const filterStatusCol = stats.columns.find(col => /^(estado|status|state)$/i.test(col));
    
    if(filterStatusCol){
      filteredData = filteredData.filter(row => {
        const cellValue = String(row[filterStatusCol] || '').toLowerCase().trim();
        return cellValue.includes(normalizedFilter.toLowerCase());
      });
      filterDescription = ` en estado "${filterText}"`;
    }
  }
  
  // Limitar a la cantidad solicitada
  const casesToShow = filteredData.slice(0, numCases);
  
  if(casesToShow.length === 0){
    appendMessage('bot', `❌ No se encontraron casos${filterDescription}.`);
    return true;
  }
  
  // Buscar columnas relevantes
  const titleCol = stats.columns.find(col => /asunto|title|subject|titulo|descripci[oó]n/i.test(col));
  const solutionCol = stats.columns.find(col => /soluci[oó]n|solution|resoluci[oó]n|resolution|respuesta/i.test(col));
  const specialistCol = stats.columns.find(col => /especialista|asignado|assigned|specialist|owner/i.test(col));
  const statusCol = stats.columns.find(col => /estado|status|state/i.test(col));
  const dateCol = stats.columns.find(col => /fecha|date|creado|created/i.test(col));
  const caseNumCol = stats.columns.find(col => /n[uú]mero.*ticket|ticket.*number|case.*number|n[uú]mero/i.test(col));
  
  // Mostrar resultados
  let response = `📋 <strong>Mostrando ${casesToShow.length} caso${casesToShow.length > 1 ? 's' : ''}${filterDescription}:</strong>\n\n`;
  
  casesToShow.forEach((row, index) => {
    const title = titleCol ? row[titleCol] : 'Sin título';
    const solution = solutionCol ? row[solutionCol] : 'Sin solución';
    const specialist = specialistCol ? row[specialistCol] : 'Sin asignar';
    const status = statusCol ? row[statusCol] : 'Sin estado';
    let date = dateCol ? row[dateCol] : null;
    const caseNum = caseNumCol ? row[caseNumCol] : null;
    
    // Formatear fecha
    if(date){
      if(typeof date === 'number'){
        date = excelDateToJSDate(date).toLocaleDateString('es-ES');
      }else if(typeof date === 'string' && date.includes('T')){
        date = new Date(date).toLocaleDateString('es-ES');
      }
    }
    
    // Limitar longitud de solución
    const solutionText = String(solution).substring(0, 200) + (String(solution).length > 200 ? '...' : '');
    
    response += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #8B0000; border-radius: 6px;">`;
    response += `<strong style="color: #8B0000; font-size: 16px;">📌 Caso ${index + 1}${caseNum ? ` - #${caseNum}` : ''}</strong><br/>`;
    
    if(title && title !== 'Sin título'){
      response += `<div style="margin-top: 8px;"><strong>📋 Título:</strong> ${title}</div>`;
    }
    
    if(status && status !== 'Sin estado'){
      response += `<div style="margin-top: 6px;"><strong>📊 Estado:</strong> <span style="background: #e0f2fe; padding: 2px 8px; border-radius: 4px;">${status}</span></div>`;
    }
    
    if(specialist && specialist !== 'Sin asignar'){
      response += `<div style="margin-top: 6px;"><strong>👤 Especialista:</strong> ${specialist}</div>`;
    }
    
    if(date){
      response += `<div style="margin-top: 6px;"><strong>📅 Fecha:</strong> ${date}</div>`;
    }
    
    if(solution && solution !== 'Sin solución'){
      response += `<div style="margin-top: 10px; padding: 10px; background: white; border-radius: 4px;">`;
      response += `<strong style="color: #059669;">✅ Solución:</strong><br/>`;
      response += `<span style="color: #374151;">${solutionText}</span>`;
      response += `</div>`;
    }
    
    response += `</div>\n`;
  });
  
  if(filteredData.length > numCases){
    response += `\n<small>ℹ️ Hay ${filteredData.length - numCases} caso${filteredData.length - numCases > 1 ? 's' : ''} más${filterDescription} disponible${filteredData.length - numCases > 1 ? 's' : ''}.</small>`;
  }
  
  appendMessage('bot', response);
  
  // Ofrecer opciones
  showOptions([
    { label: '🔄 Ver más casos', value: 'more' },
    { label: '📊 Cambiar filtro', value: 'filter' },
    { label: '✅ Finalizar', value: 'done' }
  ], (choice)=>{
    if(choice === 'more'){
      appendMessage('user', 'Ver más casos');
      hideOptions();
      appendMessage('bot', '¿Cuántos casos más quieres ver?');
    }else if(choice === 'filter'){
      appendMessage('user', 'Cambiar filtro');
      hideOptions();
      appendMessage('bot', 'Dime qué filtro quieres aplicar (por ejemplo: "casos cerrados", "casos de prioridad alta", etc.)');
    }else{
      appendMessage('user', 'Finalizar');
      hideOptions();
      appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
    }
  });
  
  return true; // Se manejó la consulta
}

function interpretDataQueryWithFiltering(question, stats, allData, fileName, sheetName){
  const txt = question.toLowerCase();
  let response = `📊 <strong>Análisis basado en ${fileName}</strong>\n`;
  response += `📑 Pestaña: <strong>${sheetName}</strong>\n\n`;
  
  // Diccionario de normalización de términos (inglés/español)
  const normalizeTerms = {
    // Estados
    'request changed': 'requiere cambio',
    'closed': 'cerrado',
    'active': 'activo',
    'open': 'abierto',
    'pending': 'pendiente',
    'pending for client': 'pending for client',  // Mantener en inglés para coincidir con Excel
    'pendientes por cliente': 'pending for client',  // Español → Inglés
    'pendiente por cliente': 'pending for client',    // Español → Inglés
    'in progress': 'en progreso',
    'resolved': 'resuelto',
    'solved': 'solucionado',
    'cancelled': 'cancelado',
    'canceled': 'cancelado',
    'on hold': 'en espera',
    
    // Prioridades
    'high': 'alta',
    'medium': 'media',
    'low': 'baja',
    'critical': 'crítica',
    'urgent': 'urgente',
    
    // Tipos
    'incident': 'incidente',
    'request': 'solicitud',
    'change': 'cambio',
    'problem': 'problema'
  };
  
  // Función auxiliar para normalizar un valor
  const normalizeValue = (value) => {
    const normalized = value.toLowerCase().trim();
    return normalizeTerms[normalized] || normalized;
  };
  
  // ============ ANÁLISIS ESTADÍSTICOS AVANZADOS ============
  
  // 1. PROMEDIO DE CASOS POR MES
  if(/promedio.*casos.*mes|casos.*promedio.*mes|promedio.*mensual|casos.*por.*mes/i.test(txt)){
    const dateColumn = stats.columns.find(col => /fecha|date|creado|created|timestamp/i.test(col));
    
    if(dateColumn && allData.length > 0){
      const monthGroups = {};
      
      allData.forEach(row => {
        const cellValue = row[dateColumn];
        if(!cellValue) return;
        
        let rowDate;
        if(typeof cellValue === 'number'){
          rowDate = excelDateToJSDate(cellValue);
        }else{
          rowDate = new Date(cellValue);
        }
        
        if(rowDate && !isNaN(rowDate.getTime())){
          const monthKey = `${rowDate.getFullYear()}-${String(rowDate.getMonth() + 1).padStart(2, '0')}`;
          monthGroups[monthKey] = (monthGroups[monthKey] || 0) + 1;
        }
      });
      
      const months = Object.keys(monthGroups).sort();
      const totalCases = Object.values(monthGroups).reduce((a, b) => a + b, 0);
      const avgPerMonth = (totalCases / months.length).toFixed(1);
      
      response += `📈 <strong>Análisis de promedio mensual:</strong>\n\n`;
      response += `📅 <strong>Período analizado:</strong> ${months[0]} a ${months[months.length - 1]}\n`;
      response += `📊 <strong>Total de meses:</strong> ${months.length}\n`;
      response += `📝 <strong>Total de casos:</strong> ${totalCases}\n`;
      response += `🎯 <strong>Promedio por mes:</strong> ${avgPerMonth} casos\n\n`;
      
      response += `📆 <strong>Detalle mensual:</strong>\n`;
      months.forEach(month => {
        const [year, monthNum] = month.split('-');
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthName = monthNames[parseInt(monthNum) - 1];
        response += `   • ${monthName} ${year}: <strong>${monthGroups[month]} casos</strong>\n`;
      });
      
      return response;
    }else{
      response += `⚠️ No se encontró una columna de fecha para calcular el promedio mensual.\n`;
      response += `📋 Columnas disponibles: ${stats.columns.join(', ')}`;
      return response;
    }
  }
  
  // 2. ANALISTA/ESPECIALISTA CON MÁS CASOS
  if(/qui[eé]n.*m[aá]s.*casos|analista.*m[aá]s.*casos|especialista.*m[aá]s.*casos|ranking.*analistas?|ranking.*especialistas?|top.*analistas?|top.*especialistas?/i.test(txt)){
    const assignedCol = stats.columns.find(col => /especialista|asignado|assigned|specialist|owner|responsable|tecnico|técnico/i.test(col));
    
    if(assignedCol && allData.length > 0){
      const assignedGroups = {};
      
      allData.forEach(row => {
        const assigned = String(row[assignedCol] || 'Sin asignar').trim();
        if(assigned && assigned !== 'Sin asignar'){
          assignedGroups[assigned] = (assignedGroups[assigned] || 0) + 1;
        }
      });
      
      // Ordenar por cantidad descendente
      const sortedAssigned = Object.entries(assignedGroups)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10
      
      const totalAssigned = Object.values(assignedGroups).reduce((a, b) => a + b, 0);
      
      response += `👥 <strong>Ranking de especialistas por cantidad de casos:</strong>\n\n`;
      response += `📊 <strong>Total de casos asignados:</strong> ${totalAssigned}\n`;
      response += `👤 <strong>Total de especialistas:</strong> ${Object.keys(assignedGroups).length}\n\n`;
      
      response += `🏆 <strong>Top 10 especialistas:</strong>\n`;
      sortedAssigned.forEach(([name, count], index) => {
        const percentage = ((count / totalAssigned) * 100).toFixed(1);
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        response += `   ${medal} <strong>${name}</strong>: ${count} casos (${percentage}%)\n`;
      });
      
      return response;
    }else{
      response += `⚠️ No se encontró una columna de especialista/asignado.\n`;
      response += `📋 Columnas disponibles: ${stats.columns.join(', ')}`;
      return response;
    }
  }
  
  // 3. CASOS MÁS FRECUENTES (PALABRAS REPETITIVAS)
  if(/casos.*m[aá]s.*frecuentes?|problemas.*m[aá]s.*comunes?|asuntos.*repetitivos?|palabras.*repetitivas?|temas.*recurrentes?|incidentes.*frecuentes?/i.test(txt)){
    const asuntoCol = stats.columns.find(col => /asunto|subject|titulo|title|descripci[oó]n|description/i.test(col));
    
    if(asuntoCol && allData.length > 0){
      const wordCount = {};
      const stopWords = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'de', 'del', 'a', 'al', 'en', 'con', 'por', 'para', 'y', 'o', 'que', 'se', 'no', 'es', 'su', 'como', 'si', 'me', 'te', 'le', 'lo', 'lo', 'mas', 'pero', 'este', 'esta', 'ese', 'esa', 'the', 'of', 'to', 'and', 'a', 'in', 'is', 'it', 'for', 'on', 'with', 'as', 'at', 'by']);
      
      allData.forEach(row => {
        const asunto = String(row[asuntoCol] || '').toLowerCase();
        // Extraer palabras de 4+ letras
        const words = asunto.match(/[a-záéíóúñ]{4,}/gi) || [];
        
        words.forEach(word => {
          const normalized = word.toLowerCase().trim();
          if(!stopWords.has(normalized)){
            wordCount[normalized] = (wordCount[normalized] || 0) + 1;
          }
        });
      });
      
      // Ordenar por frecuencia
      const sortedWords = Object.entries(wordCount)
        .filter(([word, count]) => count >= 3) // Mínimo 3 apariciones
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
      
      response += `🔍 <strong>Análisis de palabras más frecuentes en asuntos:</strong>\n\n`;
      response += `📊 <strong>Columna analizada:</strong> ${asuntoCol}\n`;
      response += `📝 <strong>Total de casos:</strong> ${allData.length}\n\n`;
      
      if(sortedWords.length > 0){
        response += `📈 <strong>Top 20 palabras más repetidas (mínimo 3 apariciones):</strong>\n`;
        sortedWords.forEach(([word, count], index) => {
          const percentage = ((count / allData.length) * 100).toFixed(1);
          response += `   ${index + 1}. <strong>${word}</strong>: ${count} veces (${percentage}% de los casos)\n`;
        });
        
        response += `\n💡 <strong>Tip:</strong> Puedes buscar casos específicos con "cuantos casos tienen la palabra ${sortedWords[0][0]}"`;
      }else{
        response += `⚠️ No se encontraron palabras con frecuencia significativa (mínimo 3 apariciones).`;
      }
      
      return response;
    }else{
      response += `⚠️ No se encontró una columna de asunto/descripción para analizar.\n`;
      response += `📋 Columnas disponibles: ${stats.columns.join(', ')}`;
      return response;
    }
  }
  
  // ============ FIN ANÁLISIS ESTADÍSTICOS ============
  
  // Detectar mes completo (ej: "mes de junio de 2024" o "junio de 2024" o "junio 2024")
  const monthMatch = txt.match(/(?:mes.*?)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(?:de\s*)?(\d{4})/i);
  
  // Detectar rango de fechas en español (solo si no encontró mes completo)
  const dateMatch = !monthMatch ? txt.match(/(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(al|hasta|\-).*?(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(\d{4})?/i) : null;
  
  let filteredData = allData;
  let startDate, endDate;
  
  const months = {
    'enero': 1, 'febrero': 2, 'marzo': 3, 'abril': 4, 'mayo': 5, 'junio': 6,
    'julio': 7, 'agosto': 8, 'septiembre': 9, 'octubre': 10, 'noviembre': 11, 'diciembre': 12
  };
  
  if(monthMatch){
    // Filtrar por mes completo
    const monthName = monthMatch[1].toLowerCase();
    const year = parseInt(monthMatch[2]);
    const month = months[monthName];
    
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0, 23, 59, 59); // Último día del mes
    
    response += `🗓️ <strong>Período solicitado:</strong> Todo el mes de ${monthMatch[1]} de ${year}\n\n`;
    
    // Buscar específicamente la columna "Fecha" primero
    let dateColumn = stats.columns.find(col => col === 'Fecha');
    
    // Si no existe, buscar "Create Date" como fallback
    if(!dateColumn){
      dateColumn = stats.columns.find(col => col === 'Create Date');
    }
    
    // Si tampoco existe, buscar otras columnas similares
    if(!dateColumn){
      dateColumn = stats.columns.find(col => 
        /fecha.*creaci|fecha|date|día|dia|timestamp|time|creado|created|hora/i.test(col)
      );
    }
    
    if(dateColumn && allData.length > 0){
      response += `📅 Filtrando por columna: <strong>${dateColumn}</strong>\n\n`;
      
      filteredData = allData.filter(row => {
        const cellValue = row[dateColumn];
        if(!cellValue) return false;
        
        // Intentar parsear diferentes formatos de fecha
        let rowDate;
        if(typeof cellValue === 'number'){ // Excel serial date
          rowDate = excelDateToJSDate(cellValue);
        }else{
          rowDate = new Date(cellValue);
        }
        
        return rowDate >= startDate && rowDate <= endDate;
      });
      
      response += `✅ <strong>Resultado:</strong> Se registraron <strong>${filteredData.length} casos</strong> en ${monthMatch[1]} de ${year}\n\n`;
      
      if(filteredData.length > 0){
        response += `📈 <strong>Detalles del período:</strong>\n`;
        response += `• Fecha inicio: ${startDate.toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})}\n`;
        response += `• Fecha fin: ${endDate.toLocaleDateString('es-ES', {day: 'numeric', month: 'long', year: 'numeric'})}\n`;
        response += `• Total de casos: <strong>${filteredData.length}</strong>\n`;
      }else{
        response += `⚠️ No se encontraron registros en ${monthMatch[1]} de ${year}.`;
      }
    }else{
      response += `⚠️ No se pudo identificar una columna de fecha en el archivo.\n`;
      response += `📋 Columnas disponibles: ${stats.columns.join(', ')}\n\n`;
      response += `📝 Total de registros: <strong>${allData.length}</strong>`;
    }
  }else if(dateMatch){
    // El objeto months ya está definido arriba
    const startDay = parseInt(dateMatch[1]);
    const startMonth = months[dateMatch[2].toLowerCase()];
    const endDay = parseInt(dateMatch[3]);
    const endMonth = months[dateMatch[4].toLowerCase()];
    const year = parseInt(dateMatch[5] || '2026');
    
    startDate = new Date(year, startMonth - 1, startDay);
    endDate = new Date(year, endMonth - 1, endDay, 23, 59, 59);
    
    response += `🗓️ <strong>Rango solicitado:</strong> ${startDay} de ${dateMatch[2]} al ${endDay} de ${dateMatch[4]} de ${year}\n\n`;
    
    // Buscar específicamente la columna "Fecha" primero
    let dateColumn = stats.columns.find(col => col === 'Fecha');
    
    // Si no existe, buscar "Create Date" como fallback
    if(!dateColumn){
      dateColumn = stats.columns.find(col => col === 'Create Date');
    }
    
    // Si tampoco existe, buscar otras columnas similares
    if(!dateColumn){
      dateColumn = stats.columns.find(col => 
        /fecha.*creaci|fecha|date|día|dia|timestamp|time|creado|created|hora/i.test(col)
      );
    }
    
    if(dateColumn && allData.length > 0){
      response += `📅 Filtrando por columna: <strong>${dateColumn}</strong>\n\n`;
      
      filteredData = allData.filter(row => {
        const cellValue = row[dateColumn];
        if(!cellValue) return false;
        
        // Intentar parsear diferentes formatos de fecha
        let rowDate;
        if(typeof cellValue === 'number'){ // Excel serial date
          rowDate = excelDateToJSDate(cellValue);
        }else{
          rowDate = new Date(cellValue);
        }
        
        return rowDate >= startDate && rowDate <= endDate;
      });
      
      response += `✅ <strong>Registros encontrados:</strong> ${filteredData.length} casos\n\n`;
      
      if(filteredData.length > 0){
        response += `📈 <strong>Detalles:</strong>\n`;
        response += `• Fecha inicio: ${startDate.toLocaleDateString('es-ES')}\n`;
        response += `• Fecha fin: ${endDate.toLocaleDateString('es-ES')}\n`;
        response += `• Total de casos: <strong>${filteredData.length}</strong>\n`;
      }else{
        response += `⚠️ No se encontraron registros en ese rango de fechas.`;
      }
    }else{
      response += `⚠️ No se pudo identificar una columna de fecha en el archivo.\n`;
      response += `📋 Columnas disponibles:\n${stats.columns.slice(0, 5).join(', ')}...\n\n`;
      response += `📝 Total de registros en el archivo completo: <strong>${allData.length}</strong>`;
    }
  }else{
    // Sin filtro de fecha, intentar buscar filtros por otras columnas
    let appliedFilters = [];
    filteredData = allData;
    
    console.log('Texto de consulta:', txt);
    console.log('Columnas disponibles:', stats.columns);
    
    // Detectar patrones comunes de filtrado
    // Patrón mejorado: "asignados a [nombre]", "han sido asignados", "fueron asignados", etc.
    // También captura: "casos con la palabra X asignados a Jonathan Rodriguez"
    const assignedMatch = txt.match(/(?:han\s+sido\s+|fueron\s+|está[n]?\s+|son\s+|que\s+fueron\s+)?asignados?\s+(?:al?\s+)?(?:especialista\s+|técnico\s+|tecnico\s+)?([a-záéíóúñ\s]+?)(?:\s*$|,|\?|\.)/i);
    
    console.log('assignedMatch:', assignedMatch);
    
    if(assignedMatch){
      const searchValue = assignedMatch[1].trim();
      console.log('Buscando por especialista:', searchValue);
      
      // Buscar columnas que puedan contener información de asignación
      const assignedCol = stats.columns.find(col => 
        /^(especialista|asignado|assigned|specialist|owner|responsable|tecnico|técnico)$/i.test(col)
      );
      
      console.log('Columna encontrada:', assignedCol);
      
      if(assignedCol){
        const beforeFilter = filteredData.length;
        
        // Debug: Ver valores únicos en la columna
        const uniqueValues = [...new Set(filteredData.map(row => String(row[assignedCol] || '').trim()))];
        console.log('Valores únicos en columna Especialista:', uniqueValues);
        console.log('Total valores únicos:', uniqueValues.length);
        
        filteredData = filteredData.filter(row => {
          const cellValue = String(row[assignedCol] || '').toLowerCase().trim();
          const match = cellValue.includes(searchValue.toLowerCase());
          if(match) {
            console.log('Match encontrado:', cellValue);
          }
          return match;
        });
        console.log(`Filtrados: ${beforeFilter} -> ${filteredData.length}`);
        appliedFilters.push(`👤 Asignado: ${searchValue} (columna: ${assignedCol})`);
      }
    }
    
    // Patrón mejorado: "para la aplicación", "de la aplicación", "registrados para", etc.
    const appMatch = txt.match(/(?:para|de|en|registrados?\s+(?:para|en))\s+(?:la\s+)?aplicaci[oó]n\s+([a-z0-9\s]+?)(?:\s*$|,|\?|\.)/i);
    if(appMatch){
      const searchValue = appMatch[1].trim();
      const appCol = stats.columns.find(col => 
        /^(aplicaci[oó]n|application|app|sistema|system)$/i.test(col)
      );
      
      if(appCol){
        filteredData = filteredData.filter(row => {
          const cellValue = normalizeValue(String(row[appCol] || ''));
          const searchNormalized = normalizeValue(searchValue);
          return cellValue.includes(searchNormalized);
        });
        appliedFilters.push(`📱 Aplicación: ${searchValue} (columna: ${appCol})`);
      }
    }
    
    // Patrón mejorado: "con estado", "en estado", "que están", "están en estado", etc.
    let statusMatch = txt.match(/(?:con|en|que\s+est[aá]n(?:\s+en)?|est[aá]n\s+en)\s+estado\s+([a-záéíóúñ\s]+?)(?:\s*$|,|\?|\.|\s+de\s+|\s+asignados)/i);
    
    // Si no se encontró con el patrón anterior, buscar patrones más flexibles
    if(!statusMatch){
      // "casos pendientes por cliente", "casos cerrados", "casos activos", etc.
      // IMPORTANTE: Patrones más largos primero para que se capturen correctamente
      statusMatch = txt.match(/casos?\s+(pending\s+for\s+client|pendientes?\s+por\s+cliente|en\s+progreso|in\s+progress|request\s+changed|pendientes?|cerrados?|activos?|abiertos?|resueltos?|cancelados?|solucionados?|solved)/i);
      
      // Si encontró algo, el grupo de captura está en [1]
      if(statusMatch){
        statusMatch = [statusMatch[0], statusMatch[1]];
      }
    }
    
    if(statusMatch){
      const searchValue = statusMatch[1].trim();
      const statusCol = stats.columns.find(col => 
        /^(estado|status|state|situaci[oó]n)$/i.test(col)
      );
      
      if(statusCol){
        filteredData = filteredData.filter(row => {
          const cellValue = normalizeValue(String(row[statusCol] || ''));
          const searchNormalized = normalizeValue(searchValue);
          return cellValue.includes(searchNormalized);
        });
        appliedFilters.push(`📊 Estado: ${searchValue} (columna: ${statusCol})`);
      }
    }
    
    // Patrón mejorado: "con prioridad", "prioridad alta", "de prioridad", etc.
    const priorityMatch = txt.match(/(?:con\s+|de\s+)?prioridad\s+(alta|media|baja|high|medium|low|cr[ií]tica|[0-9]+)/i);
    if(priorityMatch){
      const searchValue = priorityMatch[1].trim();
      const priorityCol = stats.columns.find(col => 
        /prioridad|priority|urgencia|nivel/i.test(col)
      );
      
      if(priorityCol){
        filteredData = filteredData.filter(row => {
          const cellValue = normalizeValue(String(row[priorityCol] || ''));
          const searchNormalized = normalizeValue(searchValue);
          return cellValue.includes(searchNormalized);
        });
        appliedFilters.push(`⚡ Prioridad: ${searchValue} (columna: ${priorityCol})`);
      }
    }
    
    // Filtro genérico: búsqueda de texto libre (palabras clave en cualquier columna)
    // Patrones: "tienen la palabra X", "contienen X", "con la palabra X", "que digan X"
    // También detecta: "casos con la palabra X asignados a Y"
    const keywordMatch = txt.match(/(?:tienen|contienen|con|que\s+digan?|incluyen?|tengan?)\s+(?:la\s+palabra\s+)?["']?([a-záéíóúñ0-9\s]+?)["']?(?:\s+(?:asignados?|fueron|que\s+fueron|han\s+sido)|,|\?|\.|$)/i);
    if(keywordMatch){
      const searchKeyword = keywordMatch[1].trim();
      
      // Columnas prioritarias para búsqueda de texto (asunto, detalle, notas, descripción)
      const textColumns = stats.columns.filter(col => 
        /asunto|detail|detalle|nota|descripcion|description|comentario|comment|titulo|title|subject|incidente|incident|resumen|summary/i.test(col)
      );
      
      // Si no hay columnas de texto específicas, buscar en todas las columnas de tipo string
      const searchColumns = textColumns.length > 0 ? textColumns : stats.columns;
      
      console.log('Búsqueda de palabra clave:', searchKeyword);
      console.log('Columnas de búsqueda:', searchColumns);
      
      const beforeFilter = filteredData.length;
      filteredData = filteredData.filter(row => {
        // Buscar la palabra en cualquiera de las columnas de texto
        return searchColumns.some(col => {
          const cellValue = normalizeValue(String(row[col] || ''));
          const keywordNormalized = normalizeValue(searchKeyword);
          return cellValue.includes(keywordNormalized);
        });
      });
      
      console.log(`Filtrados por palabra clave: ${beforeFilter} -> ${filteredData.length}`);
      appliedFilters.push(`🔍 Palabra clave: "${searchKeyword}"`);
    }
    
    // Detectar si piden un límite de casos: "solución de 5 casos", "mostrar 10 casos", "ver 3 casos"
    const limitMatch = txt.match(/(?:soluci[oó]n\s+de\s+|mostrar|muestrame|ver|dame|lista(?:r)?)\s*(\d+)\s*casos?/i);
    let limitCases = limitMatch ? parseInt(limitMatch[1]) : null;
    
    // Detectar si específicamente piden la solución
    const showSolution = /soluci[oó]n|resoluci[oó]n|respuesta|como\s+se\s+resol|c[oó]mo\s+se\s+solucion/i.test(txt);
    
    console.log('Límite de casos:', limitCases);
    console.log('Mostrar solución:', showSolution);
    
    // Si se aplicaron filtros, mostrar resultados con análisis detallado
    if(appliedFilters.length > 0){
      if(filteredData.length === 0){
        response = `📊 <strong>Resultado de búsqueda:</strong>\n\n`;
        response += `❌ No se encontraron casos que cumplan con los criterios especificados.\n\n`;
        appliedFilters.forEach(filter => response += `   • ${filter}\n`);
      }else{
        // Generar respuesta conversacional según el tipo de filtro
        response = `📊 <strong>Resultado de tu consulta:</strong>\n\n`;
        
        // Respuesta combinada cuando hay múltiples filtros
        if(appliedFilters.length > 1){
          response += `🎯 Encontré <strong>${filteredData.length} caso${filteredData.length !== 1 ? 's' : ''}</strong> que cumple${filteredData.length !== 1 ? 'n' : ''} con los siguientes criterios:\n\n`;
          appliedFilters.forEach(filter => response += `   • ${filter}\n`);
          response += `\n`;
        }
        // Respuesta específica cuando hay un solo filtro
        else if(keywordMatch){
          const searchKeyword = keywordMatch[1].trim();
          response += `🔍 Encontré <strong>${filteredData.length} caso${filteredData.length !== 1 ? 's' : ''}</strong> que contiene${filteredData.length !== 1 ? 'n' : ''} la palabra "<strong>${searchKeyword}</strong>".\n\n`;
        }else if(assignedMatch){
          const assignedName = assignedMatch[1].trim();
          response += `🎯 De acuerdo a tu consulta, se encontraron <strong>${filteredData.length} casos asignados al especialista ${assignedName}</strong>.\n\n`;
        }else if(appMatch){
          const appName = appMatch[1].trim().toUpperCase();
          response += `🎯 De acuerdo a tu consulta, se encontraron <strong>${filteredData.length} casos para la aplicación ${appName}</strong>.\n\n`;
        }else if(statusMatch){
          const statusName = statusMatch[1].trim();
          response += `🎯 De acuerdo a tu consulta, se encontraron <strong>${filteredData.length} casos en estado ${statusName}</strong>.\n\n`;
        }else if(priorityMatch){
          const priorityName = priorityMatch[1].trim();
          response += `🎯 De acuerdo a tu consulta, se encontraron <strong>${filteredData.length} casos con prioridad ${priorityName}</strong>.\n\n`;
        }
        
        // Para búsquedas por palabra clave (o combinadas), mostrar muestra de registros
        if(keywordMatch || appliedFilters.length > 1 || showSolution){
          // Mostrar en qué columnas se encontró
          const textColumns = stats.columns.filter(col => 
            /asunto|detail|detalle|nota|descripcion|description|comentario|comment|titulo|title|subject|incidente|incident|resumen|summary/i.test(col)
          );
          const searchColumns = textColumns.length > 0 ? textColumns : stats.columns;
          
          response += `📋 <strong>Búsqueda realizada en:</strong> ${searchColumns.join(', ')}\n\n`;
          
          // Determinar cuántos casos mostrar
          const sampleSize = limitCases ? Math.min(limitCases, filteredData.length) : Math.min(5, filteredData.length);
          response += `📄 <strong>${showSolution ? 'Casos con solución' : 'Muestra de registros encontrados'} (${sampleSize} de ${filteredData.length}):</strong>\n\n`;
          
          // Encontrar columnas relevantes
          const asuntoCol = stats.columns.find(col => /asunto|subject|titulo|title/i.test(col));
          const numeroCol = stats.columns.find(col => /n[uú]mero.*ticket|ticket.*number|number/i.test(col));
          const solucionCol = stats.columns.find(col => /soluci[oó]n|solution|resoluci[oó]n|resolution|respuesta|answer/i.test(col));
          const estadoCol = stats.columns.find(col => /estado|status|state/i.test(col));
          const appCol = stats.columns.find(col => /aplicaci[oó]n|application|app/i.test(col));
          const especialistaCol = stats.columns.find(col => /especialista|asignado|assigned|specialist|owner|responsable|tecnico|técnico/i.test(col));
          
          for(let i = 0; i < sampleSize; i++){
            const row = filteredData[i];
            
            const asunto = asuntoCol ? row[asuntoCol] : '';
            const numero = numeroCol ? row[numeroCol] : '';
            const solucion = solucionCol ? row[solucionCol] : '';
            const estado = estadoCol ? row[estadoCol] : '';
            const aplicacion = appCol ? row[appCol] : '';
            const especialista = especialistaCol ? row[especialistaCol] : '';
            
            response += `<div style="margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-left: 3px solid #4f46e5; border-radius: 4px;">`;
            
            if(numero){
              response += `<strong>📌 Caso #${numero}</strong><br>`;
            }else{
              response += `<strong>📌 Caso ${i+1}</strong><br>`;
            }
            
            if(asunto){
              response += `<strong>Asunto:</strong> ${asunto}<br>`;
            }
            
            if(especialista && String(especialista).trim() !== ''){
              response += `<strong>👤 Especialista:</strong> ${especialista}<br>`;
            }
            
            if(aplicacion){
              response += `<strong>📱 Aplicación:</strong> ${aplicacion}<br>`;
            }
            
            if(estado){
              response += `<strong>📊 Estado:</strong> ${estado}<br>`;
            }
            
            // Siempre mostrar la solución si existe
            if(solucion && String(solucion).trim() !== ''){
              const solucionTexto = String(solucion).trim();
              const solucionLimitada = solucionTexto.length > 400 ? solucionTexto.substring(0, 400) + '...' : solucionTexto;
              response += `<strong>💡 Solución:</strong> ${solucionLimitada}<br>`;
            }
            
            response += `</div>\n`;
          }
          
          // No mostrar análisis por estado para búsquedas de palabras clave
          return response;
        }
        
        // Análisis adicional por estado (solo para otros filtros, NO para palabras clave)
        const statusCol = stats.columns.find(col => /estado|status|state/i.test(col));
        if(statusCol){
          const statusGroups = {};
          filteredData.forEach(row => {
            const status = row[statusCol] || 'Sin estado';
            statusGroups[status] = (statusGroups[status] || 0) + 1;
          });
          
          const uniqueStatuses = Object.keys(statusGroups);
          if(uniqueStatuses.length > 1){
            response += `📊 <strong>Distribución por estado:</strong>\n`;
            Object.entries(statusGroups).forEach(([status, count]) => {
              const percentage = ((count / filteredData.length) * 100).toFixed(1);
              response += `   • ${status}: <strong>${count} casos</strong> (${percentage}%)\n`;
            });
            response += `\n`;
          }else if(uniqueStatuses.length === 1){
            response += `📌 Todos los casos están en estado: <strong>${uniqueStatuses[0]}</strong>\n\n`;
          }
        }
        
        // Análisis adicional por prioridad (si existe y no es el filtro principal)
        if(!priorityMatch){
          const priorityCol = stats.columns.find(col => /prioridad|priority/i.test(col));
          if(priorityCol){
            const priorityGroups = {};
            filteredData.forEach(row => {
              const priority = row[priorityCol] || 'Sin prioridad';
              priorityGroups[priority] = (priorityGroups[priority] || 0) + 1;
            });
            
            if(Object.keys(priorityGroups).length > 1 && Object.keys(priorityGroups).length <= 5){
              response += `⚡ <strong>Distribución por prioridad:</strong>\n`;
              Object.entries(priorityGroups).forEach(([priority, count]) => {
                response += `   • ${priority}: <strong>${count} casos</strong>\n`;
              });
              response += `\n`;
            }
          }
        }
        
        // Análisis adicional por aplicación (si existe y no es el filtro principal)
        if(!appMatch){
          const appCol = stats.columns.find(col => /aplicaci[oó]n|application|app/i.test(col));
          if(appCol && filteredData.length > 0){
            const appGroups = {};
            filteredData.forEach(row => {
              const app = row[appCol] || 'Sin aplicación';
              appGroups[app] = (appGroups[app] || 0) + 1;
            });
            
            if(Object.keys(appGroups).length > 1 && Object.keys(appGroups).length <= 5){
              response += `📱 <strong>Distribución por aplicación:</strong>\n`;
              Object.entries(appGroups).forEach(([app, count]) => {
                response += `   • ${app}: <strong>${count} casos</strong>\n`;
              });
            }
          }
        }
      }
    }else{
      // Sin filtros específicos detectados, mostrar total
      response += `📝 Total de registros en el archivo: <strong>${allData.length}</strong>\n\n`;
      
      if(/casos|registros|cantidad/.test(txt)){
        response += `ℹ️ El archivo contiene <strong>${allData.length} registros</strong> en total.\n\n`;
      }
      
      response += `💡 <strong>Tip:</strong> Puedes hacer preguntas como:\n`;
      response += `   • "¿Cuántos casos del 1 al 15 de enero?"\n`;
      response += `   • "¿Cuántos casos asignados a [nombre]?"\n`;
      response += `   • "¿Cuántos casos para la aplicación C2M?"\n`;
      response += `   • "¿Cuántos casos con prioridad alta?"\n`;
      response += `   • "¿Cuántos casos tienen la palabra contraseña?"\n`;
      response += `   • "¿Cuántos casos contienen facturación?"`;
    }
  }
  
  return response;
}

// Función auxiliar para convertir fechas seriales de Excel a JavaScript Date
function excelDateToJSDate(serial){
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate());
}

function interpretDataQuery(question, stats, fileName){
  const txt = question.toLowerCase();
  let response = `📊 <strong>Análisis basado en ${fileName}</strong>\n\n`;
  
  // Detectar rango de fechas
  const dateMatch = txt.match(/(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{1,2}).*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec).*?(\d{4})?/i);
  
  if(dateMatch){
    const startDay = dateMatch[1];
    const startMonth = dateMatch[2];
    const endDay = dateMatch[3];
    const endMonth = dateMatch[4];
    const year = dateMatch[5] || '2026';
    
    response += `🗓️ Rango solicitado: ${startDay} de ${startMonth} al ${endDay} de ${endMonth} de ${year}\n\n`;
  }
  
  // Información general del archivo
  response += `📝 Total de registros en el archivo: <strong>${stats.totalRows}</strong>\n\n`;
  
  // Detectar qué información se solicita
  if(/casos|registros|cantidad|número/.test(txt)){
    response += `ℹ️ El archivo contiene <strong>${stats.totalRows} registros</strong> en total.\n\n`;
  }
  
  // Mostrar columnas disponibles
  response += `📋 <strong>Columnas disponibles:</strong>\n`;
  response += stats.columns.slice(0, 10).map((col, i) => `${i+1}. ${col}`).join('\n');
  if(stats.columns.length > 10){
    response += `\n... y ${stats.columns.length - 10} columnas más`;
  }
  response += `\n\n`;
  
  // Buscar columna de fecha
  const dateColumn = stats.columns.find(col => 
    /fecha|date|día|dia|timestamp|time|creado|created/i.test(col)
  );
  
  if(dateColumn){
    response += `📅 Columna de fecha identificada: <strong>${dateColumn}</strong>\n`;
    const dateStats = stats.columnStats[dateColumn];
    response += `   • Registros con fecha: ${dateStats.count}\n`;
    response += `   • Fechas únicas: ${dateStats.unique}\n\n`;
  }else{
    response += `⚠️ No se identificó automáticamente una columna de fecha. Columnas disponibles:\n`;
    response += stats.columns.filter(col => /fecha|date|año|mes|day/i.test(col)).join(', ') || 'Ninguna columna con nombre relacionado a fechas';
    response += `\n\n`;
  }
  
  response += `💡 <strong>Nota:</strong> Para filtrar por fechas específicas, necesito que el archivo tenga una columna de fechas bien formateada. Puedo mostrarte las estadísticas completas si lo deseas.`;
  
  return response;
}

function handleDataAnalysisRequest(){
  // Directamente listar archivos sin menú intermedio
  appendMessage('bot', '📊 Voy a buscar los archivos Excel disponibles para analizar...');
  listExcelFilesForAnalysis();
}

function listExcelFilesForAnalysis(){
  fetch('/api/data/list-files')
    .then(r => r.json())
    .then(data => {
      if(data.error){
        appendMessage('bot', '⚠️ Error al listar archivos: ' + data.error);
        return;
      }
      
      const files = data.files || [];
      
      if(files.length === 0){
        appendMessage('bot', '📂 No encontré archivos Excel en la carpeta "data". Por favor, coloca archivos .xlsx o .xls ahí para que pueda analizarlos.');
        return;
      }
      
      // Mensaje amigable
      let fileList = files.map((f, i) => `   ${i+1}. <strong>${f.name}</strong> (${(f.size / 1024).toFixed(2)} KB)`).join('\n');
      
      if(files.length === 1){
        appendMessage('bot', `📁 Encontré un archivo Excel:\n\n${fileList}\n\n¿Te gustaría que lo analice?`);
      } else {
        appendMessage('bot', `📁 Encontré ${files.length} archivos Excel disponibles:\n\n${fileList}\n\n¿Sobre cuál archivo te gustaría obtener información?`);
      }
      
      const options = files.map((f, i) => ({
        label: `${i+1}. ${f.name}`,
        value: f.name
      }));
      options.push({ label: '❌ Cancelar', value: 'cancel' });
      
      showOptions(options, (fileName)=>{
        if(fileName === 'cancel'){
          appendMessage('user', 'Cancelar');
          hideOptions();
          appendMessage('bot', '¿En qué más puedo ayudarte?');
          return;
        }
        
        appendMessage('user', fileName);
        hideOptions();
        analyzeExcelFile(fileName);
      });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al conectar con el servidor. ¿Está el servidor corriendo?');
    });
}

function analyzeExcelFile(fileName){
  appendMessage('bot', `📊 Perfecto, déjame analizar el archivo <strong>${fileName}</strong>...`);
  
  fetch(`/api/data/analyze?file=${encodeURIComponent(fileName)}`)
    .then(r => r.json())
    .then(data => {
      if(data.error){
        appendMessage('bot', '⚠️ Error al analizar el archivo: ' + data.error);
        return;
      }
      
      const stats = data.stats;
      
      // Mostrar estadísticas de forma conversacional
      let message = `📊 <strong>Aquí está el análisis de ${fileName}:</strong>\n\n`;
      message += `📝 Este archivo contiene <strong>${stats.totalRows} registros</strong> organizados en <strong>${stats.columns.length} columnas</strong>.\n\n`;
      message += `<strong>📋 Detalles de cada columna:</strong>\n\n`;
      
      Object.keys(stats.columnStats).forEach(col => {
        const colStats = stats.columnStats[col];
        message += `🔹 <strong>${col}</strong>\n`;
        message += `   • ${colStats.count} valores registrados\n`;
        message += `   • ${colStats.unique} valores únicos\n`;
        
        if(colStats.nullCount > 0){
          message += `   • ${colStats.nullCount} valores vacíos\n`;
        }
        
        if(colStats.isNumeric){
          message += `   • Suma total: ${colStats.sum.toFixed(2)}\n`;
          message += `   • Promedio: ${colStats.avg.toFixed(2)}\n`;
          message += `   • Valor más bajo: ${colStats.min}\n`;
          message += `   • Valor más alto: ${colStats.max}\n`;
        }
        
        message += '\n';
      });
      
      message += '\n¿Te gustaría hacer alguna consulta específica sobre estos datos?';
      
      // Usar efecto de escritura progresiva
      appendMessageStreaming('bot', message, 8).then(() => {
        // Preguntar si quiere analizar otro archivo después de terminar de escribir
        setTimeout(() => {
          appendMessage('bot', '¿Quieres analizar otro archivo?');
          showOptions([
            { label: '🔄 Analizar otro archivo', value: 'yes' },
            { label: '✅ No, gracias', value: 'no' }
          ], (choice)=>{
            if(choice === 'yes'){
              appendMessage('user', 'Analizar otro archivo');
              hideOptions();
              listExcelFilesForAnalysis();
            }else{
              appendMessage('user', 'No, gracias');
              hideOptions();
              appendMessage('bot', '¡Perfecto! ¿Hay algo más en lo que pueda ayudarte?');
            }
          });
        }, 1000);
      });
    })
    .catch(err => {
      console.error('Error:', err);
      appendMessage('bot', '❌ Error al procesar el archivo. Verifica que el formato sea correcto.');
    });
}

function createDataTable(data){
  const tableDiv = document.createElement('div');
  tableDiv.style.cssText = 'overflow-x:auto;margin:10px 0;max-width:100%;';
  
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse;font-size:12px;width:100%;background:white;';
  
  // Headers
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  Object.keys(data[0]).forEach(key => {
    const th = document.createElement('th');
    th.textContent = key;
    th.style.cssText = 'padding:8px;background:#8B0000;color:white;border:1px solid #ddd;text-align:left;font-weight:600;';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.style.cssText = i % 2 === 0 ? 'background:#f9f9f9;' : 'background:white;';
    Object.values(row).forEach(val => {
      const td = document.createElement('td');
      td.textContent = val;
      td.style.cssText = 'padding:6px 8px;border:1px solid #ddd;';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  tableDiv.appendChild(table);
  return tableDiv;
}

// Detectar consultas vagas que necesitan más contexto
function detectVagueQuery(txt, originalText){
  // Normalizar texto para análisis
  const normalized = normalizeText(txt);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // Patrones de consultas vagas
  const vaguePatterns = [
    // Problema genérico con sistema
    {
      pattern: /(?:tengo|hay|existe|sucede|paso|ocurre|presenta)\s+(?:un\s+)?(?:problema|error|fallo|falla|issue|bug)(?:\s+con\s+|\s+en\s+|\s+de\s+)?(c2m|customer.*meter|mdm|field|sales|service|utilities|oracle|d1|cisadm)/i,
      response: `Entiendo que tienes un problema con <strong>${getSystemName(originalText)}</strong>. 🤔

Para ayudarte mejor, cuéntame <strong>un poco más</strong>:

🔍 <strong>¿Qué estás intentando hacer?</strong>
   • Ejemplo: "Crear una orden de trabajo", "Facturar servicios", "Validar lecturas"

❌ <strong>¿Qué error o comportamiento ves?</strong>
   • Ejemplo: "Sale error de validación", "No carga la pantalla", "Datos duplicados"

📍 <strong>¿En qué módulo o pantalla?</strong>
   • Ejemplo: "Gestión de órdenes", "Facturación", "Actividades de campo"

Mientras más detalles me des, mejor podré encontrar la solución. 😊`
    },
    
    // "no funciona" + sistema
    {
      pattern: /(no\s+funciona|no\s+funcion[oó]|no\s+sirve|no\s+anda|no\s+va|no\s+carga|no\s+abre|no\s+responde)\s+(?:el\s+|la\s+)?(c2m|customer.*meter|mdm|field|sales|service|utilities|oracle|d1|cisadm)/i,
      response: `Veo que <strong>${getSystemName(originalText)}</strong> no está funcionando como esperas. 🔧

Necesito un poco más de información:

💻 <strong>¿Qué parte específicamente no funciona?</strong>
   • Ejemplo: "El módulo de facturación", "El reporte de órdenes", "La carga de lecturas"

📋 <strong>¿Qué mensaje de error aparece?</strong>
   • Copia el mensaje exacto si es posible

🕐 <strong>¿Desde cuándo pasa esto?</strong>
   • Ejemplo: "Desde hoy", "Desde ayer", "Hace una semana"

Con estos detalles puedo buscar la solución correcta. 👍`
    },
    
    // Problema genérico sin sistema específico
    {
      pattern: /^(?:tengo|hay|existe|sucede|paso|ocurre)\s+(?:un\s+)?(?:problema|error|fallo|falla|issue|bug)(?:\s+y\s+nada\s+mas)?$/i,
      response: `Entiendo que tienes un problema. 🤔 Para poder ayudarte mejor, necesito más información:

🖥️ <strong>¿En qué sistema está el problema?</strong>
   • C2M (Customer to Meter)
   • MDM (Meter Data Management)
   • Sales
   • Field Service
   • Otro

🔍 <strong>¿Qué estás intentando hacer?</strong>
   • Describe la acción o proceso

❌ <strong>¿Cuál es el error exacto que ves?</strong>
   • Mensaje de error, comportamiento inesperado, etc.

Cuéntame más detalles para encontrar la mejor solución. 😊`
    },
    
    // Consultas MUY cortas (menos de 5 palabras) con términos vagos
    {
      pattern: /^(?:ayuda|help|auxilio|socorro|problema|error|falla|fallo|bug|issue)$/i,
      response: `¡Claro que puedo ayudarte! 😊 Pero necesito saber un poco más:

❓ <strong>¿Qué necesitas?</strong>
   • ¿Tienes un problema técnico?
   • ¿Necesitas información sobre algo?
   • ¿Quieres reportar una incidencia?

🔍 <strong>Ejemplos de cómo puedes preguntarme:</strong>
   • "Tengo un error al crear órdenes en C2M"
   • "¿Cómo validar lecturas en MDM?"
   • "Error al procesar lote CM-IMFOE"
   • "Ver casos asignados a Juan Pérez"

¡Adelante, cuéntame más! 💬`
    }
  ];
  
  // Verificar cada patrón
  for(const { pattern, response } of vaguePatterns){
    if(pattern.test(originalText)){
      return response;
    }
  }
  
  // Consulta muy corta (menos de 4 palabras) que menciona solo un sistema
  if(words.length < 4){
    const sistemas = ['c2m', 'customer', 'meter', 'mdm', 'field', 'sales', 'service', 'utilities', 'oracle', 'd1', 'cisadm'];
    const mencionaSistema = sistemas.some(s => normalized.includes(s));
    
    if(mencionaSistema){
      return `Veo que mencionas <strong>${getSystemName(originalText)}</strong>. 🤔

Para ayudarte mejor:

📝 <strong>Describe tu situación con más detalle:</strong>
   • ¿Qué estás intentando hacer?
   • ¿Qué error o problema ves?
   • ¿En qué módulo o proceso estás?

💡 <strong>Ejemplo de consulta clara:</strong>
   "Tengo un error al procesar lote CM-IMFOE en C2M que genera error de sistema"

Cuéntame más y te ayudo enseguida. 😊`;
    }
  }
  
  return null; // No es vaga, continuar con procesamiento normal
}

// Extraer nombre del sistema mencionado en el texto
function getSystemName(text){
  const txt = text.toLowerCase();
  
  if(/c2m|customer.*meter/i.test(txt)) return 'C2M (Customer to Meter)';
  if(/mdm|meter.*data/i.test(txt)) return 'MDM (Meter Data Management)';
  if(/field.*service|servicio.*campo/i.test(txt)) return 'Field Service';
  if(/sales|ventas/i.test(txt)) return 'Sales';
  if(/service/i.test(txt)) return 'Service';
  if(/utilities|oracle/i.test(txt)) return 'Oracle Utilities';
  if(/d1|cisadm/i.test(txt)) return 'D1';
  
  return 'el sistema';
}

function simulateBot(userText){
  const txt = userText.toLowerCase();
  
  console.log('🤖 simulateBot llamado con:', userText);
  
  // PRIORIDAD -2: Detectar consultas VAGAS que necesitan más detalles
  const isVagueQuery = detectVagueQuery(txt, userText);
  
  if(isVagueQuery){
    console.log('💬 Consulta vaga detectada, pidiendo más detalles');
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      appendMessage('bot', isVagueQuery);
    }, 700);
    return;
  }
  
  // PRIORIDAD -1: Detectar respuestas simples primero (gracias, no, adiós)
  const isSimpleResponse = /^(gracias|muchas gracias|thank you|thanks|no|nope|nop|no gracias|adiós|adios|bye|hasta luego|nos vemos)$/i.test(txt);
  
  console.log('✨ isSimpleResponse en simulateBot:', isSimpleResponse);
  
  if(isSimpleResponse){
    console.log('💬 Procesando respuesta simple en simulateBot');
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      console.log('⏰ Timeout ejecutado, llamando botReply');
      messagesEl.removeChild(typing);
      const reply = botReply(userText);
      console.log('📨 botReply retornó:', reply);
      appendMessage('bot', reply);
    }, 700);
    return;
  }
  
  // PRIORIDAD 0: Detectar si pide ver caso(s) específico(s)
  const viewCasePattern = /(?:mu[ée]strame|mostrar|ver|dame|quiero ver|necesito ver)\s+(?:la\s+)?(?:soluci[oó]n|informaci[oó]n|detalle|datos)?\s*(?:del|al|de|a)?\s*(?:caso|ticket|registro)s?\s*(?:n[uú]mero|#)?\s*([\d\s,yalog]+)/i;
  const viewCaseMatch = txt.match(viewCasePattern);
  
  if(viewCaseMatch){
    // Extraer números de casos (pueden ser varios separados por coma, "y", "a", "o")
    const casosText = viewCaseMatch[1];
    const caseNumbers = casosText.match(/\d+/g);
    
    if(caseNumbers && caseNumbers.length > 0){
      appendMessage('bot', `🔍 Buscando información del caso${caseNumbers.length > 1 ? 's' : ''} ${caseNumbers.join(', ')}...`);
      showCaseDetails(caseNumbers);
      return;
    }
  }
  
  // PRIORIDAD 0.5: Detectar frases ambiguas sobre reportar/crear incidencias
  // Si es ambiguo, ofrecer opciones
  if(/(reportar|crear|registrar|abrir|levantar|necesito|quiero|puedo|como).*(reportar|crear|registrar|abrir|levantar).*(incidencia|incidente|problema|caso|ticket|falla|error)/i.test(txt) && !/(crear|nuevo)\s+(ticket|caso)/i.test(txt)){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      const reply = `🎫 <strong>Veo que quieres reportar algo. ¿Qué necesitas hacer?</strong>

📝 <strong>¿Quieres CREAR un nuevo ticket?</strong>
   • Escribe: "crear ticket" o "necesito crear un ticket"
   • Te guiaré paso a paso para crear tu caso

🔍 <strong>¿Quieres BUSCAR una incidencia específica?</strong>
   • Escribe: "buscar caso [número]" o "ver caso 123456"
   • O: "casos con la palabra [tu palabra clave]"
   • O: "casos asignados a [nombre del especialista]"

📊 <strong>¿Quieres ver ESTADÍSTICAS de incidencias?</strong>
   • "cuantos casos hay"
   • "casos mas frecuentes"
   • "quien atiende mas casos"

¿Cuál prefieres? 😊`;
      appendMessage('bot', reply);
    }, 700);
    return;
  }
  
  // PRIORIDAD 0.6: Detectar intención clara de crear ticket
  if(/(crear|nuevo|abrir|levantar)\s+(un\s+)?(ticket|caso|incidencia|incidente)/i.test(txt)){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      startSmartTicketCreation();
    }, 700);
    return;
  }
  
  // Detectar si es una consulta de datos con fechas específicas o análisis (NO usar aprendizaje)
  const hasSpecificDate = /\d{1,2}.*?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?\d{4}/.test(txt);
  const hasMonthQuery = /(?:mes.*de\s*)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre).*?(?:de\s*|del\s*)?\d{4}/.test(txt);
  const isOnlyNumber = lastDataContext && /^\s*\d+\s*$/.test(userText.trim()); // Detectar solo número con contexto activo
  const isDataAnalysisQuery = isOnlyNumber || /cuantos|cuántos|casos|registros|reportados|cantidad|analiz|mostrar.*datos|dame.*datos|ver.*casos|mostrar.*casos|listar.*casos|casos.*asignados|casos.*con|casos.*en|muestra.*casos|muestrame.*casos|lista.*casos|dame.*casos|promedio.*casos.*mes|casos.*por.*mes|ranking.*analistas?|ranking.*especialistas?|qui[eé]n.*m[aá]s.*casos|analista.*m[aá]s|casos.*frecuentes?|palabras.*repetitivas?|problemas.*comunes?/i.test(txt);
  
  console.log('📊 Detección de consulta:', { hasSpecificDate, hasMonthQuery, isOnlyNumber, isDataAnalysisQuery, txt });
  
  // VALIDAR ANTES DE CONTINUAR: Verificar si está fuera del alcance
  if(isOutOfScopeQuestion(userText)){
    console.log('⚠️ Pregunta fuera de alcance detectada en simulateBot');
    showOutOfScopeMessage();
    return;
  }
  
  // Detectar si es una consulta de conocimiento/asesoría (buscar en Confluence, NO usar aprendizaje)
  const isKnowledgeQuery = /(como|cómo|que es|qué es|para que|para qué|donde|dónde|cuando|cuándo|cual|cuál|por que|por qué|porque|explica|funciona|proceso|procedimiento|tutorial|guia|guía|manual|documentacion|documentación|ayuda|instrucciones|pasos|configurar|configuración|error|problema|fallo|solucion|solución|cargos facturables|facturación|factura|billing|invoice|payment|deuda|debt|gesti[oó]n|management|cuenta|account|contrato|contract|cliente|customer|medidor|meter|orden|order|servicio|service|certificado|certificate|validar|validate|corregir|correct|reportar|report|crear|create|actualizar|update|eliminar|delete|migrar|migrate)/.test(txt);
  
  console.log('🔍 isKnowledgeQuery:', isKnowledgeQuery);
  
  // Si es una consulta de conocimiento/FAQ, buscar en Confluence (sin aprendizaje)
  if(isKnowledgeQuery && txt.length > 5 && !isDataAnalysisQuery){
    console.log('➡️ Redirigiendo a searchInFAQs');
    // Buscar en Confluence para preguntas de conocimiento
    searchInFAQs(userText, null);
    return;
  }
  
  // Si es una consulta con fecha específica o de análisis de datos, NO usar aprendizaje
  if((hasSpecificDate || hasMonthQuery || isDataAnalysisQuery) && txt.length > 10){
    console.log('➡️ Verificando si es consulta de seguimiento sobre datos');
    
    // Primero verificar si es una consulta de seguimiento sobre datos ya cargados
    if(handleFollowUpDataQuery(userText)){
      console.log('✅ Consulta de seguimiento manejada');
      return;
    }
    
    console.log('➡️ Redirigiendo a processUserInput por consulta de datos');
    processUserInput(userText);
    return;
  }
  
  console.log('➡️ Continuando con procesamiento normal (aprendizaje desactivado)');
  
  // PRIORIDAD 0: Buscar en memoria de aprendizaje DESACTIVADO
  // El autoaprendizaje está desactivado - procesamiento directo
  // if(!isKnowledgeQuery && !isDataAnalysisQuery){
  //   console.log('🧠 Intentando applyLearning');
  //   applyLearning(userText).then(used => {
  //     console.log('🧠 applyLearning resultado:', used);
  //     if(used) return; // Si se usó aprendizaje, terminar aquí
  //     
  //     // Continuar con lógica normal si no hay aprendizaje relevante
  //     console.log('➡️ No se usó aprendizaje, llamando processUserInput');
  //     processUserInput(userText);
  //   });
  // } else {
  //   console.log('➡️ Llamando processUserInput directamente');
  //   // Para consultas de conocimiento/datos, ir directo a procesamiento sin aprendizaje
  //   processUserInput(userText);
  // }
  
  // Ir directo a procesamiento sin aprendizaje
  processUserInput(userText);
}

// Nueva función para procesar input normalmente
function processUserInput(userText){
  console.log('🔵 processUserInput llamado con:', userText);
  const txt = userText.toLowerCase();
  console.log('🔵 txt:', txt);
  
  // PRIORIDAD 0: Validar si la pregunta está fuera del alcance del sistema
  // Solo validar si NO está en medio de un flujo (esperando respuesta específica)
  if(!waitingForAdvisorySystem && !waitingForIncidentSystem && !reportState.step){
    if(isOutOfScopeQuestion(txt)){
      console.log('⚠️ Pregunta fuera de alcance detectada');
      showOutOfScopeMessage();
      return;
    }
  }
  
  // PRIORIDAD 0.5: Si está esperando que el usuario escriba el sistema de asesoría
  if(waitingForAdvisorySystem){
    const sistema = detectSystemFromText(txt);
    if(sistema){
      waitingForAdvisorySystem = false;
      hideOptions();
      reportState.sistema = sistema;
      appendMessage('bot', `Perfecto, has seleccionado ${sistema}. 👍`);
      askForAdvisoryTopic(sistema);
      return;
    } else if(/c2m|field|sales|service|customer.*meter|trabajo.*campo|ventas|servicio/.test(txt)){
      // El usuario mencionó un sistema pero no pudimos detectarlo claramente
      waitingForAdvisorySystem = false;
      hideOptions();
      const sistemaDetectado = /c2m|customer.*meter/.test(txt) ? 'C2M' :
                               /field|trabajo.*campo/.test(txt) ? 'FIELD' :
                               /sales|ventas/.test(txt) ? 'SALES' : 'SERVICE';
      reportState.sistema = sistemaDetectado;
      appendMessage('bot', `Entiendo que te refieres a ${sistemaDetectado}. 👍`);
      askForAdvisoryTopic(sistemaDetectado);
      return;
    }
  }
  
  // PRIORIDAD 0.6: Si está esperando que el usuario escriba el sistema de incidencia
  if(waitingForIncidentSystem){
    const sistema = detectSystemFromText(txt);
    if(sistema){
      waitingForIncidentSystem = false;
      hideOptions();
      reportState.sistema = sistema;
      appendMessage('bot', `Perfecto, has seleccionado ${sistema}. 👍`);
      
      appendMessage('bot', `Ahora describe el error o problema que tienes en ${sistema}:`);
      askForErrorDescription();
      return;
    } else if(/c2m|field|sales|service|otro|customer.*meter|trabajo.*campo|ventas|servicio/.test(txt)){
      waitingForIncidentSystem = false;
      hideOptions();
      const sistemaDetectado = /c2m|customer.*meter/.test(txt) ? 'C2M' :
                               /field|trabajo.*campo/.test(txt) ? 'FIELD' :
                               /sales|ventas/.test(txt) ? 'SALES' :
                               /servic/.test(txt) ? 'SERVICE' : 'OTRO';
      reportState.sistema = sistemaDetectado;
      appendMessage('bot', `Entiendo que te refieres a ${sistemaDetectado}. 👍`);
      appendMessage('bot', `Ahora describe el error o problema que tienes en ${sistemaDetectado}:`);
      askForErrorDescription();
      return;
    }
  }
  
  // (Módulos de C2M eliminados - ahora va directo a descripción del error)
  
  // PRIORIDAD 1: Detectar si el usuario quiere salir
  if(/^(salir|exit|cerrar|terminar|finalizar)$/i.test(txt)){
    hideOptions();
    currentOptions = [];
    
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      const finalMsg = lastJiraTicket
        ? `¡Gracias por usar nuestro servicio de soporte! Tu código de seguimiento es: ${lastJiraTicket}.\n\n✨ Esperamos verte pronto. ¡Hasta luego!`
        : '¡Gracias por usar nuestro servicio de soporte!\n\n✨ Esperamos verte pronto. ¡Hasta luego!';
      appendMessage('bot', finalMsg);
      
      // Mostrar botón para reiniciar
      setTimeout(()=>{
        const restartDiv = document.createElement('div');
        restartDiv.style.cssText = 'padding:10px 12px;text-align:center;';
        const restartBtn = document.createElement('button');
        restartBtn.textContent = '🔄 Nueva sesión';
        restartBtn.style.cssText = 'padding:10px 20px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;';
        restartBtn.addEventListener('click', ()=>location.reload());
        restartDiv.appendChild(restartBtn);
        messagesEl.parentElement.appendChild(restartDiv);
      }, 1000);
    }, 700);
    return;
  }
  
  // PRIORIDAD 1.5: Detectar solicitud de análisis de datos (conversacional o consultas directas)
  const isDataAnalysisRequest = /analicemos.*datos|analicemos.*información|analicemos.*informacion|analicemos.*archivo|revisemos.*datos|revisemos.*información|revisemos.*informacion|revisemos.*archivo|analizar.*datos|analizar.*información|analizar.*informacion|analizar.*archivo|revisar.*datos|revisar.*información|revisar.*informacion|ver.*datos|ver.*información|ver.*informacion|ver.*archivo|consultar.*datos|consultar.*información|consultar.*informacion|datos.*excel|archivos.*excel|información.*archivo|informacion.*archivo|información.*excel|informacion.*excel|estadísticas|estadisticas|quiero.*analizar|necesito.*analizar|mostrar.*datos|dame.*datos|dame.*información|dame.*informacion|anali[sz]|estadística|estadistica|reporte|dashboard|métricas|metricas|análisis.*datos|analisis.*datos/.test(txt);
  const isDataQuery = /cuántos|cuantos|cuál.*total|cual.*total|suma.*de|promedio.*de|cantidad.*de|número.*de|numero.*de|casos.*reportados|registros.*de|fechas.*entre|casos.*asignados?\s+a\s+|asignados?\s+a\s+|muestra.*casos|muestrame.*casos|ver.*casos|lista.*casos|listar.*casos|dame.*casos|mostrar.*casos|promedio.*casos.*mes|casos.*por.*mes|ranking.*analistas?|ranking.*especialistas?|qui[eé]n.*m[aá]s.*casos|analista.*m[aá]s|casos.*frecuentes?|palabras.*repetitivas?|problemas.*comunes?/i.test(txt);
  
  // Detectar si es una pregunta ANALÍTICA (estadísticas, agregaciones, análisis temporal, métricas de analistas)
  const isAnalyticalQuery = /temas?.*mayor.*n[uú]mero|asuntos?.*m[aá]s.*frecuentes?|mayor.*cantidad|m[aá]s.*casos|m[aá]s.*frecuentes?|top.*\d+|ranking|cu[aá]ntos?.*por|casos?.*por.*estado|casos?.*por.*tema|casos?.*por.*aplicaci[oó]n|casos?.*por.*funcionalidad|funcionalidad.*comercial.*mayor|especialistas?.*m[aá]s|distribuci[oó]n|cerrados?.*en|creados?.*en|abiertos?.*en|registrados?.*en|durante.*\d{4}|en.*enero|en.*febrero|en.*marzo|en.*abril|en.*mayo|en.*junio|en.*julio|en.*agosto|en.*septiembre|en.*octubre|en.*noviembre|en.*diciembre|mes.*de|año.*\d{4}|año.*20\d{2}|por.*mes|por.*a[ñn]o|tendencia.*temporal|evoluci[oó]n.*casos|qui[eé]n.*es.*analista|qui[eé]n.*cerr[oó]|qui[eé]n.*atendi[oó]|analista.*m[aá]s.*casos|especialista.*m[aá]s.*casos|casos.*asignados.*a|en.*espera.*por|pendiente.*por.*cliente|requiere.*cambio|pendiente.*por.*usuario|casos.*abiertos.*por.*analista|productividad.*analista|cu[aá]ntos?.*casos?.*tienen.*estado|cu[aá]ntos?.*casos?.*est[aá]n?.*en.*estado|cu[aá]ntos?.*casos?.*se.*encuentra.*estado|casos?.*con.*estado|casos?.*estado.*cerrado|casos?.*estado.*abierto|casos?.*estado.*pendiente|casos?.*estado.*resuelto|tienen.*estado.*cerrado|est[aá]n?.*en.*estado.*cerrado|se.*encuentra.*en.*estado|cu[aá]les?.*fueron.*los.*casos|cu[aá]les?.*son.*los.*casos|problemas?.*m[aá]s.*comunes?|temas?.*recurrentes?|frecuencia.*de.*casos/i.test(txt);
  
  console.log('🔍 isDataAnalysisRequest:', isDataAnalysisRequest);
  console.log('🔍 isDataQuery:', isDataQuery);
  console.log('🔍 isAnalyticalQuery:', isAnalyticalQuery);
  
  if(isDataAnalysisRequest || isDataQuery){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      hideOptions();
      
      // Si es una pregunta ANALÍTICA, usar IA
      if(isAnalyticalQuery){
        handleAnalyticalQueryWithAI(userText);
      }
      // Si es una pregunta específica normal, análisis tradicional
      else if(isDataQuery){
        autoAnalyzeDataQuery(userText);
      }else{
        handleDataAnalysisRequest();
      }
    }, 700);
    return;
  }
  
  // PRIORIDAD 2: Detectar preguntas con signos de interrogación - BUSCAR EN FAQs PRIMERO
  const isQuestionMark = userText.includes('¿') || userText.includes('?');
  const mentionsTechnicalTerms = /c2m|field|sales|service|factura|medidor|orden|cliente|reporte|financiación|financiacion|dian|migra|cuenta|contrato|validar|corregir|reportar|configurar|crear|eliminar|actualizar/.test(txt);
  
  if(isQuestionMark && (mentionsTechnicalTerms || userText.length > 20)){
    // Es una pregunta con ? o ¿ y menciona términos técnicos - buscar en FAQs
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Déjame buscar esa información en nuestras preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // PRIORIDAD 3: Detectar "tengo un problema" y buscar en la base de conocimiento primero
  const hasProblemPattern = /tengo.*problema|tengo.*error|tengo.*fallo|tengo.*issue|tengo.*dificultad|no puedo|no funciona|me sale.*error/.test(txt);
  
  if(hasProblemPattern){
    // Extraer el sistema mencionado si existe
    let sistema = null;
    let searchTerm = userText;
    
    if(/c2m|customer.*meter/.test(txt)) {
      sistema = 'C2M';
    } else if(/field|campo/.test(txt)) {
      sistema = 'FIELD';
    } else if(/sales|ventas/.test(txt)) {
      sistema = 'SALES';
    } else if(/service|servicio/.test(txt)) {
      sistema = 'SERVICE';
    }
    
    // Guardar el sistema en reportState para usar después si es necesario
    if(sistema) {
      reportState.sistema = sistema;
      searchTerm = `${sistema} ${userText}`;
    }
    
    // Mostrar typing indicator
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      const sistemaMsg = sistema ? ` con ${sistema}` : '';
      appendMessage('bot', `Entiendo que tienes un problema${sistemaMsg}. Déjame buscar soluciones en nuestra base de conocimiento...`);
      
      // Buscar en la base de conocimiento
      searchKnowledgeBaseForProblem(searchTerm, sistema);
    }, 700);
    return;
  }
  
  // Detectar solo "reportar incidencia" directo sin buscar en KB
  const shouldReportIncidentDirect = /reportar.*incidencia|crear.*ticket|abrir.*caso|nueva.*solicitud/.test(txt);
  
  if(shouldReportIncidentDirect){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      appendMessage('bot', 'Perfecto, vamos a crear un reporte de incidencia para ti.');
      hideOptions();
      handleReportIncident();
    }, 700);
    return;
  }
  
  // Detectar solicitud de asesoría
  const isAdvisoryRequest = /asesoría|asesoria|consulta|consultoria|consultoría|quiero aprender|necesito información|capacitación|capacitacion|tutorial|guía|guia|orientación|orientacion/.test(txt);
  
  if(isAdvisoryRequest){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      hideOptions();
      handleAdvisoryRequest();
    }, 700);
    return;
  }
  
  // Detectar preguntas sobre "cómo hacer algo" (sin signos de interrogación) y buscar automáticamente
  const isHowToQuestion = /cómo|como.*hacer|como.*crear|como.*configurar|como.*usar|como.*funciona|pasos.*para|proceso.*para/.test(txt);
  const mentionsSystems = /c2m|field|sales|service|factura|medidor|orden|cliente/.test(txt);
  
  if(isHowToQuestion && mentionsSystems){
    // El usuario pregunta "cómo hacer X en sistema Y" (sin ?) - buscar en FAQs
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Entiendo que quieres saber sobre eso. Primero revisaré las preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // Detectar menciones específicas de temas técnicos (sin decir "tengo problema")
  const isTechnicalQuery = /factura|facturación|medidor|medidores|lectura|orden.*trabajo|instalación|configurar|sincronizar|integración|reporte|dashboard|cargo|pago|consumo|tarifa/.test(txt) &&
                           userText.length > 15; // Mínimo 15 caracteres para evitar palabras sueltas
  
  if(isTechnicalQuery && !/(hola|gracias|ayuda|salir)/i.test(txt)){
    // El usuario menciona un tema técnico específico - buscar en FAQs primero
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.textContent = '...';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      
      // Detectar el sistema si se menciona
      let sistema = null;
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      appendMessage('bot', `Veo que preguntas sobre un tema específico. Primero verificaré en las preguntas frecuentes...`);
      searchInFAQs(userText, sistema);
    }, 700);
    return;
  }
  
  // show a typing indicator
  const typing = document.createElement('div');
  typing.className = 'message bot';
  typing.textContent = '...';
  typing.classList.add('typing');
  messagesEl.appendChild(typing);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  setTimeout(()=>{
    messagesEl.removeChild(typing);
    const reply = botReply(userText);
    
    // Si la respuesta indica que va a buscar, hacer la búsqueda real
    if(/buscar.*información|déjame buscar/i.test(reply)){
      console.log('🔍 botReply indica búsqueda, ejecutando searchInFAQs');
      
      // Detectar el sistema si se menciona
      let sistema = null;
      const txt = userText.toLowerCase();
      if(/c2m/.test(txt)) sistema = 'C2M';
      else if(/field/.test(txt)) sistema = 'FIELD';
      else if(/sales|ventas/.test(txt)) sistema = 'SALES';
      else if(/service|servicio/.test(txt)) sistema = 'SERVICE';
      
      if(sistema) reportState.sistema = sistema;
      
      // Ejecutar la búsqueda real
      searchInFAQs(userText, sistema);
      return;
    }
    
    // Si no, mostrar el mensaje normal
    appendMessage('bot', reply);
    
    // Si la respuesta es sobre capacidades, mostrar opciones para probar funcionalidades
    if(/qué puedes|que puedes|qué sabes|que sabes|qué haces|que haces|capacidades|funciones|ayuda|help|para qué sirves|para que sirves/i.test(userText)){
      setTimeout(() => {
        appendMessage('bot', '¿Qué funcionalidad te gustaría probar ahora?');
        showOptions([
          { label: '🔍 Buscar en FAQs', value: 'faq' },
          { label: '📊 Analizar datos Excel', value: 'data' },
          { label: '🎫 Reportar incidencia', value: 'incident' },
          { label: '💬 Solicitar asesoría', value: 'advisory' },
          { label: '📚 Ver memoria de aprendizaje', value: 'learning' }
        ], (choice) => {
          hideOptions();
          if(choice === 'faq'){
            appendMessage('user', 'Buscar en FAQs');
            appendMessage('bot', '¿Qué pregunta tienes? Puedes escribir algo como "¿Cómo crear un medidor en C2M?"');
          } else if(choice === 'data'){
            appendMessage('user', 'Analizar datos Excel');
            handleDataAnalysisRequest();
          } else if(choice === 'incident'){
            appendMessage('user', 'Reportar incidencia');
            handleReportIncident();
          } else if(choice === 'advisory'){
            appendMessage('user', 'Solicitar asesoría');
            handleAdvisoryRequest();
          } else if(choice === 'learning'){
            appendMessage('user', 'Ver memoria de aprendizaje');
            appendMessage('bot', '🧠 Mi memoria de aprendizaje contiene todas las conversaciones previas que me han ayudado a mejorar. Puedes acceder al panel administrativo en:');
            appendMessage('bot', '<a href="/admin-learning.html" target="_blank" style="color:#2563eb;text-decoration:underline;">📊 Panel de Administración de Aprendizaje</a>');
            appendMessage('bot', '¿Hay algo más en lo que pueda ayudarte?');
          }
        });
      }, 800);
    }
  }, 700 + Math.min(1200, userText.length * 40));
}

// handle suggestion button clicks (delegation)
const suggestionsEl = document.getElementById('suggestions');
if(suggestionsEl){
  suggestionsEl.addEventListener('click', (ev)=>{
    const btn = ev.target.closest('button[data-text]');
    if(!btn) return;
    const text = btn.getAttribute('data-text');
    if(!text) return;
    // Check if this is the "report incident" button
    if(text.includes('Quiero reportar')) {
      hideOptions();
      handleReportIncident();
    }else{
      // simulate sending the suggested text
      appendMessage('user', text);
      simulateBot(text);
    }
  });
}

inputForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const text = messageInput.value.trim();
  if(!text) return;
  
  const txt = text.toLowerCase();
  
  // Detectar comandos especiales que siempre deben procesarse
  const isSpecialCommand = /^(salir|exit|cerrar|terminar|finalizar)$/i.test(text) ||
                          /reportar.*incidencia|quiero reportar|tengo.*problema|error.*sistema|error.*c2m|problema.*c2m|fallo.*c2m/.test(txt);
  
  // Si hay opciones activas pero el usuario escribe un comando especial, procesarlo
  if(currentOptions.length > 0 && isSpecialCommand){
    hideOptions();
    appendMessage('user', text);
    messageInput.value = '';
    simulateBot(text);
    return;
  }
  
  // Si hay opciones activas y NO es comando especial, sugerir pero permitir continuar
  if(currentOptions.length > 0){
    appendMessage('user', text);
    messageInput.value = '';
    
    // Definir txt ANTES de usarlo en processUserResponse
    const txt = text.toLowerCase().trim();
    
    // Procesar la respuesta del usuario para ver si responde a las opciones
    const processUserResponse = ()=>{
      // Primero, intentar buscar un botón que coincida con el texto escrito
      const buttons = Array.from(optionsContainer.querySelectorAll('button'));
      
      // Buscar coincidencia exacta o parcial con el texto del botón
      const matchingBtn = buttons.find(btn => {
        const btnText = btn.textContent.toLowerCase().trim();
        const userInput = txt.trim();
        
        // Coincidencia exacta
        if(btnText === userInput) return true;
        
        // Coincidencia parcial (el texto del botón contiene lo que escribió el usuario)
        if(btnText.includes(userInput)) return true;
        
        // El usuario escribió algo que está en el botón
        if(userInput.includes(btnText)) return true;
        
        // Casos específicos de sistemas
        if(/c2m|customer.*meter/i.test(userInput) && /c2m/i.test(btnText)) return true;
        if(/field|campo/i.test(userInput) && /field/i.test(btnText)) return true;
        if(/sales|ventas/i.test(userInput) && /sales|ventas/i.test(btnText)) return true;
        if(/service|servicio/i.test(userInput) && /service|servicio/i.test(btnText)) return true;
        
        // Casos específicos de módulos C2M
        if(/actividades.*campo|campo/i.test(userInput) && /actividades.*campo/i.test(btnText)) return true;
        if(/facturaci[oó]n|billing/i.test(userInput) && /facturaci[oó]n/i.test(btnText)) return true;
        if(/reportes?|reports?/i.test(userInput) && /reportes?/i.test(btnText)) return true;
        
        return false;
      });
      
      if(matchingBtn) {
        matchingBtn.click();
        return true;
      }
      
      // Detectar respuestas afirmativas o negativas
      if(/^(si|sí|yes|ok|dale|claro|afirmativo|crear ticket|quiero)$/i.test(txt)){
        // Simular clic en la primera opción afirmativa
        const yesBtn = buttons.find(btn => /sí|yes|crear/i.test(btn.textContent));
        if(yesBtn) {
          yesBtn.click();
          return true;
        }
      }
      if(/^(no|nop|nope|gracias|no gracias|cancelar)$/i.test(txt)){
        // Simular clic en la opción negativa
        const noBtn = buttons.find(btn => /no/i.test(btn.textContent) && !/volver/i.test(btn.textContent));
        if(noBtn) {
          noBtn.click();
          return true;
        }
      }
      return false;
    };
    
    // Intentar procesar como respuesta a opciones
    if(processUserResponse()){
      console.log('✅ Respuesta procesada como opción');
      return;
    }
    
    console.log('❌ No se procesó como opción, continuando...');
    
    // Si no es respuesta a opciones, verificar si es un mensaje simple (gracias, adiós, etc.)
    // txt ya está definido arriba
    const isSimpleResponse = /^(gracias|muchas gracias|thank you|thanks|no|nope|nop|no gracias|adiós|adios|bye|hasta luego|nos vemos)$/i.test(txt);
    
    console.log('isSimpleResponse:', isSimpleResponse, 'text:', text);
    
    // Agregar mensaje del usuario
    appendMessage('user', text);
    messageInput.value = '';
    
    if(isSimpleResponse){
      console.log('🎯 Procesando respuesta simple');
      // Para respuestas simples, no agregar mensaje intermedio
      hideOptions(); // Ocultar opciones si las hay
      simulateBot(text);
      return;
    }
    
    console.log('📝 Procesando como mensaje normal');
    // Para otros casos, agregar mensaje intermedio
    appendMessage('bot', 'Entiendo. Déjame ayudarte con eso...');
    simulateBot(text);
    return;
  }
  
  console.log('🔹 Procesando sin opciones activas');
  appendMessage('user', text);
  messageInput.value = '';
  simulateBot(text);
});

// initial greeting
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    appendMessage('bot','¡Hola! 👋 Soy tu asistente de soporte Oracle. Puedo ayudarte con:');
    appendMessage('bot','• Buscar información en FAQs y casos históricos<br>• Asesorarte sobre sistemas (C2M, FIELD, SALES, SERVICE)<br>• Reportar incidencias<br>• Analizar datos de archivos Excel');
    appendMessage('bot','¿En qué puedo ayudarte hoy?');
  }, 300);
});
