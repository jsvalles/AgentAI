const messagesEl = document.getElementById('messages');
const inputForm = document.getElementById('inputForm');
const messageInput = document.getElementById('messageInput');
const optionsContainer = document.getElementById('optionsContainer');
const translateToggle = document.getElementById('translateToggle');

let reportState = { step: null, sistema: null, modulo: null };
let lastJiraTicket = null; // Guardar el código del último ticket creado
let currentOptions = []; // Opciones actuales disponibles
let stateHistory = []; // Historial para volver atrás
let conversationHistory = []; // Historial de conversación para contexto de IA
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

// ============================================
// TYPING INDICATOR - Función auxiliar reutilizable
// ============================================
let currentTypingIndicator = null;

function showTypingIndicator() {
  // Si ya hay uno, no crear otro
  if (currentTypingIndicator) return currentTypingIndicator;
  
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.innerHTML = '<span></span><span></span><span></span>';
  
  messagesEl.appendChild(indicator);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  
  currentTypingIndicator = indicator;
  return indicator;
}

function removeTypingIndicator() {
  if (currentTypingIndicator && currentTypingIndicator.parentNode) {
    currentTypingIndicator.parentNode.removeChild(currentTypingIndicator);
  }
  currentTypingIndicator = null;
}

// ============================================
// TYPEWRITER EFFECT - Efecto de escritura progresiva
// ============================================
function typewriterEffect(element, text, speed = 15) {
  return new Promise((resolve) => {
    let index = 0;
    element.innerHTML = '';
    
    // Si el texto contiene HTML, mostrarlo completo de una vez
    if (text.includes('<p') || text.includes('<h2') || text.includes('<div')) {
      element.innerHTML = text;
      resolve();
      return;
    }
    
    function typeChar() {
      if (index < text.length) {
        element.innerHTML += text.charAt(index);
        index++;
        messagesEl.scrollTop = messagesEl.scrollHeight;
        setTimeout(typeChar, speed);
      } else {
        resolve();
      }
    }
    
    typeChar();
  });
}

// Función para validar si la pregunta está relacionada con el dominio de la aplicación
function isRelatedToApplicationDomain(text){
  const normalized = normalizeText(text);
  
  // Palabras clave relacionadas con el dominio de Oracle Utilities
  const domainKeywords = [
    // Sistemas
    'c2m', 'customer', 'meter', 'field', 'sales', 'service', 'oracle', 'utilities',
    'mdm', 'd1', 'ccb', 'sgg', 'smart grid gateway', 'head end system', 'hes',
    
    // Términos técnicos C2M (IDs y códigos)
    'niu', 'cups', 'account', 'premise', 'sp', 'service point', 'punto de suministro',
    'sa', 'service agreement', 'billing', 'bill segment', 'person', 'measurement',
    'device', 'meter configuration', 'register', 'tou', 'vee', 'inicial', 'index',
    
    // Módulos y funcionalidades
    'medidor', 'medidores', 'lectura', 'lecturas', 'instalacion', 'dispositivo',
    'contrato', 'contratos', 'cliente', 'clientes', 'facturacion', 'factura',
    'cargo', 'cargos', 'tarifa', 'tarifas', 'consumo', 'consumos',
    'orden', 'ordenes', 'trabajo', 'servicio', 'tecnico',
    'venta', 'ventas', 'prospecto', 'lead', 'cotizacion',
    'comunicacion', 'comunicaciones', 'actividad', 'actividades',
    'saliente', 'entrante', 'salientes', 'entrantes',
    
    // Términos de medición
    'medicion', 'mediciones', 'medida', 'medidas', 'measurement',
    'condicion', 'condiciones', 'condition', 'conditions',
    'tipo', 'tipos', 'type', 'types',
    'estado', 'estados', 'status', 'state',
    'valor', 'valores', 'value', 'values',
    'lista', 'listas', 'list', 'lists',
    'catalogo', 'catalogos', 'catalog', 'catalogs',
    'parametro', 'parametros', 'parameter', 'parameters',
    'campo', 'campos', 'field', 'fields',
    'atributo', 'atributos', 'attribute', 'attributes',
    'propiedad', 'propiedades', 'property', 'properties',
    'caracteristica', 'caracteristicas', 'characteristic', 'characteristics',
    
    // Términos técnicos
    'configuracion', 'integracion', 'interfaz', 'api', 'webservice',
    'batch', 'proceso', 'algoritmo', 'regla', 'validacion', 'estimacion',
    'business object', 'bo',
    'factor de perfil', 'tipo de dia', 'misma fecha anterior',
    'sincronizacion', 'mapeo', 'transformacion', 'parser',
    
    // Acciones relacionadas
    'ticket', 'caso', 'incidencia', 'incidente', 'error', 'problema', 'fallo',
    'bug', 'reporte', 'reportar', 'consulta', 'consultar', 'asesoria',
    'ayuda', 'soporte', 'documentacion', 'manual', 'guia',
    
    // Términos de búsqueda válidos
    'como', 'configurar', 'instalar', 'crear', 'modificar', 'eliminar',
    'buscar', 'encontrar', 'ver', 'mostrar', 'listar', 'obtener',
    'cual', 'cuales', 'donde', 'cuando', 'porque', 'para que',
    'flujo', 'diagrama', 'diagrama de flujo', 'proceso', 'workflow', 'flowchart',
    
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

  // Prioridad alta: si parece consulta técnica de VEE/BO, nunca marcar fuera de alcance
  const isTechnicalNameQuery = /\b(c[oó]mo\s+se\s+llama|nombre|business\s*object|\bbo\b|regla\s+de\s+estimaci[oó]n|regla\s+de\s+validaci[oó]n)\b/i.test(text);
  const veeRuleType = detectSpecificVeeRule(text);
  if (isTechnicalNameQuery || veeRuleType) {
    console.log('✅ Consulta técnica VEE/BO detectada - NO fuera de alcance');
    return false;
  }
  
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
  
  // Si hay un contexto de datos activo y el usuario escribe solo un número, es válido
  if(lastDataContext && /^\s*\d+\s*$/.test(text.trim())){
    console.log('✅ Número detectado con contexto de datos activo');
    return false;
  }
  
  // No bloquear por falta de keywords del dominio para evitar falsos positivos
  // en consultas técnicas cortas (ej: "que significan las siglas UOM?").
  const hasDomainKeywords = isRelatedToApplicationDomain(text);
  if(!hasDomainKeywords){
    console.log('ℹ️ Sin keywords de dominio: se permite y continúa validación por patrones realmente fuera de alcance');
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
    /actriz/,

    // Texto sin sentido evidente
    /^[\W_]{4,}$/,
    /^(asdf|qwerty|zxcv|1234|0000|aaaa|bbbb)\b/i
  ];
  
  // Verificar si coincide con algún patrón específico
  return outOfScopePatterns.some(pattern => pattern.test(normalized));
}

// Función para mostrar mensaje de pregunta fuera de alcance
function showOutOfScopeMessage(){
  const messages = [
    "⚠️ Lo siento, esa pregunta está fuera del propósito de esta aplicación.",
    "🎯 Estoy diseñado para ayudarte con:<br>" +
    "• <strong>Consultas</strong> sobre Oracle Utilities (C2M, MDM/SGG, FIELD, SALES, SERVICE)<br>" +
    "• <strong>Diagramas y flujos</strong> de procesos técnicos (ej. Smart Grid Gateway)<br>" +
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

// ============================================
// LOADING INDICATOR PROFESIONAL
// ============================================
let loadingCounter = 0;

function appendLoadingIndicator() {
  const loadingId = `loading-${++loadingCounter}`;
  const el = document.createElement('div');
  el.className = 'loading-indicator';
  el.id = loadingId;
  el.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="loading-text">Analizando con AI-Assisted Support Agent</div>
  `;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return loadingId;
}

function removeLoadingIndicator(loadingId) {
  const el = document.getElementById(loadingId);
  if (el) {
    el.remove();
  }
}

function appendMessage(kind, text, useTypewriter = 'auto'){
  const el = document.createElement('div');
  el.className = 'message ' + (kind === 'user' ? 'user' : 'bot');
  
  // PASO 0: POST-PROCESAMIENTO MINIMALISTA (mismo que backend)
  if (kind !== 'user') {
    // SOLO términos técnicos fragmentados (AS/AR)
    text = text.replace(/(AS|AR)\s*\n+\s*-\s*\n+\s*(Active\s+(?:Supply|Received))/gi, '$1 - $2');
    text = text.replace(/(AS|AR)\s*\n+\s*-\s*(Active\s+(?:Supply|Received))/gi, '$1 - $2');
    
    // Reducir saltos múltiples excesivos (más de 2) pero MANTENER dobles
    text = text.replace(/\n{4,}/g, '\n\n');
    
    // Restaurar separadores
    text = text.replace(/\n\n-{3,}/g, '\n\n---');
    
    // FIN - NO MÁS REGLAS. Dejar estructura natural.
  }
  
  // PASO 1: Procesar diagramas Mermaid PRIMERO (convierte ```mermaid a <div class="mermaid">)
  text = processMermaidDiagrams(text);
  
  // PASO 2: Para mensajes del bot, convertir Markdown a HTML (parseador simple que respeta HTML)  
  if (kind !== 'user') {
    text = parseMarkdownSimple(text);
  }
  
  // Decidir si usar typewriter automáticamente
  let shouldUseTypewriter = false;
  if (useTypewriter === 'auto' && kind === 'bot') {
    // Usar typewriter si:
    // - El texto tiene HTML generado por backend (respuestas completas de AI)
    // - La respuesta contiene párrafos estructurados
    const hasComplexHTML = text.includes('<p') || text.includes('<h2');
    shouldUseTypewriter = hasComplexHTML;
  } else if (useTypewriter === true) {
    shouldUseTypewriter = true;
  }
  
  // Si no usa typewriter, agregar contenido normalmente
  if (!shouldUseTypewriter || kind === 'user') {
    el.innerHTML = text;
    messagesEl.appendChild(el);
    wireDiagramActionButtons(el);
  } else {
    // Usar efecto typewriter para respuestas del bot
    messagesEl.appendChild(el);
    
    // NUEVO: Mostrar HTML formateado progresivamente manteniendo la estructura
    el.innerHTML = text;
    el.style.opacity = '0';
    
    // Extraer todos los elementos de primer nivel (párrafos, headings, etc.)
    const children = Array.from(el.children);
    
    // Ocultar todos los elementos inicialmente
    children.forEach(child => {
      child.style.opacity = '0';
      child.style.transition = 'none';
    });
    
    // Mostrar el contenedor
    el.style.opacity = '1';
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    // Revelar cada elemento con efecto rápido
    let delay = 0;
    const revealSpeed = 150; // ms entre cada párrafo/sección
    
    children.forEach((child, index) => {
      setTimeout(() => {
        child.style.transition = 'opacity 0.2s ease-in';
        child.style.opacity = '1';
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }, delay);
      delay += revealSpeed;
    });

    wireDiagramActionButtons(el);
    
    // Los diagramas ya se muestran como imágenes de mermaid.ink, no necesitan renderizado
    
    return; // Salir temprano porque typewriter maneja el resto
  }
  
  // Los diagramas se generan como imágenes, no necesitan renderizado client-side
  }
  
  // Guardar en historial de conversación para contexto de IA
  conversationHistory.push({
    role: kind === 'user' ? 'user' : 'assistant',
    content: text.replace(/<[^>]*>/g, '').substring(0, 500) // Remover HTML y limitar a 500 chars
  });
  
  // Mantener solo los últimos 20 mensajes para no saturar
  if(conversationHistory.length > 20){
    conversationHistory = conversationHistory.slice(-20);
  }
  
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
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Parseador simple de Markdown que respeta HTML existente
function parseMarkdownSimple(text) {
  if (!text) return text;
  
  // Si el texto ya contiene HTML (tiene tags <p> o <h2>), retornarlo directamente
  if (text.includes('<p') || text.includes('<h2') || text.includes('<h3')) {
    return text;
  }
  
  // Proteger bloques HTML (como <div class="mermaid">)
  const htmlBlocks = [];
  text = text.replace(/(<div[^>]*>[\s\S]*?<\/div>)/g, (match) => {
    const placeholder = `__HTML_BLOCK_${htmlBlocks.length}__`;
    htmlBlocks.push(match);
    return placeholder;
  });
  
  // NUEVA ESTRATEGIA: Dividir primero en bloques separados por líneas vacías
  // Esto garantiza que cada bloque se convierta en un elemento HTML separado
  const blocks = text.split(/\n\s*\n+/);  // Dividir por una o más líneas vacías
  const htmlParts = [];
  
  for (let block of blocks) {
    const trimmedBlock = block.trim();
    
    if (trimmedBlock === '') continue;  // Saltar bloques vacíos
    
    // Título H1 (#)
    if (trimmedBlock.match(/^#\s+(.+)/) && !trimmedBlock.match(/^#{2,}/)) {
      const titleText = trimmedBlock.replace(/^#\s+/, '');
      htmlParts.push(`<h1 style="margin-top:24px;margin-bottom:12px;font-size:20px;font-weight:600;color:#1a1a1a;">${titleText}</h1>`);
      continue;
    }
    
    // Título H2 (##)
    if (trimmedBlock.match(/^##\s+(.+)/)) {
      const titleText = trimmedBlock.replace(/^##\s+/, '');
      htmlParts.push(`<h2 style="margin-top:20px;margin-bottom:10px;font-size:18px;font-weight:600;color:#1a1a1a;">${titleText}</h2>`);
      continue;
    }
    
    // Título H3 (###)
    if (trimmedBlock.match(/^###\s+(.+)/)) {
      const titleText = trimmedBlock.replace(/^###\s+/, '');
      htmlParts.push(`<h3 style="margin-top:15px;margin-bottom:8px;font-size:16px;font-weight:600;color:#333;">${titleText}</h3>`);
      continue;
    }
    
    // Separador (---)
    if (trimmedBlock.match(/^-{3,}$/)) {
      htmlParts.push('<hr style="margin:16px 0;border:none;border-top:1px solid #ddd;">');
      continue;
    }
    
    // Lista (varias líneas que empiezan con - o *)
    if (trimmedBlock.match(/^[\s]*[-*]\s+/m)) {
      const listItems = trimmedBlock.split('\n')
        .filter(line => line.match(/^[\s]*[-*]\s+/))
        .map(line => {
          const content = line.replace(/^[\s]*[-*]\s+/, '');
          return `<li style="margin:4px 0;">${content}</li>`;
        })
        .join('');
      
      htmlParts.push(`<ul style="margin:10px 0;padding-left:20px;">${listItems}</ul>`);
      continue;
    }
    
    // Párrafo normal - reemplazar saltos de línea internos por espacios
    let paragraphText = trimmedBlock.replace(/\n/g, ' ');
    
    // Procesar negrita (**texto**)
    paragraphText = paragraphText.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Agregar como párrafo
    htmlParts.push(`<p style="margin:16px 0;line-height:1.75;color:#374151;">${paragraphText}</p>`);
  }
  
  text = htmlParts.join('');
  
  // Restaurar bloques HTML
  htmlBlocks.forEach((block, i) => {
    text = text.replace(`__HTML_BLOCK_${i}__`, block);
  });
  
  return text;
}

// Procesar bloques de código Mermaid y convertirlos a diagramas renderizables
function processMermaidDiagrams(text) {
  // Detectar bloques ```mermaid ... ```
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/gi;
  
  let processedText = text;
  let match;
  let diagramCount = 0;
  
  while((match = mermaidRegex.exec(text)) !== null) {
    diagramCount++;
    const diagramCode = normalizeMermaidCode(match[1]);
    
    // Validar sintaxis Mermaid básica
    const validationError = validateMermaidSyntax(diagramCode);
    
    let diagramHtml;
    if(validationError) {
      // Si hay error, mostrar mensaje amigable
      diagramHtml = `<div style="background:#ffe0e0;border:2px solid #cc0000;border-radius:8px;padding:12px;margin:12px 0;font-family:monospace;font-size:12px;color:#660000;">
        <strong>⚠️ Error en diagrama Mermaid:</strong><br>
        ${validationError}<br><br>
        <small>💡 Verifica sintaxis básica Mermaid (ej: flowchart TD, A[Inicio] --> B[Fin])</small>
      </div>`;
    } else {
      // Generar imagen usando Mermaid.ink API
      const escapedCode = escapeHtmlAttribute(diagramCode);
      
      // Codificar código Mermaid en base64 para la URL
      let base64Code;
      try {
        base64Code = btoa(unescape(encodeURIComponent(diagramCode)));
      } catch(e) {
        console.error('Error codificando Mermaid a base64:', e);
        base64Code = btoa(diagramCode);
      }
      
      // URL de la imagen generada por Mermaid.ink
      const imageUrl = `https://mermaid.ink/img/${base64Code}`;
      const svgUrl = `https://mermaid.ink/svg/${base64Code}`;
      
      diagramHtml = `<div class="diagram-card" style="border:1px solid #d7dee8;border-radius:10px;background:#f8fafc;margin:12px 0;overflow:hidden;">
        <div class="diagram-actions" style="display:flex;gap:8px;justify-content:space-between;align-items:center;padding:8px 10px;background:#eef2f7;border-bottom:1px solid #d7dee8;">
          <span style="font-size:11px;color:#64748b;">📊 Diagrama de flujo</span>
          <div style="display:flex;gap:8px;">
            <button type="button" class="diagram-copy-btn" data-mermaid-source="${escapedCode}" style="border:1px solid #cbd5e1;background:#fff;border-radius:6px;padding:5px 8px;font-size:12px;cursor:pointer;">Copiar código</button>
            <a href="${svgUrl}" target="_blank" style="border:1px solid #059669;background:#059669;color:#fff;border-radius:6px;padding:5px 8px;font-size:12px;text-decoration:none;display:inline-block;">Descargar SVG</a>
            <button type="button" class="diagram-whimsical-btn" data-mermaid-source="${escapedCode}" style="border:1px solid #0f766e;background:#0f766e;color:#fff;border-radius:6px;padding:5px 8px;font-size:12px;cursor:pointer;">Editar en Whimsical</button>
          </div>
        </div>
        <div style="display:flex;justify-content:center;background:#fff;padding:20px;overflow-x:auto;">
          <img src="${imageUrl}" alt="Diagrama Mermaid" style="max-width:100%;height:auto;border-radius:4px;" onerror="this.onerror=null;this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22100%22%3E%3Ctext x=%2220%22 y=%2250%22 font-family=%22Arial%22 font-size=%2214%22%3E⚠️ Error cargando diagrama%3C/text%3E%3C/svg%3E';" />
        </div>
      </div>`;
    }
    
    processedText = processedText.replace(match[0], diagramHtml);
  }
  
  return processedText;
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function decodeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temp = document.createElement('textarea');
  temp.value = text;
  temp.style.position = 'fixed';
  temp.style.opacity = '0';
  document.body.appendChild(temp);
  temp.focus();
  temp.select();
  document.execCommand('copy');
  temp.remove();
}

function wireDiagramActionButtons(scopeEl) {
  if (!scopeEl) return;

  const copyButtons = scopeEl.querySelectorAll('.diagram-copy-btn');
  copyButtons.forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const code = decodeHtmlAttribute(btn.getAttribute('data-mermaid-source') || '');
      try {
        await copyTextToClipboard(code);
        btn.textContent = 'Copiado';
        setTimeout(() => {
          btn.textContent = 'Copiar Mermaid';
        }, 1200);
      } catch (err) {
        console.error('No se pudo copiar Mermaid:', err);
      }
    });
  });

  const whimsicalButtons = scopeEl.querySelectorAll('.diagram-whimsical-btn');
  whimsicalButtons.forEach((btn) => {
    if (btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const code = decodeHtmlAttribute(btn.getAttribute('data-mermaid-source') || '');
      try {
        await copyTextToClipboard(code);
      } catch (err) {
        console.warn('No se pudo copiar automáticamente el diagrama antes de abrir Whimsical:', err);
      }
      window.open('https://whimsical.com/ai/ai-text-to-flowchart', '_blank', 'noopener');
    });
  });
}

function normalizeMermaidCode(rawCode) {
  if(!rawCode || typeof rawCode !== 'string') {
    return '';
  }

  let code = rawCode
    .replace(/\r/g, '')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\u00A0/g, ' ')
    .trim();

  // Normalizar flechas: ---> o ----> a -->
  code = code.replace(/---+>/g, '-->');

  // DETECTAR SI TODO ESTÁ EN UNA SOLA LÍNEA (problema común del AI)
  const hasNewlines = code.includes('\n');
  const isFlowchart = /\b(flowchart|graph)\s+\w+/i.test(code);
  
  if(!hasNewlines && isFlowchart) {
    console.log('⚠️ Mermaid en una línea - separando nodos y conexiones...');
    
    // Separar por espacios estratégicamente antes de IDs de nodos
    // flowchart TD A[x] B[y] A --> B  =>  flowchart TD\nA[x]\nB[y]\nA --> B
    code = code
      .replace(/\b(flowchart|graph)\s+(\w+)\s+/i, '$1 $2\n')
      .replace(/([A-Z][A-Z0-9_]*)([\[\{\(])/g, '\n$1$2')
      .replace(/(\]|\}|\))\s+([A-Z][A-Z0-9_]*)([\[\{\(])/g, '$1\n$2$3')
      .replace(/([A-Z][A-Z0-9_]*)\s+(-->)/g, '\n$1 $2')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');
    
    console.log('✅ Mermaid reconstruido con saltos de línea');
  }

  // Remover numeración típica de listas dentro del bloque Mermaid
  let lines = code
    .split('\n')
    .map(line => line.replace(/^\s*\d+\.\s+/, '').trimRight());

  // Asegurar que el bloque empiece desde la declaración de diagrama
  const startIndex = lines.findIndex(line => /\b(flowchart|graph|sequenceDiagram|stateDiagram)\b/i.test(line));
  if(startIndex > 0) {
    lines = lines.slice(startIndex);
  }

  // Si es flowchart/graph, filtrar líneas narrativas que rompen Mermaid
  const header = (lines[0] || '').trim();
  if(/\b(flowchart|graph)\b/i.test(header)) {
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
      const isMermaidLike = /(-->|---|==>|-.->|<-->|\[[^\]]*\]|\([^\)]*\)|\{[^\}]*\}|\bsubgraph\b|\bend\b|\bclassDef\b|\bclass\b|\bstyle\b|\blinkStyle\b|^[A-Z0-9_]+[\(\[\{])/i.test(line);
      if(isMermaidLike) {
        cleaned.push(line);
      } else {
        console.debug('Línea ignorada en Mermaid:', line);
      }
    }

    lines = cleaned;
  }

  const result = lines.join('\n').trim();
  console.log('📊 Código Mermaid normalizado:', result);
  return result;
}


// Validar sintaxis básica de Mermaid
function validateMermaidSyntax(code) {
  const lines = code.split('\n').filter(line => line.trim() && !line.trim().startsWith('%%'));
  
  // Verificar que hay al menos una declaración de diagrama
  const hasFlowchart = /\b(flowchart|graph)\b/i.test(code);
  const hasSequence = /\bsequenceDiagram\b/i.test(code);
  const hasState = /\bstateDiagram\b/i.test(code);
  
  if(!hasFlowchart && !hasSequence && !hasState) {
    return 'No contiene declaración válida de diagrama (flowchart, sequenceDiagram, stateDiagram)';
  }
  
  // Para flowcharts, validar nodos
  if(hasFlowchart) {
    // Debe tener al menos un conector o relación
    const hasRelation = /(-->|---|==>|-.->|<-->|-\.->)/.test(code);
    if(!hasRelation) {
      return 'El flowchart no contiene relaciones entre nodos (ej: A[Inicio] --> B[Proceso])';
    }

    // Detectar nodos con texto excesivamente largo (más de 80 caracteres)
    const longNodePattern = /\b[A-Z][A-Z0-9_]*\[[^\]]{80,}\]/;
    if(longNodePattern.test(code)) {
      console.warn('⚠️ Nodos con texto muy largo detectados - puede causar problemas de renderizado');
      return 'Nodos con texto demasiado largo. Usa máximo 3-4 palabras o usa <br/> para dividir texto.';
    }

    // Mermaid permite A[Texto] y A["Texto"]. Solo invalidar etiquetas vacías.
    const emptyNodePattern = /\b[A-Za-z0-9_]+\[\s*\]/;
    if(emptyNodePattern.test(code)) {
      return 'Nodos sin etiqueta. Usa formato como: A[Inicio] o A["Inicio"]';
    }

    // Detectar desbalance básico de corchetes en flowchart
    const openBrackets = (code.match(/\[/g) || []).length;
    const closeBrackets = (code.match(/\]/g) || []).length;
    if(openBrackets !== closeBrackets) {
      return 'Corchetes desbalanceados en nodos. Revisa [ y ] en el diagrama';
    }
    
    // Detectar múltiples conectores en la misma línea (A --> B --> C)
    // Esto es válido en Mermaid pero puede causar problemas si viene todo en una línea
    const multipleArrowsInLine = /[A-Z][A-Z0-9_]*\s*-->\s*[A-Z][A-Z0-9_]*\s*-->\s*[A-Z][A-Z0-9_]*/;
    if(multipleArrowsInLine.test(code.replace(/\n/g, ' '))) {
      console.warn('⚠️ Múltiples conexiones en una línea - intentando normalizar...');
    }
  }
  
  // Validar sintaxis básica de conectores
  const validConnectors = ['-->', '<-->', '--', '---|', '-->|'];
  const allText = code.replace(/[\n\r]/g, ' ');
  
  // Detectar problemas comunes
  if(/\{\{/.test(code)) {
    return 'Sintaxis de diamante incorrecto. USA: C{"¿Pregunta?"}';
  }
  
  return null; // Sin errores
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

// Función auxiliar para mostrar mensaje cuando no hay resultados
function showNoResultsOptions(query, sistema){
  // 📝 Guardar pregunta sin respuesta automáticamente
  fetch('/api/confluence/save-pending-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      question: query, 
      sistema: sistema || 'General' 
    })
  }).then(r => r.json())
    .then(saveData => {
      if(saveData.success){
        console.log('✅ Pregunta sin respuesta guardada para análisis:', query);
      }
    })
    .catch(err => console.error('Error guardando pregunta:', err));
  
  setTimeout(() => {
    appendMessage('bot', 'He realizado una búsqueda exhaustiva en nuestra base de conocimientos, pero no encontré casos similares registrados. Sin embargo, he documentado tu consulta para análisis. 📝');
  }, 300);
  setTimeout(() => {
    appendMessage('bot', 'Si quieres, puedo crear un ticket para que un especialista lo revise personalmente. Simplemente escríbeme "crear ticket" o continúa con otra consulta que tengas. ¿Te gustaría hacer algo más? 💡');
  }, 700);
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
      casoDiv.style.cssText = 'margin:15px 0;padding:16px;background:#f8fafc;border-left:4px solid #A85A5A;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);';
      
      let html = `<div style="font-size:18px;font-weight:700;color:#A85A5A;margin-bottom:12px;">📋 Caso #${caso.numero}</div>`;
      
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
    //       // hideOptions(); // Ya no usamos showOptions()
    //       appendMessage('bot', 'Por favor escribe el número del caso que deseas consultar. Por ejemplo: "muéstrame el caso 307903"');
    //     }else if(choice === 'similares'){
    //       appendMessage('user', 'Buscar casos similares');
    //       // hideOptions(); // Ya no usamos showOptions()
    //       if(asuntoCol && casesFound[0].data[asuntoCol]){
    //         const palabrasClave = casesFound[0].data[asuntoCol].split(' ').slice(0, 3).join(' ');
    //         appendMessage('bot', `Buscando casos similares a "${palabrasClave}"...`);
    //         simulateBot(`cuantos casos tienen la palabra ${palabrasClave}`);
    //       }else{
    //         appendMessage('bot', '¿Qué palabra clave quieres buscar?');
    //       }
    //     }else{
    //       appendMessage('user', 'Finalizar');
    //       // hideOptions(); // Ya no usamos showOptions()
    //       showFinalizarButton();
    //     }
    //   });
    // }, 500);
    
  } catch(err){
    console.error('Error al buscar casos:', err);
    appendMessage('bot', '❌ Hubo un error al buscar los casos. Por favor intenta de nuevo.');
  }
}

// ============================================
// DETECTAR PREGUNTAS SOBRE REGLAS ESPECÍFICAS DE VEE
// ============================================
/**
 * Detecta si la pregunta es sobre una regla específica de Validación o Estimación
 * vs. una pregunta general sobre conceptos
 * @param {string} query - La pregunta del usuario
 * @returns {string|boolean} - Tipo de regla ('VALIDACIÓN' o 'ESTIMACIÓN') o false si es general
 */
function detectSpecificVeeRule(query) {
  const queryLower = query.toLowerCase();
  
  // Palabras clave que indican preguntas GENERALES (no deben usar PDFs técnicos)
  const generalPatterns = [
    /^(qu[eé]|que) es (una |la )?(regla|validaci[oó]n|estimaci[oó]n)/i,
    /^(qu[eé]|que) significa/i,
    /^(c[oó]mo|como) funciona (la |el )?(proceso de |sistema de )?vee/i,
    /^para qu[eé] sirve/i,
    /^cu[aá]l es (el objetivo|la finalidad|el prop[oó]sito)/i,
    /^explica(me)? (el concepto|la idea) de/i
  ];
  
  // Si coincide con patrón general, NO usar PDFs técnicos
  if (generalPatterns.some(pattern => pattern.test(query))) {
    console.log('📚 Pregunta conceptual/general detectada - NO usar PDFs técnicos');
    return false;
  }
  
  // Reglas específicas de VALIDACIÓN
  const validationRules = [
    'validaci[oó]n por picos',
    'validaci[oó]n por consumo',
    'validaci[oó]n por diferencia',
    'validaci[oó]n por l[ií]mites',
    'validaci[oó]n cr[ií]tica',
    'validaci[oó]n por rango',
    'validaci[oó]n de medidas',
    'validaci[oó]n de lecturas',
    'validaci[oó]n de datos',
    'peak validation',
    'consumption validation',
    'limit validation',
    'range validation',
    'data validation',
    'critical validation'
  ];
  
  // Reglas específicas de ESTIMACIÓN
  const estimationRules = [
    'estimaci[oó]n por acumulaci[oó]n',
    'estimaci[oó]n por consumo',
    'estimaci[oó]n por golpes',
    'estimaci[oó]n por promedio',
    'estimaci[oó]n por hist[oó]rico',
    'estimaci[oó]n por factor de perfil',
    'factor de perfil',
    'tipo de d[ií]a',
    'misma fecha anterior',
    'factor de perfil o tipo de d[ií]a',
    'tipo de d[ií]a\s*misma fecha anterior',
    'factor de perfil o tipo de d[ií]a\s*misma fecha anterior',
    'estimaci[oó]n de datos faltantes',
    'estimaci[oó]n de lecturas',
    'estimaci[oó]n de medidas',
    'estimation by accumulation',
    'estimation by consumption',
    'estimation by average',
    'estimation by historical',
    'missing data estimation',
    'reading estimation'
  ];
  
  // Verificar si menciona alguna regla específica de validación
  for (const rule of validationRules) {
    const regex = new RegExp(rule, 'i');
    if (regex.test(queryLower)) {
      console.log(`🎯 Regla específica de VALIDACIÓN detectada: "${rule}"`);
      return 'VALIDACIÓN';
    }
  }
  
  // Verificar si menciona alguna regla específica de estimación
  for (const rule of estimationRules) {
    const regex = new RegExp(rule, 'i');
    if (regex.test(queryLower)) {
      console.log(`🎯 Regla específica de ESTIMACIÓN detectada: "${rule}"`);
      return 'ESTIMACIÓN';
    }
  }
  
  // Si contiene palabras como "regla", "algoritmo", "método" junto con validación/estimación
  // Y NO es una pregunta general, probablemente es específica
  const specificIndicators = /\b(regla|algoritmo|m[eé]todo|procedimiento|proceso espec[ií]fico)\b/i;
  const hasVeeTerms = /\b(validaci[oó]n|estimaci[oó]n|vee)\b/i;
  
  if (specificIndicators.test(queryLower) && hasVeeTerms.test(queryLower)) {
    if (/validaci[oó]n/i.test(queryLower)) {
      console.log('🎯 Pregunta específica sobre VALIDACIÓN detectada por indicadores');
      return 'VALIDACIÓN';
    } else if (/estimaci[oó]n/i.test(queryLower)) {
      console.log('🎯 Pregunta específica sobre ESTIMACIÓN detectada por indicadores');
      return 'ESTIMACIÓN';
    }
  }
  
  // No es una pregunta sobre regla específica
  return false;
}

// ============================================
// 📄 BÚSQUEDA EN PDF DE ORACLE + CONFLUENCE
// ============================================
async function searchInFAQsAndPDF(query, sistema){
  console.log('🔍 Buscando en PDF de Oracle + Confluence...');
  
  const loadingId = appendLoadingIndicator();
  
  try {
    // 🚨 PRIORIZAR CONFLUENCE para preguntas sobre errores
    const isErrorQuery = /\b(error|falla|problema|no funciona|no puedo|ayuda|crash|bug|issue)\b/i.test(query);
    
    if (isErrorQuery) {
      console.log('🚨 Pregunta sobre ERROR detectada - Priorizando Confluence/FAQs');
    }
    
    // 🎯 DETECTAR PREGUNTA SOBRE REGLA ESPECÍFICA DE VEE
    const isSpecificVeeRuleQuery = detectSpecificVeeRule(query);
    
    if (isSpecificVeeRuleQuery) {
      console.log(`🎯 Pregunta sobre regla específica de ${isSpecificVeeRuleQuery} detectada - Usando PDFs técnicos`);
    }
    
    // 📌 DETECTAR PREGUNTA SOBRE NOMBRE TÉCNICO ESPECÍFICO
    const isAskingForName = /\b(nombre|se\s+llama|c[oó]mo\s+se\s+llama|cu[aá]l\s+es\s+el\s+nombre|name|called|id|c[oó]digo|code)\b.*\b(business\s+object|regla|rule|campo|field|tabla|table|algoritmo|algorithm|objeto|object)\b/i.test(query);
    
    if (isAskingForName) {
      console.log('📌 Pregunta sobre NOMBRE TÉCNICO detectada - Se agregará nota de verificación');
    }
    
    // Decidir qué endpoint de PDF usar
    const pdfEndpoint = isSpecificVeeRuleQuery ? '/api/pdf/search-vee-technical' : '/api/pdf/search';
    
    // IMPORTANTE: Solo buscar en Confluence si es pregunta de error o problema
    // Para preguntas técnicas sobre nombres/BOs, no necesitamos Confluence
    const shouldSearchConfluence = isErrorQuery || !isAskingForName;
    
    console.log(`📍 Endpoint PDF: ${pdfEndpoint}`);
    console.log(`📍 Buscar Confluence: ${shouldSearchConfluence}`);
    
    // Buscar en PDF (siempre) y Confluence (solo si aplica)
    const searchPromises = [
      fetch(pdfEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: query, 
          translate: true,
          pdfType: isSpecificVeeRuleQuery, // 'ESTIMACIÓN', 'VALIDACIÓN', o false (backend usa 'general' por defecto)
          conversationHistory: conversationHistory
        })
      }).then(r => r.json()).catch(err => {
        console.error('Error en PDF:', err);
        return { success: false, sections: [] };
      })
    ];
    
    // Solo agregar búsqueda de Confluence si aplica
    if (shouldSearchConfluence) {
      searchPromises.push(
        fetch('/api/confluence/faq-search?' + new URLSearchParams({ q: query, sistema: sistema || '' }))
          .then(r => r.json()).catch(err => {
          console.error('Error en Confluence:', err);
          return { error: true, results: [] };
        })
      );
    }
    
    const results = await Promise.all(searchPromises);
    const pdfResponse = results[0];
    const confluenceResponse = shouldSearchConfluence ? results[1] : { error: true, results: [] };
    
    console.log('📄 Resultados PDF:', pdfResponse);
    console.log('📚 Resultados Confluence:', confluenceResponse);
    
    const hasPDFResults = pdfResponse.success && pdfResponse.response;
    const hasConfluenceResults = !confluenceResponse.error && confluenceResponse.results?.length > 0;
    
    removeLoadingIndicator(loadingId);
    
    // ==========================================
    // 🚨 PRIORIDAD 1: Si es pregunta de ERROR, mostrar Confluence PRIMERO
    // ==========================================
    if (isErrorQuery && hasConfluenceResults) {
      console.log('🚨 Mostrando Confluence PRIMERO por ser pregunta de error');
      console.log('🤖 Usando Multi-IA para estructurar respuesta...');
      
      // Guardar fuentes
      window.lastResponseSources = {
        type: 'CONFLUENCE_PRIORITY',
        confluenceResults: confluenceResponse.results.length,
        hasPDF: hasPDFResults
      };
      
      // Preparar contexto para Multi-IA
      const searchResults = {
        confluenceResults: confluenceResponse.results.slice(0, 5)
      };
      
      // Llamar al endpoint Multi-IA para que estructure la respuesta
      fetch('/api/ai/multi-ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          conversationHistory: conversationHistory,
          searchResults: searchResults,
          context: 'error_troubleshooting'
        })
      })
      .then(r => r.json())
      .then(aiResponse => {
        removeLoadingIndicator(loadingId);
        
        if (aiResponse.success) {
          // Mostrar encabezado
          setTimeout(() => {
            appendMessage('bot', `� Encontré ${confluenceResponse.results.length} solución(es) documentada(s) para este problema:\n\n---`);
          }, 300);
          
          // Mostrar respuesta estructurada por IA
          setTimeout(() => {
            const formattedResponse = aiResponse.conversationalResponse || aiResponse.response;
            appendMessage('bot', formattedResponse);
          }, 700);
          
          // Si también hay resultados del PDF, ofrecerlos
          if (hasPDFResults) {
            setTimeout(() => {
              appendMessage('bot', `\n📄 También encontré información en el manual oficial de Oracle. ¿Quieres que complemente con esa información técnica?`);
              window.pendingPDFResponse = pdfResponse.response;
            }, 1100);
          }
        } else {
          // Fallback: Mostrar resultados sin IA
          console.error('Error al procesar con Multi-IA:', aiResponse.error);
          setTimeout(() => {
            appendMessage('bot', `📚 Encontré ${confluenceResponse.results.length} artículo(s) sobre este error:`);
          }, 300);
          
          setTimeout(() => {
            confluenceResponse.results.slice(0, 3).forEach((faq, index) => {
              setTimeout(() => {
                const title = faq.pregunta || faq.title || 'Pregunta frecuente';
                const answer = faq.respuesta || faq.answer || 'Ver documento completo';
                const url = faq.confluenceUrl || faq.url || '#';
                
                appendMessage('bot', `**${index + 1}. ${title}**\n\n${answer}\n\n🔗 [Ver en Confluence](${url})`);
              }, index * 400);
            });
          }, 600);
        }
      })
      .catch(err => {
        console.error('Error llamando a Multi-IA:', err);
        removeLoadingIndicator(loadingId);
        
        // Fallback completo
        setTimeout(() => {
          appendMessage('bot', `📚 Encontré ${confluenceResponse.results.length} artículo(s) sobre este error:`);
        }, 300);
        
        setTimeout(() => {
          confluenceResponse.results.slice(0, 3).forEach((faq, index) => {
            setTimeout(() => {
              const title = faq.pregunta || faq.title || 'Pregunta frecuente';
              const answer = faq.respuesta || faq.answer || 'Ver documento completo';
              const url = faq.confluenceUrl || faq.url || '#';
              
              appendMessage('bot', `**${index + 1}. ${title}**\n\n${answer}\n\n🔗 [Ver en Confluence](${url})`);
            }, index * 400);
          });
        }, 600);
      });
      
      return;
    }
    
    // ==========================================
    // 2️⃣ Si hay respuesta del PDF oficial de Oracle (PRIORIDAD para NO-ERRORES)
    // ==========================================
    if(hasPDFResults){
      // Identificar si usó PDFs técnicos de VEE
      const usedTechnicalPDF = pdfResponse.sourceType && pdfResponse.sourceType !== 'C2M Business User Guide';
      
      // Guardar fuentes para referencia futura (solo si el usuario pregunta)
      window.lastResponseSources = {
        type: usedTechnicalPDF ? 'PDF_VEE_TECHNICAL' : 'PDF_ORACLE',
        pages: pdfResponse.sourcePages || [],
        document: usedTechnicalPDF 
          ? `Documento técnico de ${pdfResponse.sourceType}` 
          : 'Oracle C2M Business User Guide v2.8.0.0',
        sources: pdfResponse.sources || [],
        hasConfluence: hasConfluenceResults
      };
      
      setTimeout(() => {
        // Mostrar respuesta del manual oficial de Oracle
        appendMessage('bot', pdfResponse.response);
      }, 300);
      
      // Mensaje de seguimiento para fomentar interacción
      setTimeout(() => {
        if (isAskingForName) {
          appendMessage('bot', '¿Necesitas información adicional sobre esta regla o algún otro Business Object? 💡');
        } else {
          appendMessage('bot', '¿Esta información responde tu pregunta o necesitas más detalles técnicos? 💡');
        }
      }, 700);
      
      // Si también hay resultados de Confluence Y es pregunta de error, ofrecerlos
      if(hasConfluenceResults && isErrorQuery){
        setTimeout(() => {
          appendMessage('bot', `📚 Además, tengo documentación complementaria en Confluence (${confluenceResponse.results.length} artículos sobre problemas similares). ¿Quieres que te muestre esta información adicional?`);
        }, 800);
        
        // Guardar contexto para respuesta "sí"
        window.pendingConfluenceResults = confluenceResponse.results;
        window.pendingConfluenceQuery = query;
      }
      return;
    }
    
    // ==========================================
    // 3️⃣ Si solo hay resultados en Confluence (fallback)
    // ==========================================
    if(hasConfluenceResults){
      console.log('📚 Usando resultados de Confluence...');
      // Llamar a la función original para manejo completo
      searchInFAQs(query, sistema);
      return;
    }
    
    // ==========================================
    // 4️⃣ No hay resultados en ninguna fuente
    // ==========================================
    // 📝 Guardar pregunta sin respuesta automáticamente
    fetch('/api/confluence/save-pending-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        question: query, 
        sistema: sistema || 'General' 
      })
    }).then(r => r.json())
      .then(saveData => {
        if(saveData.success){
          console.log('✅ Pregunta sin respuesta guardada para análisis:', query);
        }
      })
      .catch(err => console.error('Error guardando pregunta:', err));
    
    setTimeout(() => {
      appendMessage('bot', 'No encontré información específica en el manual oficial de Oracle ni en nuestra documentación de Confluence. 🔍');
    }, 300);
    
    setTimeout(() => {
      appendMessage('bot', '¿Quieres que busque en otras fuentes (casos históricos, SharePoint) o prefieres que cree un ticket para un especialista? Simplemente dime "buscar más" o "crear ticket". 💡');
    }, 700);
    
  } catch (error) {
    console.error('❌ Error en búsqueda PDF+Confluence:', error);
    removeLoadingIndicator(loadingId);
    
    // Fallback completo a búsqueda original
    appendMessage('bot', 'Ocurrió un problema con la búsqueda. Déjame intentar de otra manera...');
    searchInFAQs(query, sistema);
  }
}

async function searchInFAQs(query, sistema){
  // ELIMINADO: Ya no validamos con keywords - Claude Haiku analiza TODO
  // El backend con IA decidirá si puede responder o no
  console.log('🤖 Enviando pregunta a Claude Haiku para análisis inteligente...');
  
  // Mostrar indicador de carga discreto
  const loadingId = appendLoadingIndicator();
  
  const params = new URLSearchParams();
  if(query) params.append('q', query);
  if(sistema) params.append('sistema', sistema);
  
  console.log('🔍 Buscando en TODAS las fuentes: C2M PDF, Confluence, SharePoint, Excel');
  
  // 🎯 CLASIFICAR TIPO DE PREGUNTA para decidir si buscar en Oracle Docs
  let questionType = null;
  try {
    const classifyResponse = await fetch('/api/ai/classify-question-type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query })
    });
    if(classifyResponse.ok){
      const classifyData = await classifyResponse.json();
      questionType = classifyData.questionType;
      console.log(`🎯 Pregunta clasificada como: ${questionType} (confianza: ${(classifyData.confidence * 100).toFixed(0)}%)`);
    }
  } catch(err){
    console.warn('⚠️ No se pudo clasificar pregunta, continuando sin Oracle Docs');
  }
  
  // Buscar en TODAS las fuentes simultáneamente (en paralelo)
  const c2mPdfPromise = fetch('/api/c2m-guide/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query })
  })
    .then(r => r.json())
    .catch(err => {
      console.error('Error en C2M PDF:', err);
      return { success: false, results: [] };
    });
  
  // 🌐 NUEVO: Buscar en Oracle Docs oficiales si es learning/procedural
  let oracleDocsPromise = Promise.resolve({ success: false, results: [] });
  if(questionType === 'learning' || questionType === 'procedural'){
    console.log('🌐 Buscando TAMBIÉN en Oracle Docs oficiales...');
    oracleDocsPromise = fetch('/api/oracle-docs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, questionType: questionType })
    })
      .then(r => r.json())
      .catch(err => {
        console.error('Error en Oracle Docs:', err);
        return { success: false, results: [] };
      });
  }
  
  const confluencePromise = fetch('/api/confluence/faq-search?' + params.toString())
    .then(r => r.json())
    .catch(err => {
      console.error('Error en Confluence:', err);
      return { error: true, results: [] };
    });
  
  const sharepointPromise = fetch('/api/sharepoint/search', {  
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: query, maxResults: 5 })
  })
    .then(r => r.json())
    .catch(err => {
      console.error('Error en SharePoint:', err);
      return { success: false, results: [] };
    });
  
  const excelPromise = searchInExcelKnowledgeBasePromise(query, sistema);
  
  // Esperar TODAS las búsquedas (incluyendo Oracle Docs si aplica)
  Promise.all([c2mPdfPromise, oracleDocsPromise, confluencePromise, sharepointPromise, excelPromise])
    .then(([c2mData, oracleDocsData, confluenceData, sharepointData, excelResults]) => {
      console.log('📚 Resultados C2M PDF:', c2mData);
      console.log('🌐 Resultados Oracle Docs:', oracleDocsData);
      console.log('📚 Resultados Confluence:', confluenceData);
      console.log('📚 Resultados SharePoint:', sharepointData);
      console.log('📚 Resultados Excel:', excelResults);
      
      const c2mResults = c2mData.success ? c2mData.results || [] : [];
      const oracleDocsResults = oracleDocsData.success && oracleDocsData.results ? [oracleDocsData.results] : [];
      const faqResults = confluenceData.results || [];
      const sharepointResults = sharepointData.success ? sharepointData.results || [] : [];
      const excelResultsArray = excelResults || [];
      
      const hasC2M = c2mResults.length > 0;
      const hasOracleDocs = oracleDocsResults.length > 0;
      const hasConfluence = !confluenceData.error && faqResults.length > 0;
      const hasSharePoint = sharepointResults.length > 0;
      const hasExcel = excelResultsArray.length > 0;
      
      const totalResults = c2mResults.length + oracleDocsResults.length + faqResults.length + sharepointResults.length + excelResultsArray.length;
      
      console.log(`📊 Total de resultados encontrados: ${totalResults}`);
      console.log(`   C2M PDF: ${c2mResults.length}, Oracle Docs: ${oracleDocsResults.length}, Confluence: ${faqResults.length}, SharePoint: ${sharepointResults.length}, Excel: ${excelResultsArray.length}`);
      
      // Si no hay resultados en NINGUNA fuente
      if(totalResults === 0){
        // Eliminar loading indicator
        removeLoadingIndicator(loadingId);
        
        // Guardar pregunta sin respuesta
        fetch('/api/confluence/save-pending-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: query, sistema: sistema })
        }).catch(err => console.error('Error guardando pregunta:', err));
        
        setTimeout(() => {
          appendMessage('bot', 'He revisado minuciosamente todas nuestras fuentes de información disponibles (documentación, casos históricos, FAQs), pero no encontré contenido relacionado con tu consulta específica. 🔍');
        }, 400);
        setTimeout(() => {
          appendMessage('bot', 'Permíteme ofrecerte la mejor solución: puedo crear un ticket para que un especialista con experiencia directa te brinde una respuesta personalizada. 👨‍💼');
        }, 700);
        setTimeout(() => {
          appendMessage('bot', 'Si quieres que cree el ticket, simplemente escríbeme "crear ticket" o "sí". Si prefieres intentar algo más, solo cuéntame qué necesitas. 💡');
        }, 1200);
        return;
      }
      
      // ✅ HAY RESULTADOS - ENVIAR TODO A CLAUDE HAIKU + MULTI-IA PARA ANÁLISIS INTELIGENTE
      console.log('🤖 Enviando TODO a Claude Haiku + Multi-IA para análisis inteligente...');
      // Eliminar loading anterior y mostrar nuevo
      removeLoadingIndicator(loadingId);
      const analysisLoadingId = appendLoadingIndicator();
      
      // Preparar datos para el Multi-IA
      const searchResults = {
        c2mGuideResults: c2mResults,
        oracleDocsResults: oracleDocsResults.length > 0 ? oracleDocsResults[0] : null, // Pasar objeto completo si existe
        confluenceResults: faqResults,
        sharepointResults: sharepointResults,
        excelResults: excelResultsArray
      };
      
      // Llamar al Multi-IA para que Claude Haiku analice, categorice y sintetice
      fetch('/api/ai/multi-ai-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: query,
          searchResults: searchResults,
          conversationHistory: conversationHistory // ✅ Enviar historial de conversación
        })
      })
      .then(r => r.json())
      .then(aiData => {
        console.log('🤖 Respuesta del Multi-IA:', aiData);
        
        // Eliminar loading indicator
        removeLoadingIndicator(analysisLoadingId);
        
        const conversationalText = (aiData.conversationalResponse || '').trim();
        const looksLikeError = conversationalText.startsWith('❌') || conversationalText.toLowerCase().includes('error al procesar tu pregunta');

        if(aiData.success && conversationalText && !looksLikeError){
          // Mostrar respuesta conversacional sin badges técnicos
          appendMessage('bot', conversationalText);
          messagesEl.scrollTop = messagesEl.scrollHeight;
          
          // Mensaje conversacional de seguimiento sin botones
          setTimeout(() => {
            appendMessage('bot', 'He revisado toda la documentación disponible y fuentes relevantes para brindarte la información más precisa. ¿Esta respuesta resuelve tu consulta o necesitas que profundice en algún aspecto específico?');
          }, 600);
          
          // Función para mostrar todas las fuentes cuando el usuario solicite
          function mostrarTodasLasFuentes() {
            
            // Mostrar resultados del C2M PDF
            if(hasC2M){
              appendMessage('bot', `📄 <strong>Documentación Oracle C2M (${c2mResults.length}):</strong>`);
              c2mResults.forEach((result, i) => {
                const resultDiv = document.createElement('div');
                resultDiv.style.cssText = 'margin:10px 0;padding:12px;background:#dbeafe;border-left:4px solid #3b82f6;border-radius:4px;';
                
                const pageDiv = document.createElement('div');
                pageDiv.style.cssText = 'font-weight:600;color:#1e40af;font-size:13px;margin-bottom:6px;';
                pageDiv.textContent = `📄 Página ${result.pageNum}`;
                resultDiv.appendChild(pageDiv);
                
                const textDiv = document.createElement('div');
                textDiv.style.cssText = 'padding:8px;background:#eff6ff;border-radius:4px;font-size:13px;line-height:1.6;color:#1e3a8a;';
                textDiv.textContent = result.excerpt || result.content.substring(0, 300) + '...';
                resultDiv.appendChild(textDiv);
                
                messagesEl.appendChild(resultDiv);
              });
            }
            
            // Mostrar resultados de SharePoint (NUEVO!)
            if(hasSharePoint){
              appendMessage('bot', `🗂️ <strong>SharePoint (${sharepointResults.length}):</strong>`);
              sharepointResults.forEach((result, i) => {
                const resultDiv = document.createElement('div');
                resultDiv.style.cssText = 'margin:10px 0;padding:12px;background:#dcfce7;border-left:4px solid #10b981;border-radius:4px;';
                
                const titleDiv = document.createElement('div');
                titleDiv.style.cssText = 'font-weight:600;color:#065f46;font-size:14px;margin-bottom:6px;';
                titleDiv.textContent = `🗂️ ${result.title || result.name || 'Documento'}`;
                resultDiv.appendChild(titleDiv);
                
                if(result.summary){
                  const summaryDiv = document.createElement('div');
                  summaryDiv.style.cssText = 'padding:8px;background:#f0fdf4;border-radius:4px;font-size:13px;line-height:1.6;color:#064e3b;margin-bottom:6px;';
                  summaryDiv.textContent = result.summary;
                  resultDiv.appendChild(summaryDiv);
                }
                
                if(result.url){
                  const linkDiv = document.createElement('div');
                  linkDiv.style.cssText = 'margin-top:6px;';
                  const link = document.createElement('a');
                  link.href = result.url;
                  link.target = '_blank';
                  link.style.cssText = 'color:#0284c7;text-decoration:underline;font-size:12px;font-weight:600;';
                  link.textContent = '🔗 Abrir en SharePoint';
                  linkDiv.appendChild(link);
                  resultDiv.appendChild(linkDiv);
                }
                
                messagesEl.appendChild(resultDiv);
              });
            }
            
            // Mostrar resultados de Confluence
            if(hasConfluence){
              appendMessage('bot', `📚 <strong>Preguntas Frecuentes en Confluence (${faqResults.length}):</strong>`);
        
        faqResults.forEach((faq, i)=>{
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
            if(hasExcel){
              appendMessage('bot', `📊 <strong>Casos Históricos en Excel (${excelResultsArray.length}):</strong>`);
        
              excelResultsArray.forEach((caso, i)=>{
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
            
            // Scroll final
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }  // Fin de mostrarTodasLasFuentes
          
        } else {
          appendMessage('bot', '⚠️ La IA no pudo procesar los resultados en este intento.');
          appendMessage('bot', `Encontré información en las fuentes consultadas (C2M PDF: ${c2mResults.length}, Oracle Docs: ${oracleDocsResults.length}, Confluence: ${faqResults.length}, SharePoint: ${sharepointResults.length}, Excel: ${excelResultsArray.length}). Si quieres, te la muestro por secciones.`);
        }
      })  // Fin del .then del Multi-IA
      .catch(error => {
        console.error('❌ Error en Multi-IA:', error);
        removeLoadingIndicator(analysisLoadingId);
        appendMessage('bot', `❌  Hubo un error al procesar con IA: ${error.message}`);
      });
      
    })  // Fin del .then principal (Promise.all)
    .catch(error => {
      console.error('❌ Error al buscar en todas las fuentes:', error);
      removeLoadingIndicator(loadingId);
      appendMessage('bot', '❌ Hubo un error al buscar información. Por favor intenta de nuevo.');
    });
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
  
  // hideOptions(); // Eliminada - ahora todo es conversacional
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
  conversationHistory = []; // Limpiar historial de conversación IA
  reportState = { step: 'asesoria_sistema', sistema: null, modulo: null };
  setTimeout(() => {
    appendMessage('bot', '¡Excelente! Me encanta poder ayudarte. 💼 Tengo acceso a documentación completa de varios sistemas. ¿Sobre cuál de ellos necesitas asesoría especializada? Por ejemplo: C2M, FIELD, SALES, SERVICE. 🔍');
  }, 300);
  setTimeout(() => {
    appendMessage('bot', 'Simplemente escríbeme el nombre del sistema y luego te pediré que me cuentes qué aspecto específico necesitas explorar. 💡');
  }, 800);
  
  // Activar modo de espera para detectar texto escrito
  waitingForAdvisorySystem = true;
}

function askForAdvisoryTopic(sistema){
  // hideOptions(); // Eliminada - ahora todo es conversacional
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
  
  appendMessage('bot', `🔍 Perfecto, estoy analizando toda la documentación disponible sobre "${topic}" en ${sistema}. Dame un momento...`);
  
  fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(searchQuery))
    .then(r=>r.json())
    .then(data=>{
      if(data.error){
        setTimeout(() => {
          appendMessage('bot', 'He encontrado un inconveniente técnico al conectar con la base de conocimiento en este momento. No te preocupes, puedo ayudarte de otra forma: un especialista puede contactarte directamente para brindarte asesoría personalizada. Si lo deseas, escríbeme "contactar especialista" o podemos intentar con otro tema. 🤝');
        }, 400);
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        // 📝 Guardar pregunta sin respuesta automáticamente
        fetch('/api/confluence/save-pending-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            question: `${topic} (${sistema})`, 
            sistema: sistema 
          })
        }).then(r => r.json())
          .then(saveData => {
            if(saveData.success){
              console.log('✅ Pregunta de asesoría sin respuesta guardada:', topic);
            }
          })
          .catch(err => console.error('Error guardando pregunta:', err));
        
        setTimeout(() => {
          appendMessage('bot', `He revisado exhaustivamente toda la documentación disponible, pero no encontré información específica sobre "${topic}" en ${sistema}. Esto puede significar que es un tema muy especializado o nuevo. 🔍`);
        }, 400);
        setTimeout(() => {
          appendMessage('bot', 'Puedo ayudarte de varias formas: contactar a un especialista directo, buscar sobre otro tema similar, o crear un ticket de consulta. Solo escríbeme qué prefieres hacer. 💡');
        }, 800);
        return;
      }
      
      // Mostrar resultados de asesoría
      setTimeout(() => {
        const recursosText = results.length === 1 ? 'recurso relevante' : `${results.length} recursos relevantes`;
        appendMessage('bot', `¡Excelente noticia! 📚 He encontrado ${recursosText} en nuestra documentación de ${sistema} sobre "${topic}". Aquí está toda la información:`);
      }, 300);
      
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
      
      // Mensaje conversacional de seguimiento
      setTimeout(() => {
        appendMessage('bot', 'He analizado toda la documentación disponible y he encontrado esta información que podría ayudarte. Si necesitas que profundice en algún punto específico, quieres explorar otro aspecto, o necesitas contactar a un especialista, solo escríbemelo. 💡');
      }, 600);
    })
    .catch(err=>{
      console.error('Error en búsqueda de asesoría:', err);
      appendMessage('bot', '❌ Hubo un error al buscar en la documentación. Por favor, intenta nuevamente o escríbeme "contactar especialista" para recibir ayuda directa. 📞');
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
  conversationHistory = []; // Limpiar historial de conversación IA
  reportState = { step: 'sistema', sistema: null, modulo: null };
  
  setTimeout(() => {
    appendMessage('bot', 'Entendido. Para ayudarte con el reporte de la incidencia, cuéntame: ¿en qué sistema se presentó el problema? Por ejemplo: C2M, FIELD, SALES, SERVICE, u otro. 🔍');
  }, 300);
  
  setTimeout(() => {
    appendMessage('bot', 'Una vez que me indiques el sistema, te pediré que describas el error específico que estás experimentando. Así podré ayudarte mejor. 💬');
  }, 800);
  
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
  setTimeout(() => {
    appendMessage('bot', 'Perfecto, es en C2M. Para poder ayudarte mejor, ¿podrías indicarme en qué módulo específico se presenta el problema? Por ejemplo: Actividades de campo, Ventas, Facturación, Reportes, u otro. 📋');
  }, 300);
  
  setTimeout(() => {
    appendMessage('bot', 'Si no estás seguro del módulo exacto, puedes simplemente describir el error y yo te ayudaré a identificarlo. 💡');
  }, 800);
}

function finishIncidentReport(){
  // hideOptions(); // Eliminada - ahora todo es conversacional
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
  conversationHistory = []; // Limpiar historial de conversación IA
  smartTicketState = { step: 'description', description: null, nombre: null, apellido: null, correo: null, foundSolutions: [] };
  
  appendMessage('bot', '✅ <strong>Perfecto, vamos a crear tu ticket.</strong>');
  appendMessage('bot', '📝 <strong>¿Qué problema o consulta quieres reportar?</strong>');
  appendMessage('bot', '<em>Descríbelo con el mayor detalle posible (mínimo 15 caracteres)...</em>');
  
  // Cambiar el placeholder del input para guiar al usuario
  messageInput.placeholder = 'Ejemplo: "No puedo crear una orden en C2M, me sale error 500..."';
  messageInput.focus();
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Función para calcular similitud entre dos textos (0-100%)
function calculateTextSimilarity(text1, text2){
  if(!text1 || !text2) return 0;
  
  // Normalizar textos: minúsculas, remover puntuación extra
  const normalize = (text) => text.toLowerCase()
    .replace(/[^\w\s\u00C0-\u024F]/g, ' ') // Mantener acentos
    .replace(/\s+/g, ' ')
    .trim();
  
  const norm1 = normalize(text1);
  const norm2 = normalize(text2);
  
  console.log('🔍 Comparando textos:', {
    text1: text1.substring(0, 100),
    text2: text2.substring(0, 100),
    norm1: norm1.substring(0, 100),
    norm2: norm2.substring(0, 100)
  });
  
  // ✅ Si son exactamente iguales o casi iguales después de normalizar
  if(norm1 === norm2){
    console.log('✅ Textos IDÉNTICOS detectados (100% match)');
    return 100;
  }
  
  // ✅ Si uno contiene al otro (substring match)
  if(norm1.includes(norm2) || norm2.includes(norm1)){
    const longer = Math.max(norm1.length, norm2.length);
    const shorter = Math.min(norm1.length, norm2.length);
    const substringMatch = (shorter / longer) * 100;
    console.log('✅ Substring match detectado:', substringMatch.toFixed(1) + '%');
    return substringMatch;
  }
  
  // Palabras únicas de cada texto (ahora palabras > 2 letras, no > 3)
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));
  
  console.log('📊 Palabras extraídas:', {
    words1: Array.from(words1).slice(0, 10),
    words2: Array.from(words2).slice(0, 10)
  });
  
  if(words1.size === 0 || words2.size === 0) return 0;
  
  // Palabras en común
  const commonWords = [...words1].filter(w => words2.has(w));
  
  // Similitud = (palabras comunes / palabras del texto más corto) * 100
  // Esto favorece matches cuando todas las palabras clave están presentes
  const minSize = Math.min(words1.size, words2.size);
  const similarity = (commonWords.length / minSize) * 100;
  
  console.log('🔍 Similitud calculada:', {
    text1Words: words1.size,
    text2Words: words2.size,
    commonWords: commonWords.length,
    commonList: commonWords.slice(0, 8),
    similarity: similarity.toFixed(1) + '%'
  });
  
  return similarity;
}

// Función helper para mostrar un solo resultado (fallback si Multi-IA falla)
function displaySingleSolution(result){
  const title = result.question || result.title || 'Sin título';
  const answer = result.answer || result.excerpt || 'Sin respuesta disponible';
  const caseNumber = result.caseNumber || null;
  let date = result.date || null;
  const specialist = result.specialist || null;
  const confluenceUrl = result.url || result.link || null;
  
  // Formatear fecha si es necesario
  if(date && typeof date === 'number'){
    const jsDate = excelDateToJSDate(date);
    date = jsDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }else if(date && typeof date === 'string' && date.includes('T')){
    const jsDate = new Date(date);
    date = jsDate.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  
  // Badge de fuente
  const sourceColor = result.source === 'Excel' ? '#dc2626' : '#16a34a';
  const sourceBadge = `<span style="display:inline-block;background:${sourceColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:8px;">${result.source || 'Base de conocimiento'}</span>`;
  
  // Título con enlace si está disponible
  let titleHtml = '';
  if(confluenceUrl){
    titleHtml = `<a href="${confluenceUrl}" target="_blank" style="color: #78350f; text-decoration: underline;">${title}</a>`;
  }else{
    titleHtml = `<span style="color: #78350f;">${title}</span>`;
  }
  
  // Metadatos
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
  }
  
  appendMessage('bot', `✅ <strong>Encontré una solución exacta que resuelve tu problema:</strong>`);
  
  setTimeout(() => {
    appendMessage('bot', `<div style="margin: 10px 0; padding: 15px; background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px;">
      ${sourceBadge}<br>
      <strong style="color: #f59e0b; font-size: 15px;">💡 Solución encontrada</strong><br>
      <div style="margin-top: 8px; padding: 8px; background: #fef3c7; border-radius: 4px;">
        <strong style="color: #92400e;">❓ Caso similar:</strong><br>
        ${titleHtml}
      </div>
      <div style="margin-top: 10px; color: #374151; font-size: 14px; line-height: 1.6;">
        <strong style="color: #059669;">✅ Solución aplicada:</strong><br>
        ${answer}
      </div>
      ${metadataHtml}
    </div>`);
    
    setTimeout(() => {
      appendMessage('bot', '<strong>¿Esta solución resolvió tu problema?</strong> Si es así, déjamelo saber. Si necesitas crear un ticket de todos modos, escribe "continuar con ticket". 💡');
    }, 600);
  }, 300);
}

function searchSuggestedSolutions(description){
  smartTicketState.step = 'searching';
  appendMessage('bot', '🤖 <strong>Analizando soluciones con IA para tu caso...</strong>');
  
  console.log('🔍 Buscando soluciones para:', description);
  
  // Buscar en Confluence, base de conocimiento Y Excel
  Promise.all([
    fetch('/api/confluence/faq-search?q=' + encodeURIComponent(description))
      .then(r => r.json())
      .then(data => {
        console.log('📚 Confluence FAQ response:', data);
        return data;
      })
      .catch(err => {
        console.error('❌ Error en Confluence FAQ:', err);
        return {results: []};
      }),
    fetch('/api/confluence/search-knowledge?q=' + encodeURIComponent(description))
      .then(r => r.json())
      .then(data => {
        console.log('📖 Confluence Knowledge response:', data);
        return data;
      })
      .catch(err => {
        console.error('❌ Error en Confluence Knowledge:', err);
        return {results: []};
      }),
    searchInExcelKnowledgeBasePromise(description)
      .then(data => {
        console.log('📊 Excel response:', data);
        return data;
      })
      .catch(err => {
        console.error('❌ Error en Excel:', err);
        return [];
      })
  ])
  .then(([faqData, knowledgeData, excelResults]) => {
    // Mapear resultados de Confluence FAQs (corregir nombres de propiedades)
    const faqResults = (faqData.results || []).map(r => ({
      question: r.pregunta || r.question || r.title || 'Sin título',
      answer: r.respuesta || r.answer || r.excerpt || 'Sin respuesta',
      caseNumber: r.numeroCaso || r.caseNumber || r.numero || null,
      date: r.fechaCreacion || r.date || r.createDate || r.fecha || null,
      specialist: r.especialista || r.specialist || r.assignedTo || null,
      url: r.confluenceUrl || r.url || r.link || null,
      source: 'Confluence FAQ'
    }));
    
    // Mapear resultados de Confluence Knowledge
    const knowledgeResults = (knowledgeData.results || []).map(r => ({
      question: r.pregunta || r.question || r.title || 'Sin título',
      answer: r.respuesta || r.answer || r.excerpt || 'Sin respuesta',
      caseNumber: r.numeroCaso || r.caseNumber || r.numero || null,
      date: r.fechaCreacion || r.date || r.createDate || r.fecha || null,
      specialist: r.especialista || r.specialist || r.assignedTo || null,
      url: r.confluenceUrl || r.url || r.link || null,
      source: 'Confluence Knowledge'
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
        specialist: specialist,
        source: 'Excel'
      };
    });
    
    console.log('📊 Excel formateado:', excelResultsFormatted);
    
    // 🎯 PRIORIZACIÓN INTELIGENTE: Confluence primero, Excel después
    const confluenceResults = [...faqResults, ...knowledgeResults];
    let allResults = [];
    
    if(confluenceResults.length > 0){
      // ✅ SI HAY RESULTADOS EN CONFLUENCE, priorizarlos totalmente
      console.log('✅ Confluence tiene resultados, priorizando Confluence');
      allResults = [...confluenceResults];
      
      // Solo agregar Excel si Confluence tiene menos de 5 resultados
      if(confluenceResults.length < 5 && excelResultsFormatted.length > 0){
        const excelNeeded = 5 - confluenceResults.length;
        console.log(`📊 Complementando con ${excelNeeded} resultados de Excel`);
        allResults = [...confluenceResults, ...excelResultsFormatted.slice(0, excelNeeded)];
      }
    } else {
      // ⚠️ No hay resultados en Confluence, usar Excel como fallback
      console.log('⚠️ Confluence vacío, usando Excel como fallback');
      allResults = [...excelResultsFormatted];
    }
    
    console.log('🔍 Resultados finales:', { 
      confluenceTotal: confluenceResults.length,
      faqResults: faqResults.length, 
      knowledgeResults: knowledgeResults.length, 
      excelTotal: excelResultsFormatted.length,
      allResultsTotal: allResults.length,
      mostrandoPrimeros: Math.min(5, allResults.length)
    });
    
    smartTicketState.foundSolutions = allResults;
    
    if(allResults.length > 0){
      // ✅ NUEVO: Detectar si el primer resultado es muy relevante (match exacto/casi exacto)
      const firstResult = allResults[0];
      // ✅ CORREGIDO: Comparar SOLO con la pregunta, no con pregunta + respuesta
      const firstResultQuestion = firstResult.question || firstResult.title || '';
      const similarity = calculateTextSimilarity(description, firstResultQuestion);
      
      console.log('🎯 Comparación de similitud:', {
        userQuery: description.substring(0, 100),
        matchedQuestion: firstResultQuestion.substring(0, 100),
        similarity: similarity.toFixed(1) + '%',
        isHighMatch: similarity >= 70
      });
      
      // 🎯 Si hay un match muy relevante (>= 70%), mostrar SOLO ese resultado con formato IA
      if(similarity >= 70){
        console.log('✅ MATCH EXACTO detectado - Procesando con Multi-IA...');
        
        // Indicador de carga profesional
        const loadingId = appendLoadingIndicator();
        
        // Procesar con Multi-IA para mejorar formato y redacción
        fetch('/api/ai/multi-ai-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: description,
            conversationHistory: conversationHistory,
            searchResults: {
              exactMatch: {
                userQuery: description,
                matchedQuestion: firstResult.question || 'Sin título',
                matchedAnswer: firstResult.answer || 'Sin respuesta',
                caseNumber: firstResult.caseNumber || null,
                date: firstResult.date || null,
                specialist: firstResult.specialist || null,
                source: firstResult.source || 'Base de conocimiento',
                url: firstResult.url || null,
                similarity: similarity.toFixed(1)
              }
            },
            context: 'exact_solution_match'
          })
        })
        .then(r => r.json())
        .then(multiAIData => {
          removeLoadingIndicator(loadingId);
          
          if(multiAIData.success && multiAIData.conversationalResponse){
            // Mostrar respuesta mejorada por IA
            setTimeout(() => {
              appendMessage('bot', multiAIData.conversationalResponse);
              
              // Preguntar si resolvió el problema
              setTimeout(() => {
                appendMessage('bot', '<strong>¿Esta solución resolvió tu problema?</strong> Si es así, déjamelo saber. Si necesitas crear un ticket de todos modos, escribe "continuar con ticket". 💡');
              }, 600);
            }, 300);
          } else {
            // Fallback si Multi-IA falla - mostrar resultado directo
            console.warn('⚠️ Multi-IA falló, mostrando resultado directo');
            displaySingleSolution(firstResult);
          }
        })
        .catch(err => {
          console.error('❌ Error procesando con Multi-IA:', err);
          removeLoadingIndicator(loadingId);
          // Fallback - mostrar resultado directo
          displaySingleSolution(firstResult);
        });
        
        return; // ✅ Terminar aquí - NO mostrar los 5 resultados
      }
      
      // ❌ NO hay match exacto - mostrar múltiples resultados como antes
      const resultSource = confluenceResults.length > 0 ? '(de Confluence y KB)' : '(de casos históricos)';
      appendMessage('bot', `✨ <strong>¡Encontré ${allResults.length} posible${allResults.length > 1 ? 's' : ''} solución${allResults.length > 1 ? 'es' : ''} que podrían ayudarte!</strong> ${resultSource}`);
      
      allResults.slice(0, 5).forEach((result, index) => {
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
        
        console.log(`📋 Metadata procesada:`, { caseNumber, date, specialist, url: confluenceUrl, source: result.source });
        
        // Badge de fuente
        const sourceColor = result.source === 'Excel' ? '#dc2626' : '#16a34a';
        const sourceBadge = `<span style="display:inline-block;background:${sourceColor};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-bottom:8px;">${result.source || 'Desconocido'}</span>`;
        
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
          ${sourceBadge}<br>
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
      
      setTimeout(() => {
        appendMessage('bot', '<strong>¿Te ayudó alguna de estas soluciones?</strong> Si encontraste lo que necesitabas, déjamelo saber y podemos cerrar aquí. Si prefieres que continuemos con la creación del ticket, solo escríbeme "continuar con ticket" o "crear ticket". 💡');
      }, 600);
    }else{
      // No encontró soluciones - continuar con creación directa
      appendMessage('bot', '🤖 <strong>No encontré soluciones exactas en la base de conocimiento.</strong>');
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
        appendMessage('bot', 'No se pudo conectar con la base de conocimiento. Si quieres que creemos un ticket para que un agente te ayude, escríbeme "crear ticket". También puedes intentar reformular tu consulta o probar más tarde. 🤝');
        return;
      }
      
      const results = data.results || [];
      
      if(results.length === 0){
        // 📝 Guardar pregunta sin respuesta automáticamente para análisis
        fetch('/api/confluence/save-pending-question', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            question: searchTerm, 
            sistema: sistema || 'General' 
          })
        }).then(r => r.json())
          .then(saveData => {
            if(saveData.success){
              console.log('✅ Pregunta sin respuesta guardada para análisis:', searchTerm);
            }
          })
          .catch(err => console.error('Error guardando pregunta:', err));
        
        const sistemaMsg = sistema ? ` en ${sistema}` : '';
        setTimeout(() => {
          appendMessage('bot', `No encontré artículos específicos${sistemaMsg} para tu problema. 🔍`);
        }, 300);
        setTimeout(() => {
          appendMessage('bot', 'Puedo ayudarte de varias formas: crear un ticket para que un especialista lo revise, puedes describir el problema con más detalles para que busque mejor, o podemos intentar con otra consulta. ¿Qué prefieres hacer? 💡');
        }, 800);
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
      setTimeout(() => {
        appendMessage('bot', '¿Alguna de estas soluciones te ayudó? Si tu problema está resuelto, déjamelo saber. Si necesitas crear un ticket o más ayuda, también puedo ayudarte con eso. 💡');
      }, 600);
    })
    .catch(err=>{
      appendMessage('bot', 'Hubo un error al buscar: ' + err.message + '. Si quieres que cree un ticket para que un especialista revise tu caso personalmente, escríbeme "crear ticket". 🤝');
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
  
  appendMessage('bot', `🤖 Analizando soluciones para "${errorText}" con IA...`);
  
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
        setTimeout(() => {
          appendMessage('bot', 'No encontré artículos en Confluence sobre este tema. 🔍');
        }, 300);
        setTimeout(() => {
          appendMessage('bot', 'Puedo buscar en el histórico de casos resueltos anteriormente, o si prefieres, crear un ticket directamente para que un especialista te ayude. ¿Qué te gustaría hacer? 💡');
        }, 800);
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
      setTimeout(() => {
        appendMessage('bot', '¿Pudiste encontrar lo que buscabas? Si encontraste la solución, déjamelo saber. Si necesitas más ayuda o quieres crear un ticket, también puedo ayudarte con eso. 💡');
      }, 600);
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

// Función para preguntar si la respuesta fue útil con tono conversacional
function askIfHelpful(options = {}) {
  const { 
    showTicketOption = true, 
    showNewQueryOption = true,
    onResolved = null,
    delayMs = 800 
  } = options;
  
  setTimeout(() => {
    const conversationalMessages = [
      'He proporcionado toda la información que tengo disponible sobre este tema. ¿Hay algo más en lo que pueda asistirte? 💬',
      'Espero que esta información te haya sido útil. Si necesitas profundizar en algún aspecto o tienes otra consulta, estaré encantado de ayudarte. 🚀',
      'He analizado a fondo tu consulta. ¿Te gustaría que ampliemos algún punto específico o exploramos otro tema? Estoy aquí para ayudarte. 🤝',
      'Información procesada y lista. Si requieres mayor detalle en alguna parte o tienes nuevas preguntas, no dudes en consultarme. 👍'
    ];
    
    const randomMessage = conversationalMessages[Math.floor(Math.random() * conversationalMessages.length)];
    appendMessage('bot', randomMessage);
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
    return `${saludo} 👋 Es un placer asistirte. Soy tu AI-Assisted Support Agent con acceso completo a toda la documentación técnica. ¿Qué consulta tienes hoy?`;
  }
  
  // Si pregunta por "preguntas frecuentes" sin tema específico
  if(/^(preguntas? frecuentes?|faqs?|tengo una pregunta frecuente|ver preguntas frecuentes)$/i.test(txt)){
    return 'Con gusto te ayudo a encontrar las preguntas frecuentes que necesitas. ¿Sobre qué sistema específico deseas consultar? Por ejemplo: C2M, FIELD, SALES, SERVICE. También puedes escribir directamente tu pregunta técnica. 🔍';
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
    
    // Mostrar indicador de carga con el mismo estilo que errores
    const loadingId = appendLoadingIndicator();
    
    // 3. Primero obtener análisis raw para contexto
    const rawAnalysisResponse = await fetch('/api/ai/analyze-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: question,
        data: aggregatedData,
        dataType: dataType
      })
    }).then(r => r.json());
    
    // 4. Ahora pasar por Multi-IA para formateo profesional
    const multiAIResponse = await fetch('/api/ai/multi-ai-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: question,
        conversationHistory: conversationHistory,
        searchResults: {
          dataAnalysis: {
            query: question,
            dataType: dataType,
            rawAnalysis: rawAnalysisResponse.analysis || '',
            data: aggregatedData
          }
        },
        context: 'data_analysis'
      })
    }).then(r => r.json());
    
    // Remover indicador de carga
    removeLoadingIndicator(loadingId);
    
    if(multiAIResponse.success && multiAIResponse.conversationalResponse){
      // Mostrar respuesta formateada por Multi-IA con appendMessage para soporte Markdown
      setTimeout(() => {
        appendMessage('bot', multiAIResponse.conversationalResponse);
      }, 300);
      
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
      //     // hideOptions(); // Ya no usamos showOptions()
      //     analyzeExcelFile(fileName);
      //   }else if(choice === 'another'){
      //     appendMessage('user', 'Otra consulta');
      //     // hideOptions(); // Ya no usamos showOptions()
      //     appendMessage('bot', '¿Qué más te gustaría saber sobre los datos?');
      //   }else{
      //     appendMessage('user', 'Finalizar');
      //     // hideOptions(); // Ya no usamos showOptions()
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
  appendMessage('bot', '🤖 Analizando los datos para responder tu pregunta...');
  
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
            //     // hideOptions(); // Ya no usamos showOptions()
            //     analyzeExcelFile(fileName);
            //   }else if(choice === 'another'){
            //     appendMessage('user', 'Hacer otra consulta');
            //     // hideOptions(); // Ya no usamos showOptions()
            //     appendMessage('bot', 'Claro, ¿qué más quieres saber sobre los datos?');
            //   }else{
            //     appendMessage('user', 'Finalizar');
            //     // hideOptions(); // Ya no usamos showOptions()
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
    
    response += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #A85A5A; border-radius: 6px;">`;
    response += `<strong style="color: #A85A5A; font-size: 16px;">📌 Caso ${index + 1}${caseNum ? ` - #${caseNum}` : ''}</strong><br/>`;
    
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
    
    response += `<div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #A85A5A; border-radius: 6px;">`;
    response += `<strong style="color: #A85A5A; font-size: 16px;">📌 Caso ${index + 1}${caseNum ? ` - #${caseNum}` : ''}</strong><br/>`;
    
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
  
  // Ofrecer opciones conversacionales
  setTimeout(() => {
    appendMessage('bot', 'Si quieres ver más casos, cambiar el filtro de búsqueda, o finalizar aquí, solo déjamelo saber. Por ejemplo: "ver más casos", "cambiar filtro", o "finalizar". 💡');
  }, 600);
  
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
      
      if(files.length === 1){
        // Solo hay un archivo, analizarlo directamente
        appendMessage('bot', `Encontré el archivo <strong>${files[0].name}</strong>. ¡Voy a analizarlo ahora mismo! 📊`);
        analyzeExcelFile(files[0].name);
        return;
      }
      
      // Múltiples archivos disponibles
      let fileListHTML = '<strong>Archivos disponibles:</strong><br>';
      files.forEach((f, i) => {
        fileListHTML += `${i+1}. ${f.name}<br>`;
      });
      
      appendMessage('bot', fileListHTML);
      setTimeout(() => {
        appendMessage('bot', 'Indicáme el nombre o número del archivo que quieres analizar, o escribe "cancelar" si prefieres hacer otra cosa. 💡');
      }, 500);
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
          appendMessage('bot', 'Si quieres analizar otro archivo, solo dímelo. También puedo ayudarte con otras consultas. ¿Qué te gustaría hacer ahora? 💡');
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
    th.style.cssText = 'padding:8px;background:#A85A5A;color:white;border:1px solid #ddd;text-align:left;font-weight:600;';
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

// ============================================
// 🧠 CLASIFICACIÓN INTELIGENTE POR IA (Reemplaza regex hardcoded)
// ============================================
async function classifyUserIntentWithAI(userText){
  try {
    console.log('🧠 Clasificando intención con IA:', userText);
    
    const response = await fetch('/api/ai/classify-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userText: userText,
        conversationHistory: conversationHistory, // ✅ Enviar historial de conversación
        context: {
          previousSystem: reportState.sistema,
          conversationState: reportState.step
        }
      })
    });
    
    if(!response.ok){
      console.warn('⚠️ Clasificación por IA falló, usando fallback regex');
      return null; // Fallback a regex
    }
    
    const result = await response.json();
    console.log('✅ Clasificación IA:', result);
    
    return {
      intentType: result.intentType, // 'TROUBLESHOOTING', 'HOW_TO', 'ADVISORY', 'DATA_ANALYSIS', 'CREATE_TICKET', 'GREETING', 'SIMPLE_RESPONSE'
      system: result.system, // 'C2M', 'FIELD', 'SALES', 'SERVICE', null
      repository: result.repository, // 'CONFLUENCE', 'EXCEL_KB', 'DATA_ANALYTICS', 'JIRA', 'DIRECT_ANSWER'
      confidence: result.confidence, // 0.0 - 1.0
      keywords: result.keywords || [],
      needsMoreInfo: result.needsMoreInfo || false,
      suggestedQuestion: result.suggestedQuestion || null
    };
    
  } catch(error) {
    console.error('❌ Error en clasificación IA:', error);
    return null; // Fallback a regex
  }
}

function simulateBot(userText){
  const txt = userText.toLowerCase();
  
  console.log('🤖 simulateBot llamado con:', userText);
  
  // PRIORIDAD -3: Detectar si el usuario pregunta por la FUENTE de la información
  const isAskingForSource = /(de donde|de dónde|cual es la fuente|cuál es la fuente|que fuente|qué fuente|fuente|página|pagina|referencia|donde lo encontraste|dónde lo encontraste|sacaste eso|de que manual|de qué manual|que documento|qué documento)/i.test(txt);
  
  if(isAskingForSource && window.lastResponseSources){
    console.log('📚 Usuario preguntando por fuente, mostrar lastResponseSources:', window.lastResponseSources);
    
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    
    setTimeout(() => {
      messagesEl.removeChild(typing);
      
      if(window.lastResponseSources.type === 'PDF_ORACLE'){
        const pages = window.lastResponseSources.pages.join(', ');
        const doc = window.lastResponseSources.document;
        appendMessage('bot', `📄 Esta información proviene del **${doc}**${pages ? `, páginas ${pages}` : ''}.`);
      } else if(window.lastResponseSources.type === 'CONFLUENCE'){
        appendMessage('bot', `📚 Esta información proviene de nuestra documentación interna en Confluence.`);
      } else {
        appendMessage('bot', `📋 Esta información proviene de nuestras fuentes oficiales de documentación.`);
      }
    }, 500);
    return;
  }
  
  // PRIORIDAD -2.5: Detectar si el usuario quiere ver información complementaria de Confluence
  if(window.pendingConfluenceResults && window.pendingConfluenceResults.length > 0){
    const wantsConfluence = /^(s[ií]|yes|ok|okay|dale|claro|muestra|mostrar|quiero|ver|dame)/i.test(txt);
    
    if(wantsConfluence){
      console.log('📚 Usuario quiere ver información complementaria de Confluence');
      
      const typing = document.createElement('div');
      typing.className = 'message bot';
      typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
      typing.classList.add('typing');
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      
      setTimeout(() => {
        messagesEl.removeChild(typing);
        appendMessage('bot', '📚 **Documentación complementaria en Confluence:**');
        
        // Mostrar resultados de Confluence
        window.pendingConfluenceResults.slice(0, 3).forEach((result, i) => {
          const resultDiv = document.createElement('div');
          resultDiv.style.cssText = 'margin:10px 0;padding:12px;background:#e3f2fd;border-left:4px solid #2196f3;border-radius:4px;';
          
          const titleDiv = document.createElement('div');
          titleDiv.style.cssText = 'font-weight:600;color:#1565c0;font-size:14px;margin-bottom:6px;';
          titleDiv.textContent = `📄 ${result.pregunta}`;
          resultDiv.appendChild(titleDiv);
          
          const contentDiv = document.createElement('div');
          contentDiv.style.cssText = 'color:#424242;font-size:13px;line-height:1.5;';
          contentDiv.innerHTML = result.respuesta.substring(0, 300) + '...';
          resultDiv.appendChild(contentDiv);
          
          messagesEl.appendChild(resultDiv);
        });
        
        messagesEl.scrollTop = messagesEl.scrollHeight;
        
        // Limpiar resultados pendientes
        window.pendingConfluenceResults = null;
        window.pendingConfluenceQuery = null;
      }, 600);
      
      return;
    }
  }
  
  // PRIORIDAD -2: Detectar consultas VAGAS que necesitan más detalles
  const isVagueQuery = detectVagueQuery(txt, userText);
  
  if(isVagueQuery){
    console.log('💬 Consulta vaga detectada, pidiendo más detalles');
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
  
  // ============================================
  // 🧠 CLASIFICACIÓN INTELIGENTE CON IA (NUEVA ARQUITECTURA)
  // ============================================
  classifyUserIntentWithAI(userText).then(aiClassification => {
    if(aiClassification && aiClassification.confidence > 0.7){
      console.log('✅ Usando clasificación IA:', aiClassification.intentType);
      
      // Guardar sistema detectado
      if(aiClassification.system){
        reportState.sistema = aiClassification.system;
      }
      
      // Enrutar según tipo de intención detectado por IA
      const typing = document.createElement('div');
      typing.className = 'message bot';
      typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
      typing.classList.add('typing');
      messagesEl.appendChild(typing);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      setTimeout(()=>{
        messagesEl.removeChild(typing);
        
        switch(aiClassification.intentType){
          case 'TROUBLESHOOTING':
            appendMessage('bot', '🤖 Analizando soluciones para tu problema con IA...');
            searchKnowledgeBaseForProblem(userText, aiClassification.system);
            break;
            
          case 'HOW_TO':
          case 'QUESTION':
            // 📄 Preguntas de conocimiento: PRIORIZA PDF Oracle (doc oficial), complementa con Confluence
            appendMessage('bot', '🤖 Analizando documentación técnica con IA...');
            searchInFAQsAndPDF(userText, aiClassification.system);
            break;
            
          case 'ADVISORY':
          case 'LEARNING':
            handleAdvisoryRequest();
            break;
            
          case 'DATA_ANALYSIS':
          case 'ANALYTICS':
            handleDataAnalysisRequest();
            break;
            
          case 'CREATE_TICKET':
          case 'REPORT_INCIDENT':
            appendMessage('bot', 'Perfecto, vamos a crear un reporte de incidencia para ti.');
            handleReportIncident();
            break;
            
          case 'GREETING':
            const reply = botReply(userText);
            appendMessage('bot', reply);
            break;
            
          default:
            // Si la IA no está segura, usar respuesta genérica
            console.log('⚠️ Tipo de intención desconocido, usando botReply');
            const genericReply = botReply(userText);
            appendMessage('bot', genericReply);
        }
      }, 700);
      
      return; // Salir, ya procesamos con IA
    }
    
    // ============================================
    // 🔄 FALLBACK: Si IA falla o baja confianza, usar REGEX (sistema legacy)
    // ============================================
    console.log('⚠️ Clasificación IA falló o baja confianza, usando regex fallback');
    executeRegexBasedClassification(userText, txt);
  }).catch(error => {
    console.error('❌ Error en clasificación IA, usando regex fallback:', error);
    executeRegexBasedClassification(userText, txt);
  });
}

// ============================================
// 🔄 FUNCIÓN LEGACY: Clasificación basada en REGEX (Fallback)
// ============================================
function executeRegexBasedClassification(userText, txt){
  console.log('🔄 Ejecutando clasificación regex legacy');
  
  // PRIORIDAD 0: Detectar si pide ver caso(s) específico(s)
  const viewCasePattern = /(?:mu[ée]strame|mostrar|ver|dame|quiero ver|necesito ver)\s+(?:la\s+)?(?:soluci[oó]n|informaci[oó]n|detalle|datos)?\s*(?:del|al|de|a)?\s*(?:caso|ticket|registro)s?\s*(?:n[uú]mero|#)?\s*([\d\s,yalog]+)/i;
  const viewCaseMatch = txt.match(viewCasePattern);
  
  if(viewCaseMatch){
    // Extraer números de casos (pueden ser varios separados por coma, "y", "a", "o")
    const casosText = viewCaseMatch[1];
    const caseNumbers = casosText.match(/\d+/g);
    
    if(caseNumbers && caseNumbers.length > 0){
      appendMessage('bot', `🤖 Consultando información del caso${caseNumbers.length > 1 ? 's' : ''} ${caseNumbers.join(', ')}...`);
      showCaseDetails(caseNumbers);
      return;
    }
  }
  
  // PRIORIDAD 0.5: Detectar frases ambiguas sobre reportar/crear incidencias
  // Si es ambiguo, ofrecer opciones
  if(/(reportar|crear|registrar|abrir|levantar|necesito|quiero|puedo|como).*(reportar|crear|registrar|abrir|levantar).*(incidencia|incidente|problema|caso|ticket|falla|error)/i.test(txt) && !/(crear|nuevo)\s+(ticket|caso)/i.test(txt)){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
  
  // ==========================================
  // CRÍTICO: DETECTAR PREGUNTAS DE SEGUIMIENTO ANTES DE VALIDAR ALCANCE
  // ==========================================
  const followUpPatterns = [
    /^(muestra|muestrame|dame|dime|enseña|enséñame|explica|explicame|detalla|detallame)(\s+)(un\s+)?(ejemplo|ejemplos|caso|casos|detalles|mas|más)/i,
    /^(como|cómo)(\s+)(funciona|hago|se\s+hace|trabajo|opera)/i,
    /^(que|qué)(\s+)(es|significa|quiere\s+decir|pasa)/i,
    /^(por\s*que|por\s*qué|porque)/i,
    /^(y\s+)?si\s+(tengo|hay|existe)/i,
    /^(puedo|puedes|podría|se\s+puede)/i,
    /^(donde|dónde|cuando|cuándo|quien|quién)/i,
    /^(otro|otra|otros|otras|adicional|más)/i,
    /^(sigue|continua|continúa|siguiente|después)/i
  ];
  
  const isFollowUpQuestion = followUpPatterns.some(pattern => pattern.test(txt));
  
  if (isFollowUpQuestion && conversationHistory.length > 0) {
    console.log('✅ Pregunta de SEGUIMIENTO detectada - Saltando validación de alcance');
    // Es una pregunta de seguimiento con historial, procesar normalmente
    // NO validar si está fuera de alcance
  } else {
    // VALIDAR si está fuera del alcance SOLO si NO es pregunta de seguimiento
    if(isOutOfScopeQuestion(userText)){
      console.log('⚠️ Pregunta fuera de alcance detectada en simulateBot');
      showOutOfScopeMessage();
      return;
    }
  }
  
  // Detectar si es una consulta de conocimiento/asesoría (buscar en Confluence, NO usar aprendizaje)
  const isKnowledgeQuery = /(como|cómo|que es|qué es|para que|para qué|donde|dónde|cuando|cuándo|cual|cuál|por que|por qué|porque|explica|funciona|proceso|procedimiento|tutorial|guia|guía|manual|documentacion|documentación|ayuda|instrucciones|pasos|configurar|configuración|error|problema|fallo|solucion|solución|cargos facturables|facturación|factura|billing|invoice|payment|deuda|debt|gesti[oó]n|management|cuenta|account|contrato|contract|cliente|customer|medidor|meter|orden|order|servicio|service|certificado|certificate|validar|validate|corregir|correct|reportar|report|crear|create|actualizar|update|eliminar|delete|migrar|migrate)/.test(txt);
  
  console.log('🔍 isKnowledgeQuery:', isKnowledgeQuery);
  
  // Si es una consulta de conocimiento/FAQ, buscar en PDF + Confluence
  if(isKnowledgeQuery && txt.length > 5 && !isDataAnalysisQuery){
    console.log('➡️ Redirigiendo a searchInFAQsAndPDF (con PDF de Oracle)');
    // Buscar en PDF de Oracle + Confluence para preguntas de conocimiento
    searchInFAQsAndPDF(userText, null);
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
      // hideOptions(); // Eliminada - ahora todo es conversacional
      reportState.sistema = sistema;
      appendMessage('bot', `Perfecto, has seleccionado ${sistema}. 👍`);
      askForAdvisoryTopic(sistema);
      return;
    } else if(/c2m|field|sales|service|customer.*meter|trabajo.*campo|ventas|servicio/.test(txt)){
      // El usuario mencionó un sistema pero no pudimos detectarlo claramente
      waitingForAdvisorySystem = false;
      // hideOptions(); // Eliminada - ahora todo es conversacional
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
      // hideOptions(); // Eliminada - ahora todo es conversacional
      reportState.sistema = sistema;
      appendMessage('bot', `Perfecto, has seleccionado ${sistema}. 👍`);
      
      appendMessage('bot', `Ahora describe el error o problema que tienes en ${sistema}:`);
      askForErrorDescription();
      return;
    } else if(/c2m|field|sales|service|otro|customer.*meter|trabajo.*campo|ventas|servicio/.test(txt)){
      waitingForIncidentSystem = false;
      // hideOptions(); // Ya no usamos showOptions()
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
    // currentOptions = []; // Ya no usamos showOptions()
    
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      // hideOptions(); // Ya no usamos showOptions()
      
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      appendMessage('bot', 'Perfecto, vamos a crear un reporte de incidencia para ti.');
      // hideOptions(); // Eliminada - ahora todo es conversacional
      handleReportIncident();
    }, 700);
    return;
  }
  
  // Detectar solicitud de asesoría
  const isAdvisoryRequest = /asesoría|asesoria|consulta|consultoria|consultoría|quiero aprender|necesito información|capacitación|capacitacion|tutorial|guía|guia|orientación|orientacion/.test(txt);
  
  if(isAdvisoryRequest){
    const typing = document.createElement('div');
    typing.className = 'message bot';
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
    typing.classList.add('typing');
    messagesEl.appendChild(typing);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    setTimeout(()=>{
      messagesEl.removeChild(typing);
      // hideOptions(); // Ya no usamos showOptions()
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
  typing.innerHTML = '<span class=\"typing-text\">Escribiendo</span><span class=\"typing-dots\"><span></span><span></span><span></span></span>';
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
    
    // Si la respuesta es sobre capacidades, ofrecer ejemplos conversacionales
    if(/qué puedes|que puedes|qué sabes|que sabes|qué haces|que haces|capacidades|funciones|ayuda|help|para qué sirves|para que sirves/i.test(userText)){
      setTimeout(() => {
        appendMessage('bot', '¿Qué funcionalidad te gustaría probar ahora? Por ejemplo, puedes escribir: "buscar en FAQs", "analizar datos Excel", "reportar incidencia", "solicitar asesoría", o "ver memoria de aprendizaje". 💡');
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
      // hideOptions(); // Ya no usamos showOptions()
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
  
  // 🎫 MANEJO ESPECIAL: Si estamos en el flujo de creación de ticket esperando la descripción
  if(smartTicketState && smartTicketState.step === 'description'){
    if(text.length < 15){
      appendMessage('bot', '⚠️ Por favor, describe tu problema con al menos 15 caracteres.');
      return;
    }
    
    smartTicketState.description = text;
    appendMessage('user', text);
    messageInput.value = '';
    messageInput.placeholder = 'Escribe un mensaje...';
    
    // Buscar soluciones sugeridas antes de continuar
    searchSuggestedSolutions(text);
    return;
  }
  
  // Detectar comandos especiales que siempre deben procesarse
  const isSpecialCommand = /^(salir|exit|cerrar|terminar|finalizar)$/i.test(text) ||
                          /reportar.*incidencia|quiero reportar|tengo.*problema|error.*sistema|error.*c2m|problema.*c2m|fallo.*c2m/.test(txt);
  
  // Si hay opciones activas pero el usuario escribe un comando especial, procesarlo
  if(currentOptions.length > 0 && isSpecialCommand){
    // hideOptions(); // Eliminada - ahora todo es conversacional
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
      // hideOptions(); // Eliminada - ahora todo es conversacional
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

// ============================================
// MENSAJE DE BIENVENIDA - CONVERSACIONAL
// ============================================
function showWelcomeMessage() {
  setTimeout(() => {
    appendMessage('bot', '<h2 style="font-size: 24px; font-weight: 700; margin: 0 0 12px 0; color: #8B0000;">¡Hola, Analista! 👋</h2><p style="margin: 0;">Estoy aquí para ayudarte a resolver tus incidencias. Pregúntame lo que quieras y con gusto te ayudaré. 🤖</p>');
  }, 300);
  
  setTimeout(() => {
    appendMessage('bot', 'Tengo acceso a toda la documentación técnica, casos históricos y puedo ayudarte con consultas sobre C2M, Field, Sales, Service y más. También puedo analizar datos de archivos Excel. ¿En qué puedo ayudarte hoy? 💡');
  }, 800);
}

// initial greeting
window.addEventListener('load', ()=>{
  setTimeout(()=>{
    showWelcomeMessage();
  }, 300);
});
