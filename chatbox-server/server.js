const express = require('express');
const axios = require('axios');
const cors = require('cors');
const nodemailer = require('nodemailer');
const xlsx = require('xlsx');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse'); // 📄 Para leer PDFs de Oracle
const learningModule = require('./learning-endpoints');
const aiService = require('./ai-service');
const c2mGuide = require('./c2m-guide');
const multiAI = require('./multi-ai-service'); // 🤖 Sistema Multi-IA (Claude + GPT-4 + Gemini)
const nlpService = require('./nlp-service'); // 🧠 Análisis NLP + Entity Recognition
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentar límite para análisis grandes
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('../chatbox'));

const PORT = process.env.PORT || 3001;
const JIRA_BASE = process.env.JIRA_BASE; // e.g. https://your-domain.atlassian.net
const JIRA_AUTH = process.env.JIRA_EMAIL && process.env.JIRA_TOKEN ? Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_TOKEN}`).toString('base64') : null;
const CONFLUENCE_BASE = process.env.CONFLUENCE_BASE; // e.g. https://your-domain.atlassian.net/wiki
const CONFLUENCE_AUTH = process.env.CONFLUENCE_EMAIL && process.env.CONFLUENCE_TOKEN ? Buffer.from(`${process.env.CONFLUENCE_EMAIL}:${process.env.CONFLUENCE_TOKEN}`).toString('base64') : null;

// Configure email transporter
let transporter = null;
if(process.env.EMAIL_USER && process.env.EMAIL_PASS){
  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

app.get('/health', (req, res) => res.json({ ok: true }));

// ============================================
// UTILIDADES PARA MANEJO DE FECHAS DE EXCEL
// ============================================

/**
 * Convierte un número de serie de Excel a fecha legible
 * Excel almacena fechas como días desde 1900-01-01
 * @param {number} serial - Número de serie de Excel (ej: 45472)
 * @returns {string} - Fecha en formato DD/MM/YYYY
 */
function excelSerialToDate(serial) {
  if (!serial || isNaN(serial)) return serial;
  
  // Si no es un número en el rango de fechas de Excel, devolverlo tal cual
  if (serial < 1 || serial > 100000) return serial;
  
  // Excel considera 1900-01-01 como día 1 (pero tiene un bug: considera 1900 bisiesto)
  const excelEpoch = new Date(1899, 11, 30); // 30 de diciembre de 1899
  const days = Math.floor(serial);
  const milliseconds = Math.round((serial - days) * 86400000);
  
  const date = new Date(excelEpoch.getTime() + days * 86400000 + milliseconds);
  
  // Formatear como DD/MM/YYYY
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Normaliza fechas que vienen en formato texto
 * Si viene como "1/10/2025" (DD/MM/YYYY o MM/DD/YYYY), lo deja tal cual
 * Solo asegura formato con ceros: "01/10/2025"
 * @param {string} dateStr - Fecha en formato texto (ej: "1/10/2025 08:02:20")
 * @returns {string} - Fecha normalizada con ceros
 */
function normalizeDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr;
  
  // Intentar parsear fechas en formato "D/M/YYYY" o "D/M/YYYY HH:MM:SS"
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  
  if (match) {
    const [, part1, part2, year] = match;
    
    // Asumimos formato DD/MM/YYYY (día/mes/año)
    // Solo agregamos ceros a la izquierda si faltan
    const dayOrMonth1 = String(part1).padStart(2, '0');
    const dayOrMonth2 = String(part2).padStart(2, '0');
    
    // Mantener el orden original, solo agregar ceros
    return `${dayOrMonth1}/${dayOrMonth2}/${year}`;
  }
  
  return dateStr;
}

/**
 * Detecta si un valor parece ser una fecha de Excel (número entre 1 y 100000)
 * @param {any} value - Valor a verificar
 * @returns {boolean}
 */
function isExcelDate(value) {
  return typeof value === 'number' && value > 1 && value < 100000;
}

/**
 * Convierte todas las fechas de Excel en un objeto a formato legible
 * @param {Object} row - Fila de datos del Excel
 * @returns {Object} - Fila con fechas convertidas
 */
function convertExcelDates(row) {
  const converted = {};
  
  Object.keys(row).forEach(key => {
    const value = row[key];
    
    // Si la columna tiene "fecha", "date", "creación", "cierre", etc. en el nombre
    const isDateColumn = /fecha|date|creaci[oó]n|cierre|modificaci[oó]n|registro|[uú]ltimo.*cambio|create.*date|close.*date/i.test(key);
    
    if (isDateColumn) {
      // Caso 1: Valor es un número de Excel
      if (isExcelDate(value)) {
        converted[key] = excelSerialToDate(value);
      }
      // Caso 2: Valor es texto con formato de fecha (ej: "1/10/2025 08:02:20")
      else if (typeof value === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) {
        converted[key] = normalizeDateString(value);
      }
      // Caso 3: Dejar tal cual
      else {
        converted[key] = value;
      }
    } else {
      converted[key] = value;
    }
  });
  
  return converted;
}

// ============================================

app.get('/api/debug/config', (req, res) => {
  res.json({
    confluence_base: CONFLUENCE_BASE ? 'configured' : 'NOT SET',
    confluence_space: process.env.CONFLUENCE_SPACE || 'KMCELSIA',
    confluence_auth: CONFLUENCE_AUTH ? 'configured' : 'NOT SET',
    jira_base: JIRA_BASE ? 'configured' : 'NOT SET',
    jira_auth: JIRA_AUTH ? 'configured' : 'NOT SET',
    email_configured: transporter ? 'yes' : 'no'
  });
});

app.get('/api/debug/search-html', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) {
    return res.status(500).json({ error: 'Confluence not configured' });
  }
  
  const query = req.query.q || 'solución';
  const space = process.env.CONFLUENCE_SPACE || 'KMCELSIA';
  const cql = `type=page AND space="${space}" AND (title ~ "${query}" OR text ~ "${query}")`;
  
  try{
    const r = await axios.get(`${CONFLUENCE_BASE}/rest/api/content/search`, {
      headers: { 'Authorization': `Basic ${CONFLUENCE_AUTH}` },
      params: { cql, limit: 3, expand: 'body.storage,version' }
    });
    
    const results = (r.data.results || []).map((page, idx) => ({
      index: idx,
      title: page.title,
      id: page.id,
      html_first_1000_chars: page.body?.storage?.value?.substring(0, 1000) || 'No HTML',
      html_length: page.body?.storage?.value?.length || 0
    }));
    
    res.status(200).json({ results });
  }catch(err){
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/jira/create-issue', async (req, res) => {
  if(!JIRA_BASE || !JIRA_AUTH) return res.status(500).json({ error: 'Jira not configured on server' });
  const body = {
    fields: {
      project: { key: req.body.projectKey || 'TEST' },
      summary: req.body.summary || 'Issue desde chatbox',
      description: req.body.description || '',
      issuetype: { name: req.body.issueType || 'Task' }
    }
  };
  try{
    const r = await axios.post(`${JIRA_BASE}/rest/api/3/issue`, body, {
      headers: { 'Authorization': `Basic ${JIRA_AUTH}`, 'Content-Type': 'application/json' }
    });
    res.status(r.status).json(r.data);
  }catch(err){
    const status = err.response?.status || 500;
    res.status(status).json(err.response?.data || { error: err.message });
  }
});

app.get('/api/jira/search', async (req, res) => {
  if(!JIRA_BASE || !JIRA_AUTH) return res.status(500).json({ error: 'Jira not configured on server' });
  const jql = req.query.jql || 'project = TEST ORDER BY created DESC';
  try{
    const r = await axios.get(`${JIRA_BASE}/rest/api/3/search`, {
      headers: { 'Authorization': `Basic ${JIRA_AUTH}` },
      params: { jql }
    });
    res.status(r.status).json(r.data);
  }catch(err){
    const status = err.response?.status || 500;
    res.status(status).json(err.response?.data || { error: err.message });
  }
});

app.post('/api/confluence/create-page', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) return res.status(500).json({ error: 'Confluence not configured on server' });
  const body = {
    type: 'page',
    title: req.body.title || 'Página creada desde chatbox',
    space: { key: req.body.spaceKey || 'DOC' },
    body: {
      storage: {
        value: req.body.content || '<p>Contenido generado desde chatbox</p>',
        representation: 'storage'
      }
    }
  };
  try{
    const r = await axios.post(`${CONFLUENCE_BASE}/rest/api/content`, body, {
      headers: { 'Authorization': `Basic ${CONFLUENCE_AUTH}`, 'Content-Type': 'application/json' }
    });
    res.status(r.status).json(r.data);
  }catch(err){
    const status = err.response?.status || 500;
    res.status(status).json(err.response?.data || { error: err.message });
  }
});

app.get('/api/confluence/search-knowledge', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) {
    console.error('Confluence not configured:', { CONFLUENCE_BASE, CONFLUENCE_AUTH: !!CONFLUENCE_AUTH });
    return res.status(500).json({ error: 'Confluence not configured on server' });
  }
  
  const query = req.query.q || '';
  const space = process.env.CONFLUENCE_SPACE || 'KMCELSIA';
  
  // Split query into keywords for strict matching
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2);
  
  if(keywords.length === 0){
    return res.status(400).json({ error: 'Query too short, use at least 3 characters' });
  }
  
  // Build CQL with strict keyword matching
  const keywordCQL = keywords.map(kw => `text ~ "${kw}"`).join(' AND ');
  const cql = `type=page AND space="${space}" AND (${keywordCQL})`;
  
  console.log(`Searching Confluence: ${CONFLUENCE_BASE}, Keywords: [${keywords.join(', ')}], CQL: ${cql}`);
  
  try{
    const r = await axios.get(`${CONFLUENCE_BASE}/rest/api/content/search`, {
      headers: { 'Authorization': `Basic ${CONFLUENCE_AUTH}` },
      params: { cql, limit: 20, expand: 'body.storage,version' }
    });
    
    console.log(`Found ${r.data.results.length} results, filtering by keyword match...`);
    
    // Filter results to only include pages that match ALL keywords
    const filtered = (r.data.results || []).filter(page => {
      const bodyHtml = (page.body?.storage?.value || '').toLowerCase();
      const title = (page.title || '').toLowerCase();
      const fullText = `${title} ${bodyHtml}`;
      
      // Check if ALL keywords are present
      return keywords.every(kw => fullText.includes(kw));
    });
    
    console.log(`After filtering: ${filtered.length} results match all keywords`);
    
    const results = filtered.map(page=>{
      // Extract body content
      const bodyHtml = page.body?.storage?.value || '';
      
      // === NUEVA FUNCIONALIDAD: Extraer imágenes ===
      const images = [];
      const pageId = page.id;
      
      // Patron 1: Imágenes con <img src="/download/attachments/...">
      const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
      let imgMatch;
      while((imgMatch = imgRegex.exec(bodyHtml)) !== null){
        let imgSrc = imgMatch[1];
        // Convertir rutas relativas a absolutas
        if(imgSrc.startsWith('/')){
          imgSrc = `${CONFLUENCE_BASE}${imgSrc}`;
        }
        // Usar proxy para autenticación
        const proxyUrl = `/api/confluence/image-proxy?url=${encodeURIComponent(imgSrc)}`;
        images.push(proxyUrl);
      }
      
      // Patron 2: Attachments en formato Confluence Storage <ri:attachment ri:filename="...">
      const attachmentRegex = /<ri:attachment\s+ri:filename=["']([^"']+)["']/gi;
      let attachMatch;
      while((attachMatch = attachmentRegex.exec(bodyHtml)) !== null){
        const filename = attachMatch[1];
        // Construir URL del attachment
        const attachmentUrl = `${CONFLUENCE_BASE}/download/attachments/${pageId}/${encodeURIComponent(filename)}`;
        // Usar proxy para autenticación
        const proxyUrl = `/api/confluence/image-proxy?url=${encodeURIComponent(attachmentUrl)}`;
        images.push(proxyUrl);
      }
      
      // Eliminar duplicados
      const uniqueImages = [...new Set(images)];
      console.log(`Página "${page.title}" tiene ${uniqueImages.length} imagen(es)`);
      
      // Extract "Solución" field ONLY - strict matching
      let solucion = null;
      
      // Match patterns based on actual Confluence HTML structure
      const patterns = [
        // <h2>Solución</h2> followed by content
        /<h2[^>]*>.*?Soluci[óo]n.*?<\/h2>\s*<p[^>]*>([^<]+)<\/p>/is,
        // <h3>Solucion</h3> followed by <p>
        /<h3>Soluci[óo]n<\/h3>\s*<p>([^<]+)<\/p>/i,
        // <h3>Solucion</h3> followed by <strong> and text
        /<h3>Soluci[óo]n<\/h3>\s*<p>\s*<strong>([^<]+)<\/strong>/i,
        // Extract from <ol> list after Solución header
        /<h2[^>]*>.*?Soluci[óo]n.*?<\/h2>.*?<ol[^>]*>.*?<li[^>]*>\s*<p[^>]*>([^<]+)<\/p>/is,
        /<h3>Soluci[óo]n<\/h3>.*?<ol[^>]*>.*?<li[^>]*>\s*<p[^>]*>([^<]+)<\/p>/is
      ];
      
      for(let pattern of patterns){
        const match = bodyHtml.match(pattern);
        if(match && match[1]){
          solucion = match[1].trim().substring(0, 500); // Limit to 500 chars
          break;
        }
      }
      
      // Extract plain text excerpt (first 300 chars)
      const textOnly = bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const excerpt = textOnly.substring(0, 300) + (textOnly.length > 300 ? '...' : '');
      
      return {
        title: page.title,
        url: `${CONFLUENCE_BASE}${page._links.webui}`,
        excerpt: excerpt || 'Sin vista previa disponible',
        solucion: solucion || 'No se encontró solución en esta página',
        id: page.id,
        images: uniqueImages // URLs de imágenes extraídas
      };
    });
    
    res.status(200).json({ results, total: results.length });
  }catch(err){
    const errorMsg = err.message || 'Unknown error';
    const status = err.response?.status || 500;
    const errorData = err.response?.data || {};
    console.error('Confluence search error:', { status, errorMsg, errorData });
    
    res.status(status).json({ 
      error: `Confluence search failed: ${errorMsg}`,
      details: errorData
    });
  }
});

// ============================================
// PROXY DE IMÁGENES DE CONFLUENCE
// ============================================
// Endpoint para servir imágenes de Confluence con autenticación
app.get('/api/confluence/image-proxy', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) {
    return res.status(500).json({ error: 'Confluence not configured' });
  }
  
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  
  try {
    // Descargar la imagen desde Confluence con autenticación
    const response = await axios.get(url, {
      headers: { 
        'Authorization': `Basic ${CONFLUENCE_AUTH}`
      },
      responseType: 'arraybuffer' // Importante para imágenes binarias
    });
    
    // Determinar content-type
    const contentType = response.headers['content-type'] || 'image/png';
    
    // Enviar la imagen al cliente
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas
    res.send(response.data);
    
  } catch(err) {
    console.error('❌ Error al cargar imagen:', err.message);
    res.status(500).json({ 
      error: 'Error al cargar imagen',
      details: err.message 
    });
  }
});

app.post('/api/jira/create-ticket', async (req, res) => {
  if(!JIRA_BASE || !JIRA_AUTH) {
    return res.status(500).json({ error: 'Jira not configured on server' });
  }
  
  console.log('📥 Datos recibidos para crear ticket:', req.body);
  
  // Soportar tanto el formato antiguo (searchQuery) como el nuevo (nombre, apellido, correo, descripcion)
  const { 
    searchQuery, 
    sistema, 
    modulo, 
    results,
    nombre,
    apellido,
    correo,
    email,
    descripcion,
    description,
    prioridad,
    priority
  } = req.body;
  
  const timestamp = new Date().toLocaleString('es-ES');
  const todayDate = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
  
  let summary, fullDescription;
  
  // Nuevo formato: ticket desde formulario con datos de usuario
  if(nombre && (descripcion || description)){
    const userInfo = `👤 Información del Usuario:\nNombre: ${nombre} ${apellido || ''}\nCorreo: ${correo || email || 'No proporcionado'}`;
    const issueDescription = descripcion || description;
    
    // Summary debe ser una sola línea (sin saltos de línea)
    const firstLine = issueDescription.split('\n')[0].trim();
    const summaryText = firstLine.length > 80 ? firstLine.substring(0, 80) + '...' : firstLine;
    summary = `[AI-Assisted Support Agent] ${nombre} - ${summaryText}`;
    
    fullDescription = `${userInfo}\n\n📝 Descripción del Problema:\n${issueDescription}\n\nPrioridad: ${prioridad || priority || 'Media'}\nSistema: ${sistema || 'General'}\n\nTimestamp: ${timestamp}`;
  } 
  // Formato antiguo: búsqueda sin resultados
  else {
    const foundResults = results && results.length > 0 
      ? `Encontrados ${results.length} resultado(s):\n${results.map((r, i) => `${i+1}. ${r.title}`).join('\n')}`
      : 'No se encontraron resultados en la base de conocimiento';
    
    summary = `[AI-Assisted Support Agent] Búsqueda: ${searchQuery} - ${sistema || 'General'}`;
    fullDescription = `Usuario buscó: "${searchQuery}"\n\nSistema: ${sistema || 'No especificado'}\nMódulo: ${modulo || 'No especificado'}\n\n${foundResults}\n\nTimestamp: ${timestamp}`;
  }
  
  const issueData = {
    fields: {
      project: { key: 'CD' },
      summary: summary,
      description: fullDescription,
      issuetype: { name: 'Task' },
      customfield_10233: todayDate // Fecha Fin Tarea (hoy)
    }
  };
  
  console.log('📤 Enviando a Jira:', issueData);
  
  try {
    const response = await axios.post(
      `${JIRA_BASE}/rest/api/2/issue`,
      issueData,
      { headers: { 'Authorization': `Basic ${JIRA_AUTH}`, 'Content-Type': 'application/json' } }
    );
    
    console.log(`✅ Jira ticket creado: ${response.data.key}`);
    res.status(201).json({ 
      success: true, 
      ticketNumber: response.data.key, // Frontend espera ticketNumber
      ticketKey: response.data.key,    // Mantener compatibilidad
      key: response.data.key,
      id: response.data.id
    });
  } catch(err) {
    const errorMsg = err.message || 'Unknown error';
    const status = err.response?.status || 500;
    const errorData = err.response?.data || {};
    console.error('❌ Error creando ticket en Jira:', { status, errorMsg, errorData });
    
    res.status(status).json({ 
      success: false,
      error: `Failed to create ticket: ${errorMsg}`,
      details: errorData
    });
  }
});

app.post('/api/contact-agent', (req, res) => {
  const { contactInfo, sistema, modulo } = req.body;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Agent contact request: ${contactInfo} | Sistema: ${sistema} | Módulo: ${modulo}`);
  
  if(transporter && process.env.SUPPORT_EMAIL){
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.SUPPORT_EMAIL,
      subject: '[Chatbox] Nueva solicitud de contacto con agente',
      html: `
        <h2>Nueva Solicitud de Contacto</h2>
        <p><strong>Información de contacto:</strong> ${contactInfo}</p>
        <p><strong>Sistema:</strong> ${sistema || 'No especificado'}</p>
        <p><strong>Módulo:</strong> ${modulo || 'No especificado'}</p>
        <p><strong>Timestamp:</strong> ${timestamp}</p>
        <hr/>
        <p>Por favor, contacta al usuario lo antes posible.</p>
      `
    };
    
    transporter.sendMail(mailOptions, (err, info)=>{
      if(err){
        console.error('Error sending email:', err);
      }else{
        console.log('Email sent:', info.response);
      }
    });
  }
  
  res.status(200).json({ success: true, message: 'Solicitud registrada' });
});

// Función para decodificar entidades HTML
function decodeHtmlEntities(text) {
  const entities = {
    '&iquest;': '¿',
    '&iexcl;': '¡',
    // Vocales con acento agudo
    '&aacute;': 'á',
    '&eacute;': 'é',
    '&iacute;': 'í',
    '&oacute;': 'ó',
    '&uacute;': 'ú',
    '&Aacute;': 'Á',
    '&Eacute;': 'É',
    '&Iacute;': 'Í',
    '&Oacute;': 'Ó',
    '&Uacute;': 'Ú',
    // Vocales con acento grave
    '&agrave;': 'à',
    '&egrave;': 'è',
    '&igrave;': 'ì',
    '&ograve;': 'ò',
    '&ugrave;': 'ù',
    '&Agrave;': 'À',
    '&Egrave;': 'È',
    '&Igrave;': 'Ì',
    '&Ograve;': 'Ò',
    '&Ugrave;': 'Ù',
    // Vocales con circunflejo
    '&acirc;': 'â',
    '&ecirc;': 'ê',
    '&icirc;': 'î',
    '&ocirc;': 'ô',
    '&ucirc;': 'û',
    '&Acirc;': 'Â',
    '&Ecirc;': 'Ê',
    '&Icirc;': 'Î',
    '&Ocirc;': 'Ô',
    '&Ucirc;': 'Û',
    // Diéresis
    '&auml;': 'ä',
    '&euml;': 'ë',
    '&iuml;': 'ï',
    '&ouml;': 'ö',
    '&uuml;': 'ü',
    '&Auml;': 'Ä',
    '&Euml;': 'Ë',
    '&Iuml;': 'Ï',
    '&Ouml;': 'Ö',
    '&Uuml;': 'Ü',
    // Ñ y tildes
    '&ntilde;': 'ñ',
    '&Ntilde;': 'Ñ',
    // Otros caracteres especiales
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&ndash;': '–',
    '&mdash;': '—',
    '&hellip;': '...',
    '&laquo;': '«',
    '&raquo;': '»',
    '&bull;': '•',
    '&deg;': '°',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&euro;': '€',
    '&pound;': '£',
    '&yen;': '¥',
    '&cent;': '¢',
    '&sect;': '§',
    '&para;': '¶',
    '&middot;': '·',
    '&times;': '×',
    '&divide;': '÷',
    '&plusmn;': '±',
    '&frac14;': '¼',
    '&frac12;': '½',
    '&frac34;': '¾'
  };
  
  let decoded = text;
  for (const [entity, char] of Object.entries(entities)) {
    decoded = decoded.replace(new RegExp(entity, 'g'), char);
  }
  
  // Decodificar entidades numéricas (&#número;)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  return decoded;
}

// Función auxiliar para limpiar HTML preservando espacios
function cleanHtmlText(html) {
  if (!html) return '';
  
  let text = html;
  
  // Convertir etiquetas de bloque en saltos de línea
  text = text.replace(/<\/?(p|div|br|h1|h2|h3|h4|h5|h6|li|tr)[^>]*>/gi, ' ');
  
  // Convertir saltos de línea HTML en espacios
  text = text.replace(/<br\s*\/?>/gi, ' ');
  
  // Eliminar el resto de etiquetas HTML
  text = text.replace(/<[^>]+>/g, ' ');
  
  // Reemplazar múltiples espacios por uno solo
  text = text.replace(/\s+/g, ' ');
  
  // Limpiar y retornar
  return text.trim();
}

// Endpoint para buscar en Preguntas Frecuentes
app.get('/api/confluence/faq-search', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) {
    return res.status(500).json({ error: 'Confluence not configured' });
  }
  
  const query = req.query.q || '';
  const sistema = req.query.sistema || ''; // C2M, FIELD, SALES, SERVICE
  
  const FAQ_PAGE_ID = '3645014017'; // ID de la página de Preguntas Frecuentes
  
  console.log(`Buscando en FAQs: query="${query}", sistema="${sistema}"`);
  
  try {
    // Obtener el contenido de la página de FAQs
    const response = await axios.get(`${CONFLUENCE_BASE}/rest/api/content/${FAQ_PAGE_ID}`, {
      headers: { 
        'Authorization': `Basic ${CONFLUENCE_AUTH}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      params: { expand: 'body.storage' }
    });
    
    console.log('Respuesta de Confluence recibida, tipo:', typeof response.data);
    
    if(!response.data || typeof response.data !== 'object') {
      throw new Error('Respuesta inválida de Confluence');
    }
    
    const bodyHtml = response.data.body?.storage?.value || '';
    
    if(!bodyHtml) {
      console.log('No se encontró contenido HTML en la página');
      return res.status(200).json({ 
        success: true,
        results: [],
        total: 0,
        message: 'No se encontró contenido en la página de FAQs'
      });
    }
    
    console.log('Contenido HTML obtenido, longitud:', bodyHtml.length);
    
    // Parsear la tabla HTML
    const results = [];
    
    // Buscar todas las filas de la tabla (tr)
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    const rows = [...bodyHtml.matchAll(rowRegex)];
    
    // Saltar la primera fila (encabezados)
    for(let i = 1; i < rows.length; i++) {
      const rowContent = rows[i][1];
      
      // Extraer las celdas (td)
      const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;
      const cells = [...rowContent.matchAll(cellRegex)];
      
      if(cells.length >= 3) {
        // Extraer texto limpio de cada celda y decodificar entidades HTML
        const pregunta = decodeHtmlEntities(cleanHtmlText(cells[0][1]));
        const aplicacion = decodeHtmlEntities(cleanHtmlText(cells[1][1]));
        const respuesta = decodeHtmlEntities(cleanHtmlText(cells[2][1]));
        
        // Extraer columnas adicionales en el orden correcto: NO. Caso, Fecha Creación, Especialista, Funcionalidad
        const numeroCaso = cells.length >= 4 ? decodeHtmlEntities(cleanHtmlText(cells[3][1])) : null;
        const fechaCreacion = cells.length >= 5 ? decodeHtmlEntities(cleanHtmlText(cells[4][1])) : null;
        const especialista = cells.length >= 6 ? decodeHtmlEntities(cleanHtmlText(cells[5][1])) : null;
        const funcionalidad = cells.length >= 7 ? decodeHtmlEntities(cleanHtmlText(cells[6][1])) : null;
        
        // Validar si la aplicación coincide con el sistema solicitado
        const sistemaMatch = !sistema || 
                            aplicacion.toUpperCase().includes(sistema.toUpperCase()) ||
                            sistema === 'General';
        
        // Validar si la pregunta contiene las palabras clave del query
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const preguntaLower = pregunta.toLowerCase();
        const matchScore = queryWords.filter(word => preguntaLower.includes(word)).length;
        
        // Si coincide el sistema y al menos una palabra clave, agregar a resultados
        if(sistemaMatch && (matchScore > 0 || !query)) {
          results.push({
            pregunta: pregunta,
            aplicacion: aplicacion,
            respuesta: respuesta,
            numeroCaso: numeroCaso || undefined,
            especialista: especialista || undefined,
            fechaCreacion: fechaCreacion || undefined,
            funcionalidad: funcionalidad || undefined,
            matchScore: matchScore,
            confluenceUrl: `${CONFLUENCE_BASE}/pages/viewpage.action?pageId=${FAQ_PAGE_ID}`
          });
        }
      }
    }
    
    // Ordenar por relevancia (matchScore descendente)
    results.sort((a, b) => b.matchScore - a.matchScore);
    
    // Limitar a los 5 mejores resultados
    const topResults = results.slice(0, 5);
    
    console.log(`Encontradas ${topResults.length} FAQs relevantes`);
    
    res.status(200).json({ 
      success: true,
      results: topResults,
      total: results.length
    });
    
  } catch(err) {
    console.error('Error buscando FAQs:', err.message);
    res.status(500).json({ 
      error: 'Error al buscar en FAQs',
      details: err.message 
    });
  }
});

// ============================================
// AUTENTICACION CON CONFLUENCE
// ============================================

// ============================================
// AUTENTICACION LOCAL TEMPORAL (EXCEL/JSON)
// ============================================
const AUTH_STORAGE_DIR = path.join(__dirname, 'storage');
const AUTH_USERS_XLSX = path.join(AUTH_STORAGE_DIR, 'auth-users.xlsx');
const AUTH_USERS_JSON = path.join(AUTH_STORAGE_DIR, 'auth-users.json');
const AUTH_ACCESS_LOG = path.join(AUTH_STORAGE_DIR, 'auth-access-log.json');

function ensureAuthStorageDir() {
  if (!fs.existsSync(AUTH_STORAGE_DIR)) {
    fs.mkdirSync(AUTH_STORAGE_DIR, { recursive: true });
  }
}

function normalizeUserRow(row) {
  const username = String(
    row.username || row.usuario || row.user || ''
  ).trim();
  const password = String(
    row.password || row.clave || row.pass || ''
  ).trim();
  const name = String(
    row.name || row.nombre || username
  ).trim();
  const role = String(
    row.role || row.rol || 'user'
  ).trim();

  const activeRaw = row.active ?? row.activo ?? true;
  const active = !['false', '0', 'no', 'inactivo'].includes(String(activeRaw).toLowerCase().trim());

  return { username, password, name, role, active };
}

function loadLocalAuthUsers() {
  ensureAuthStorageDir();

  // Prioridad 1: Variable de entorno (ideal para Render/produccion)
  if (process.env.AUTH_USERS_JSON) {
    try {
      const parsed = JSON.parse(process.env.AUTH_USERS_JSON);
      const users = Array.isArray(parsed)
        ? parsed.map(normalizeUserRow).filter(u => u.username && u.password && u.active)
        : [];

      if (users.length > 0) {
        return { source: 'env', users };
      }
    } catch (err) {
      console.error('❌ Error parseando AUTH_USERS_JSON:', err.message);
    }
  }

  // Prioridad 2: Excel (permite administración no técnica)
  if (fs.existsSync(AUTH_USERS_XLSX)) {
    try {
      const workbook = xlsx.readFile(AUTH_USERS_XLSX);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
      const users = rows.map(normalizeUserRow).filter(u => u.username && u.password && u.active);

      if (users.length > 0) {
        return { source: 'excel', users };
      }
    } catch (err) {
      console.error('❌ Error leyendo auth-users.xlsx:', err.message);
    }
  }

  // Prioridad 3: JSON
  if (fs.existsSync(AUTH_USERS_JSON)) {
    try {
      const raw = fs.readFileSync(AUTH_USERS_JSON, 'utf8');
      const parsed = JSON.parse(raw);
      const users = Array.isArray(parsed)
        ? parsed.map(normalizeUserRow).filter(u => u.username && u.password && u.active)
        : [];

      if (users.length > 0) {
        return { source: 'json', users };
      }
    } catch (err) {
      console.error('❌ Error leyendo auth-users.json:', err.message);
    }
  }

  // Fallback temporal: credenciales quemadas
  return {
    source: 'hardcoded-fallback',
    users: [
      {
        username: 'admin',
        password: 'Admin123*',
        name: 'Administrador Temporal',
        role: 'admin',
        active: true
      }
    ]
  };
}

function readAuthAccessLogs() {
  if (!fs.existsSync(AUTH_ACCESS_LOG)) {
    return [];
  }

  try {
    const raw = fs.readFileSync(AUTH_ACCESS_LOG, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function registerAuthAccess({
  username,
  success,
  reason,
  req,
  source,
  eventType,
  sessionToken,
  sessionStartAt,
  sessionEndAt,
  durationSeconds
}) {
  ensureAuthStorageDir();

  let logs = readAuthAccessLogs();

  logs.push({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    eventType: eventType || 'auth_event',
    username: username || 'unknown',
    success: !!success,
    reason: reason || null,
    source: source || 'unknown',
    sessionToken: sessionToken || null,
    sessionStartAt: sessionStartAt || null,
    sessionEndAt: sessionEndAt || null,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    ip: req.ip || req.connection?.remoteAddress || null,
    userAgent: req.get('user-agent') || null
  });

  if (logs.length > 5000) {
    logs = logs.slice(-5000);
  }

  fs.writeFileSync(AUTH_ACCESS_LOG, JSON.stringify(logs, null, 2));
}

app.post('/api/auth/login-local', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    registerAuthAccess({
      username,
      success: false,
      reason: 'missing_credentials',
      req,
      source: 'none'
    });

    return res.status(400).json({
      success: false,
      error: 'Usuario y contraseña requeridos'
    });
  }

  const loaded = loadLocalAuthUsers();
  const user = loaded.users.find(u => u.username === String(username).trim());

  if (!user || user.password !== String(password)) {
    registerAuthAccess({
      username,
      success: false,
      reason: 'invalid_credentials',
      req,
      source: loaded.source
    });

    return res.status(401).json({
      success: false,
      error: 'Usuario o contraseña incorrectos'
    });
  }

  const sessionToken = crypto.randomBytes(24).toString('hex');
  const loginAt = new Date().toISOString();

  registerAuthAccess({
    username: user.username,
    success: true,
    reason: 'login_ok',
    req,
    source: loaded.source,
    eventType: 'login',
    sessionToken,
    sessionStartAt: loginAt
  });

  res.json({
    success: true,
    user: {
      username: user.username,
      displayName: user.name,
      role: user.role,
      authSource: loaded.source
    },
    sessionToken,
    loginAt
  });
});

app.post('/api/auth/end-session', (req, res) => {
  const { username, sessionToken, sessionStartAt } = req.body || {};

  if (!username || !sessionToken) {
    return res.status(400).json({
      success: false,
      error: 'username y sessionToken son requeridos'
    });
  }

  const logs = readAuthAccessLogs();
  const loginEvent = [...logs].reverse().find((log) => (
    log && log.eventType === 'login' && log.sessionToken === sessionToken
  ));

  const start = sessionStartAt || loginEvent?.sessionStartAt || loginEvent?.timestamp;
  const end = new Date().toISOString();

  let durationSeconds = null;
  if (start) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
      durationSeconds = Math.round((endMs - startMs) / 1000);
    }
  }

  registerAuthAccess({
    username,
    success: true,
    reason: 'session_closed',
    req,
    source: loginEvent?.source || 'client',
    eventType: 'session_end',
    sessionToken,
    sessionStartAt: start || null,
    sessionEndAt: end,
    durationSeconds
  });

  return res.json({
    success: true,
    username,
    sessionToken,
    sessionStartAt: start || null,
    sessionEndAt: end,
    durationSeconds
  });
});

app.get('/api/auth/access-log', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);

  if (!fs.existsSync(AUTH_ACCESS_LOG)) {
    return res.json({ success: true, total: 0, logs: [] });
  }

  try {
    const raw = fs.readFileSync(AUTH_ACCESS_LOG, 'utf8');
    const logs = JSON.parse(raw);
    const normalized = Array.isArray(logs) ? logs : [];
    const ordered = normalized.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      total: normalized.length,
      logs: ordered.slice(0, limit)
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'No se pudo leer auth-access-log' });
  }
});

// Endpoint para autenticar usuario con Confluence
app.post('/api/auth/confluence-login', async (req, res) => {
  const { username, password } = req.body;
  
  if(!username || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Usuario y contraseña requeridos' 
    });
  }
  
  if(!CONFLUENCE_BASE) {
    return res.status(500).json({ 
      success: false, 
      error: 'Confluence no configurado en el servidor' 
    });
  }
  
  try {
    // Crear credenciales de autenticación Basic Auth con username:password
    const userAuth = Buffer.from(`${username}:${password}`).toString('base64');
    
    // Intentar obtener información del usuario autenticado
    const userResponse = await axios.get(
      `${CONFLUENCE_BASE}/rest/api/user/current`,
      {
        headers: {
          'Authorization': `Basic ${userAuth}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    
    if(userResponse.status === 200 && userResponse.data) {
      const userData = userResponse.data;
      
      // Generar token de sesión (base64 de username:timestamp)
      const sessionToken = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      
      console.log('✅ Usuario autenticado:', userData.displayName || userData.username);
      
      res.json({
        success: true,
        user: {
          username: userData.username || username,
          displayName: userData.displayName || username,
          email: userData.email || `${username}@company.com`,
          sessionToken: sessionToken,
          authenticatedViaConfluence: true
        }
      });
    } else {
      throw new Error('Respuesta inválida de Confluence');
    }
    
  } catch(err) {
    console.error('❌ Error de autenticación:', err.message);
    
    if(err.response) {
      if(err.response.status === 401) {
        return res.status(401).json({
          success: false,
          error: 'Usuario o contraseña incorrectos'
        });
      } else if(err.response.status === 403) {
        return res.status(403).json({
          success: false,
          error: 'Acceso denegado. Verifica tus permisos en Confluence'
        });
      }
    }
    
    res.status(500).json({
      success: false,
      error: 'Error al autenticar con Confluence',
      details: err.message
    });
  }
});

// Endpoint para validar sesión existente (auto-login)
app.post('/api/auth/validate-session', async (req, res) => {
  const { sessionToken, email } = req.body;
  
  if(!sessionToken || !email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Token de sesión y email requeridos' 
    });
  }
  
  try {
    // Decodificar el token para verificar su validez
    const decoded = Buffer.from(sessionToken, 'base64').toString('utf-8');
    const [tokenEmail, timestamp] = decoded.split(':');
    
    // Verificar que el email coincida
    if(tokenEmail !== email) {
      return res.status(401).json({
        success: false,
        error: 'Sesión inválida'
      });
    }
    
    // Verificar que el token no haya expirado (7 días)
    const tokenAge = Date.now() - parseInt(timestamp);
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    
    if(tokenAge > sevenDays) {
      return res.status(401).json({
        success: false,
        error: 'Sesión expirada. Por favor, inicia sesión nuevamente.'
      });
    }
    
    console.log('✅ Sesión válida para:', email);
    
    res.json({
      success: true,
      message: 'Sesión válida'
    });
    
  } catch(err) {
    console.error('❌ Error validando sesión:', err.message);
    res.status(401).json({
      success: false,
      error: 'Token inválido'
    });
  }
});

// ============================================
// SISTEMA DE LOGGING DE USUARIOS
// ============================================

// Registrar interacción de usuario
app.post('/api/analytics/log-interaction', async (req, res) => {
  const { 
    sessionId, 
    usuario, 
    query, 
    queryType, 
    responseType, 
    resultCount,
    satisfied,
    duration 
  } = req.body;
  
  const fs = require('fs');
  const activityFile = './user-activity.json';
  
  try {
    // Leer actividades existentes
    let activities = [];
    if(fs.existsSync(activityFile)) {
      const data = fs.readFileSync(activityFile, 'utf8');
      activities = JSON.parse(data);
    }
    
    // Agregar nueva interacción
    const interaction = {
      id: Date.now(),
      sessionId: sessionId || 'unknown',
      timestamp: new Date().toISOString(),
      usuario: usuario || { anonymous: true },
      query: query,
      queryType: queryType || 'general',
      responseType: responseType || 'unknown',
      resultCount: resultCount || 0,
      satisfied: satisfied !== undefined ? satisfied : null,
      duration: duration || null,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };
    
    activities.push(interaction);
    
    // Mantener solo últimos 10000 registros
    if(activities.length > 10000) {
      activities = activities.slice(-10000);
    }
    
    // Guardar archivo
    fs.writeFileSync(activityFile, JSON.stringify(activities, null, 2));
    
    res.status(200).json({ 
      success: true,
      message: 'Interacción registrada'
    });
    
  } catch(err) {
    console.error('❌ Error registrando actividad:', err.message);
    res.status(500).json({ 
      error: 'Error al registrar actividad',
      details: err.message 
    });
  }
});

// Obtener estadísticas de uso
app.get('/api/analytics/stats', async (req, res) => {
  const fs = require('fs');
  const activityFile = './user-activity.json';
  
  try {
    if(!fs.existsSync(activityFile)) {
      return res.json({
        success: true,
        totalInteractions: 0,
        uniqueUsers: 0,
        uniqueSessions: 0,
        stats: {}
      });
    }
    
    const data = fs.readFileSync(activityFile, 'utf8');
    const activities = JSON.parse(data);
    
    // Calcular estadísticas
    const uniqueUsers = new Set(activities.map(a => 
      a.usuario?.email || a.usuario?.nombre || a.sessionId
    )).size;
    
    const uniqueSessions = new Set(activities.map(a => a.sessionId)).size;
    
    const queryTypes = activities.reduce((acc, a) => {
      acc[a.queryType] = (acc[a.queryType] || 0) + 1;
      return acc;
    }, {});
    
    const responseTypes = activities.reduce((acc, a) => {
      acc[a.responseType] = (acc[a.responseType] || 0) + 1;
      return acc;
    }, {});
    
    // Estadísticas por día (últimos 7 días)
    const last7Days = {};
    const now = new Date();
    for(let i = 0; i < 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      last7Days[dateStr] = 0;
    }
    
    activities.forEach(a => {
      const date = a.timestamp.split('T')[0];
      if(last7Days[date] !== undefined) {
        last7Days[date]++;
      }
    });
    
    // Top 10 queries más frecuentes
    const queryFrequency = {};
    activities.forEach(a => {
      if(a.query) {
        const normalized = a.query.toLowerCase().trim();
        queryFrequency[normalized] = (queryFrequency[normalized] || 0) + 1;
      }
    });
    
    const topQueries = Object.entries(queryFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([query, count]) => ({ query, count }));
    
    // Calcular usuarios identificados vs anónimos
    const identifiedUsers = activities.filter(a => 
      a.usuario && a.usuario.email && !a.usuario.anonymous
    ).length;
    
    const anonymousUsers = activities.filter(a => 
      !a.usuario || a.usuario.anonymous || !a.usuario.email
    ).length;
    
    const identificationRate = identifiedUsers / activities.length || 0;
    
    // Lista de usuarios únicos identificados
    const identifiedUsersList = {};
    activities.forEach(a => {
      if(a.usuario && a.usuario.email && !a.usuario.anonymous) {
        const key = a.usuario.email;
        if(!identifiedUsersList[key]) {
          identifiedUsersList[key] = {
            nombre: a.usuario.nombre,
            apellido: a.usuario.apellido,
            email: a.usuario.email,
            interactionCount: 0,
            firstSeen: a.timestamp
          };
        }
        identifiedUsersList[key].interactionCount++;
      }
    });
    
    const topIdentifiedUsers = Object.values(identifiedUsersList)
      .sort((a, b) => b.interactionCount - a.interactionCount)
      .slice(0, 10);
    
    res.json({
      success: true,
      totalInteractions: activities.length,
      uniqueUsers: uniqueUsers,
      uniqueSessions: uniqueSessions,
      identifiedInteractions: identifiedUsers,
      anonymousInteractions: anonymousUsers,
      identificationRate: identificationRate,
      topIdentifiedUsers: topIdentifiedUsers,
      queryTypes: queryTypes,
      responseTypes: responseTypes,
      last7Days: last7Days,
      topQueries: topQueries,
      averageResultCount: activities.reduce((sum, a) => sum + (a.resultCount || 0), 0) / activities.length || 0,
      satisfactionRate: activities.filter(a => a.satisfied === true).length / activities.filter(a => a.satisfied !== null).length || 0
    });
    
  } catch(err) {
    console.error('❌ Error obteniendo estadísticas:', err.message);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas',
      details: err.message 
    });
  }
});

// Obtener historial de actividad (con filtros opcionales)
app.get('/api/analytics/activity', async (req, res) => {
  const { sessionId, usuario, limit = 100, offset = 0 } = req.query;
  
  const fs = require('fs');
  const activityFile = './user-activity.json';
  
  try {
    if(!fs.existsSync(activityFile)) {
      return res.json({
        success: true,
        activities: [],
        total: 0
      });
    }
    
    const data = fs.readFileSync(activityFile, 'utf8');
    let activities = JSON.parse(data);
    
    // Aplicar filtros
    if(sessionId) {
      activities = activities.filter(a => a.sessionId === sessionId);
    }
    
    if(usuario) {
      activities = activities.filter(a => 
        a.usuario?.email === usuario || 
        a.usuario?.nombre === usuario
      );
    }
    
    // Ordenar por más reciente
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    const total = activities.length;
    const paginatedActivities = activities.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    
    res.json({
      success: true,
      activities: paginatedActivities,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
  } catch(err) {
    console.error('❌ Error obteniendo actividad:', err.message);
    res.status(500).json({ 
      error: 'Error al obtener actividad',
      details: err.message 
    });
  }
});

// Exportar logs completos (solo para administradores)
app.get('/api/analytics/export', async (req, res) => {
  const fs = require('fs');
  const activityFile = './user-activity.json';
  
  try {
    if(!fs.existsSync(activityFile)) {
      return res.json([]);
    }
    
    const data = fs.readFileSync(activityFile, 'utf8');
    const activities = JSON.parse(data);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-activity-${new Date().toISOString().split('T')[0]}.json"`);
    res.send(JSON.stringify(activities, null, 2));
    
  } catch(err) {
    console.error('❌ Error exportando logs:', err.message);
    res.status(500).json({ 
      error: 'Error al exportar logs',
      details: err.message 
    });
  }
});

// ============================================
// PREGUNTAS PENDIENTES
// ============================================

// Endpoint para guardar preguntas sin respuesta
app.post('/api/confluence/save-pending-question', async (req, res) => {
  const { question, sistema } = req.body;
  
  if(!question) {
    return res.status(400).json({ error: 'Pregunta requerida' });
  }
  
  const fs = require('fs');
  const pendingFile = './pending-questions.json';
  
  try {
    // Leer preguntas existentes
    let questions = [];
    if(fs.existsSync(pendingFile)) {
      const data = fs.readFileSync(pendingFile, 'utf8');
      questions = JSON.parse(data);
    }
    
    // Agregar nueva pregunta
    questions.push({
      id: Date.now(),
      question: question,
      sistema: sistema || 'General',
      timestamp: new Date().toISOString(),
      status: 'pendiente'
    });
    
    // Guardar archivo
    fs.writeFileSync(pendingFile, JSON.stringify(questions, null, 2));
    
    console.log(`✅ Pregunta guardada: "${question}"`);
    
    res.status(200).json({ 
      success: true,
      message: 'Pregunta registrada exitosamente'
    });
    
  } catch(err) {
    console.error('Error guardando pregunta:', err.message);
    res.status(500).json({ 
      error: 'Error al guardar la pregunta',
      details: err.message 
    });
  }
});

// ============================================
// ENDPOINTS DE AUTOAPRENDIZAJE
// ============================================

// Guardar interacción aprendida
app.post('/api/learning/save', (req, res) => {
  const { userQuestion, botResponse, context } = req.body;
  
  if(!userQuestion || !botResponse) {
    return res.status(400).json({ error: 'Se requiere pregunta y respuesta' });
  }
  
  try {
    learningModule.saveLearningData(userQuestion, botResponse, context || {});
    res.status(200).json({ success: true, message: 'Interacción guardada' });
  } catch(err) {
    console.error('Error guardando aprendizaje:', err);
    res.status(500).json({ error: 'Error al guardar interacción' });
  }
});

// Buscar interacciones similares
app.post('/api/learning/search', (req, res) => {
  const { query, limit = 5 } = req.body;
  
  if(!query) {
    return res.status(400).json({ error: 'Se requiere query' });
  }
  
  try {
    const results = learningModule.searchLearningData(query, limit);
    res.status(200).json({ results });
  } catch(err) {
    console.error('Error buscando aprendizaje:', err);
    res.status(500).json({ error: 'Error en búsqueda', results: [] });
  }
});

// Incrementar contador de uso
app.post('/api/learning/increment-use', (req, res) => {
  const { id } = req.body;
  
  if(!id) {
    return res.status(400).json({ error: 'Se requiere ID' });
  }
  
  try {
    const success = learningModule.incrementUseCount(id);
    if(success) {
      res.status(200).json({ success: true });
    } else {
      res.status(404).json({ error: 'ID no encontrado' });
    }
  } catch(err) {
    console.error('Error incrementando uso:', err);
    res.status(500).json({ error: 'Error al incrementar uso' });
  }
});

// Endpoint para ver preguntas pendientes
app.get('/api/confluence/pending-questions', (req, res) => {
  const fs = require('fs');
  const pendingFile = './pending-questions.json';
  
  try {
    if(!fs.existsSync(pendingFile)) {
      return res.status(200).json({ questions: [] });
    }
    
    const data = fs.readFileSync(pendingFile, 'utf8');
    const questions = JSON.parse(data);
    
    res.status(200).json({ 
      success: true,
      questions: questions,
      total: questions.length
    });
    
  } catch(err) {
    console.error('Error leyendo preguntas:', err.message);
    res.status(500).json({ 
      error: 'Error al leer preguntas pendientes',
      details: err.message 
    });
  }
});

// ============================================
// ENDPOINTS DE ANÁLISIS DE DATOS DESDE EXCEL
// ============================================

// Endpoint para listar archivos Excel disponibles
app.get('/api/data/list-files', (req, res) => {
  try {
    const dataDir = './data';
    if(!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    const files = fs.readdirSync(dataDir)
      .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
      .map(f => ({
        name: f,
        path: f,
        size: fs.statSync(path.join(dataDir, f)).size,
        modified: fs.statSync(path.join(dataDir, f)).mtime
      }));
    
    res.json({ success: true, files });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para leer y analizar archivo Excel
app.get('/api/data/analyze', (req, res) => {
  try {
    const fileName = req.query.file;
    if(!fileName) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }
    
    const filePath = path.join('./data', fileName);
    if(!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    // Leer archivo Excel
    const workbook = xlsx.readFile(filePath);
    
    console.log('Pestañas disponibles en el archivo:', workbook.SheetNames);
    
    // Buscar exactamente la pestaña "Analisis casos" (sin bckl u otros sufijos)
    let sheetName = workbook.SheetNames.find(name => /^an[aá]lisis\s*(de\s*)?casos$/i.test(name));
    
    if(!sheetName) {
      sheetName = workbook.SheetNames[0];
      console.log(`⚠️ No se encontró pestaña "Analisis casos", usando primera pestaña: ${sheetName}`);
    } else {
      console.log(`✓ Pestaña encontrada: ${sheetName}`);
    }
    
    const worksheet = workbook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(worksheet);
    
    // Normalizar nombres de columnas clave y convertir fechas
    data = data.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        let newKey = key;
        // Renombrar columnas específicas
        if(key === 'Specialist') newKey = 'Especialista';
        if(key === 'Create Date') newKey = 'Fecha';
        if(key === 'Status Ticket') newKey = 'Estado';
        if(key === 'App') newKey = 'Aplicación';
        newRow[newKey] = row[key];
      });
      // Convertir fechas de Excel a formato legible
      return convertExcelDates(newRow);
    });
    
    console.log(`Leyendo pestaña: ${sheetName}`);
    console.log(`Total de filas: ${data.length}`);
    
    if(data.length === 0) {
      return res.json({ 
        success: true,
        message: 'Archivo vacío',
        stats: {}
      });
    }
    
    // Análisis básico
    const columns = Object.keys(data[0]);
    const stats = {
      totalRows: data.length,
      columns: columns,
      columnStats: {}
    };
    
    // Estadísticas por columna
    columns.forEach(col => {
      const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== '');
      const numericValues = values.filter(v => !isNaN(parseFloat(v))).map(v => parseFloat(v));
      
      stats.columnStats[col] = {
        count: values.length,
        unique: [...new Set(values)].length,
        nullCount: data.length - values.length
      };
      
      if(numericValues.length > 0) {
        stats.columnStats[col].isNumeric = true;
        stats.columnStats[col].sum = numericValues.reduce((a, b) => a + b, 0);
        stats.columnStats[col].avg = stats.columnStats[col].sum / numericValues.length;
        stats.columnStats[col].min = Math.min(...numericValues);
        stats.columnStats[col].max = Math.max(...numericValues);
      }
    });
    
    res.json({ 
      success: true,
      fileName,
      sheetName,  // Agregar el nombre de la pestaña
      stats,
      sample: data.slice(0, 5),
      allData: req.query.fullData === 'true' ? data : undefined // Devolver todos los datos si se solicita
    });
    
  } catch(err) {
    console.error('Error analizando archivo:', err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint para obtener datos específicos con filtros
app.post('/api/data/query', (req, res) => {
  try {
    const { file, filters, groupBy, aggregations } = req.body;
    
    if(!file) {
      return res.status(400).json({ error: 'Nombre de archivo requerido' });
    }
    
    const filePath = path.join('./data', file);
    if(!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    const workbook = xlsx.readFile(filePath);
    
    console.log('[POST] Pestañas disponibles en el archivo:', workbook.SheetNames);
    
    // Buscar exactamente la pestaña "Analisis casos" (sin bckl u otros sufijos)
    let sheetName = workbook.SheetNames.find(name => /^an[aá]lisis\s*(de\s*)?casos$/i.test(name));
    
    if(!sheetName) {
      sheetName = workbook.SheetNames[0];
      console.log(`⚠️ [POST] No se encontró pestaña "Analisis casos", usando primera pestaña: ${sheetName}`);
    } else {
      console.log(`✓ [POST] Pestaña encontrada: ${sheetName}`);
    }
    
    const worksheet = workbook.Sheets[sheetName];
    let data = xlsx.utils.sheet_to_json(worksheet);
    
    // Normalizar nombres de columnas clave y convertir fechas
    data = data.map(row => {
      const newRow = {};
      Object.keys(row).forEach(key => {
        let newKey = key;
        // Renombrar columnas específicas
        if(key === 'Specialist') newKey = 'Especialista';
        if(key === 'Create Date') newKey = 'Fecha';
        if(key === 'Status Ticket') newKey = 'Estado';
        if(key === 'App') newKey = 'Aplicación';
        newRow[newKey] = row[key];
      });
      // Convertir fechas de Excel a formato legible
      return convertExcelDates(newRow);
    });
    
    console.log(`[POST /api/data/query] Leyendo pestaña: ${sheetName}, filas: ${data.length}`);
    
    // Aplicar filtros
    if(filters && Array.isArray(filters)) {
      filters.forEach(filter => {
        const { column, operator, value } = filter;
        data = data.filter(row => {
          const cellValue = row[column];
          switch(operator) {
            case 'equals': return cellValue == value;
            case 'contains': return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
            case 'greater': return parseFloat(cellValue) > parseFloat(value);
            case 'less': return parseFloat(cellValue) < parseFloat(value);
            default: return true;
          }
        });
      });
    }
    
    // Agrupar y agregar
    let results = data;
    if(groupBy && aggregations) {
      const grouped = {};
      data.forEach(row => {
        const key = row[groupBy];
        if(!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(row);
      });
      
      results = Object.keys(grouped).map(key => {
        const group = grouped[key];
        const result = { [groupBy]: key, count: group.length };
        
        if(aggregations) {
          Object.keys(aggregations).forEach(col => {
            const agg = aggregations[col];
            const values = group.map(r => parseFloat(r[col])).filter(v => !isNaN(v));
            
            if(agg === 'sum') result[`${col}_sum`] = values.reduce((a, b) => a + b, 0);
            if(agg === 'avg') result[`${col}_avg`] = values.reduce((a, b) => a + b, 0) / values.length;
            if(agg === 'min') result[`${col}_min`] = Math.min(...values);
            if(agg === 'max') result[`${col}_max`] = Math.max(...values);
          });
        }
        
        return result;
      });
    }
    
    res.json({ 
      success: true,
      data: results,
      count: results.length
    });
    
  } catch(err) {
    console.error('Error en query:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== ENDPOINTS DE IA CON CLAUDE ==========

// Verificar si Claude AI está configurado
app.get('/api/ai/status', (req, res) => {
  res.json({ 
    enabled: aiService.isAIEnabled(),
    message: aiService.isAIEnabled() ? 'Claude AI disponible' : 'Configure ANTHROPIC_API_KEY en .env'
  });
});

// Generar respuesta mejorada con IA
app.post('/api/ai/generate-response', async (req, res) => {
  const { query, confluenceResults, excelResults, sessionId } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  try {
    // Análisis de sentimiento automático
    let sentiment = null;
    if (aiService.isAIEnabled()) {
      try {
        sentiment = await aiService.analyzeSentiment(query);
        console.log(`📊 Sentimiento detectado: ${sentiment.sentiment} | Urgencia: ${sentiment.urgency}`);
        
        // Actualizar sentimiento de la sesión
        if (sessionId && sentiment) {
          aiService.updateSessionSentiment(sessionId, sentiment.sentiment, sentiment.urgency);
        }
      } catch (error) {
        console.log('⚠️ No se pudo analizar sentimiento:', error.message);
      }
    }
    
    // Generar respuesta con contexto conversacional
    const aiResponse = await aiService.generateEnhancedResponse(
      query,
      confluenceResults || [],
      excelResults || [],
      sessionId || null
    );
    
    res.json({ 
      success: true,
      response: aiResponse,
      aiEnabled: aiService.isAIEnabled(),
      sentiment: sentiment,
      sessionId: sessionId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Resumir texto largo
app.post('/api/ai/summarize', async (req, res) => {
  const { text, maxLength } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Texto requerido' });
  }
  
  try {
    const summary = await aiService.summarizeText(text, maxLength || 200);
    
    res.json({ 
      success: true,
      summary: summary,
      original_length: text.length,
      summary_length: summary.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Traducir texto
app.post('/api/ai/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  
  if (!text) {
    return res.status(400).json({ error: 'Texto requerido' });
  }
  
  try {
    const translation = await aiService.translateText(text, targetLang || 'en');
    
    res.json({ 
      success: true,
      translation: translation,
      targetLang: targetLang || 'en'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analizar sentimiento
app.post('/api/ai/analyze-sentiment', async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Mensaje requerido' });
  }
  
  try {
    const analysis = await aiService.analyzeSentiment(message);
    
    res.json({ 
      success: true,
      sentiment: analysis.sentiment,
      urgency: analysis.urgency
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Búsqueda semántica
app.post('/api/ai/semantic-search', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  try {
    const expandedTerms = await aiService.semanticSearch(query);
    
    res.json({ 
      success: true,
      original: query,
      expanded: expandedTerms
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clasificar consulta
app.post('/api/ai/classify', async (req, res) => {
  const { query } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  try {
    const classification = await aiService.classifyQuery(query);
    
    res.json({ 
      success: true,
      classification: classification
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generar reporte
app.post('/api/ai/generate-report', async (req, res) => {
  const { queries, type } = req.body;
  
  if (!queries || !Array.isArray(queries)) {
    return res.status(400).json({ error: 'Queries array requerido' });
  }
  
  try {
    const report = await aiService.generateReport(queries, type || 'frequent');
    
    res.json({ 
      success: true,
      report: report,
      type: type || 'frequent'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DETECCIÓN AUTOMÁTICA DE INTENCIÓN + BÚSQUEDA SEMÁNTICA
// ============================================

// Endpoint inteligente de enrutamiento automático
app.post('/api/ai/smart-route', async (req, res) => {
  const { query, sessionId } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  try {
    console.log('\n🎯 Smart Router: Analizando intención de:', query);
    
    // 1. Clasificar tipo de consulta
    const classification = await aiService.classifyQuery(query);
    console.log('📋 Clasificación:', classification);
    
    // 2. Expandir términos con búsqueda semántica
    const expandedTerms = await aiService.semanticSearch(query);
    console.log('🔍 Términos expandidos:', expandedTerms);
    
    // 3. Analizar sentimiento
    const sentiment = await aiService.analyzeSentiment(query);
    console.log('😊 Sentimiento:', sentiment);
    
    // 4. Actualizar contexto de sesión si existe
    if (sessionId) {
      aiService.updateSessionSentiment(sessionId, sentiment.sentiment, sentiment.urgency);
    }
    
    res.json({
      success: true,
      classification: classification,
      expandedTerms: expandedTerms,
      sentiment: sentiment,
      routing: {
        type: classification.type,
        category: classification.category,
        suggestedAction: classification.suggestedAction,
        confidence: classification.confidence
      }
    });
    
  } catch (error) {
    console.error('❌ Error en smart routing:', error.message);
    
    // Fallback a respuesta básica si AI falla
    res.json({
      success: true,
      classification: {
        type: 'general',
        category: 'general',
        confidence: 0.5,
        suggestedAction: 'search'
      },
      expandedTerms: [query],
      sentiment: { sentiment: 'neutral', urgency: 'normal' },
      routing: {
        type: 'general',
        category: 'general',
        suggestedAction: 'search',
        confidence: 0.5
      },
      fallback: true
    });
  }
});

// Búsqueda semántica en FAQs con términos expandidos
app.post('/api/confluence/faq-semantic-search', async (req, res) => {
  if(!CONFLUENCE_BASE || !CONFLUENCE_AUTH) {
    return res.status(500).json({ error: 'Confluence not configured' });
  }
  
  const { query, sistema, expandedTerms, isTrainingQuery } = req.body;
  
  if (!query) {
    return res.status(400).json({ error: 'Query requerido' });
  }
  
  const FAQ_PAGE_ID = '3645014017';
  
  console.log(`\n🔍 Búsqueda semántica en FAQs:`);
  console.log('Query original:', query);
  console.log('Sistema:', sistema || 'Todos');
  console.log('Términos expandidos:', expandedTerms);
  console.log('🎓 Pregunta de entrenamiento:', isTrainingQuery || false);
  
  try {
    // Obtener contenido de la página de FAQs
    const response = await axios.get(`${CONFLUENCE_BASE}/rest/api/content/${FAQ_PAGE_ID}`, {
      headers: { 
        'Authorization': `Basic ${CONFLUENCE_AUTH}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      params: { expand: 'body.storage' }
    });
    
    const bodyHtml = response.data.body?.storage?.value || '';
    
    if(!bodyHtml) {
      return res.status(200).json({ 
        success: true,
        results: [],
        total: 0
      });
    }
    
    // Parsear tabla HTML
    const results = [];
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    const rows = [...bodyHtml.matchAll(rowRegex)];
    
    // Usar términos expandidos para búsqueda más amplia
    const searchTerms = expandedTerms && expandedTerms.length > 0 ? expandedTerms : [query];
    
    // Identificar palabras de contexto ANTES del loop (para logging)
    const actionWords = ['error', 'problema', 'fallo', 'falla', 'incidente', 'dificultad', 'issue'];
    const stopWords = ['tengo', 'como', 'porque', 'para', 'cuando', 'donde', 'quien', 'cual', 'esto', 'esta'];
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => 
      w.length > 3 && !actionWords.includes(w) && !stopWords.includes(w)
    );
    
    console.log('🎯 Análisis contextual:');
    console.log('   Query original:', query);
    console.log('   Palabras de contexto:', queryWords);
    console.log('   Sistema filtro:', sistema || 'ninguno');
    
    for(let i = 1; i < rows.length; i++) {
      const rowContent = rows[i][1];
      const cellRegex = /<td[^>]*>(.*?)<\/td>/gis;
      const cells = [...rowContent.matchAll(cellRegex)];
      
      if(cells.length >= 3) {
        const pregunta = decodeHtmlEntities(cleanHtmlText(cells[0][1]));
        const aplicacion = decodeHtmlEntities(cleanHtmlText(cells[1][1]));
        const respuesta = decodeHtmlEntities(cleanHtmlText(cells[2][1]));
        
        const numeroCaso = cells.length >= 4 ? decodeHtmlEntities(cleanHtmlText(cells[3][1])) : null;
        const fechaCreacion = cells.length >= 5 ? decodeHtmlEntities(cleanHtmlText(cells[4][1])) : null;
        const especialista = cells.length >= 6 ? decodeHtmlEntities(cleanHtmlText(cells[5][1])) : null;
        const funcionalidad = cells.length >= 7 ? decodeHtmlEntities(cleanHtmlText(cells[6][1])) : null;
        
        // Convertir a lowercase ANTES de usar en extracción de videos
        const preguntaLower = pregunta.toLowerCase();
        const respuestaLower = respuesta.toLowerCase();
        const funcionalidadLower = (funcionalidad || '').toLowerCase();
        
        // === EXTRAER IMÁGENES Y VIDEOS de la celda de respuesta ===
        const respuestaHtml = cells[2][1]; // HTML original de la celda
        const images = [];
        const videos = [];
        
        // Patrón 1: Extraer <img src="...">
        const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
        let imgMatch;
        while((imgMatch = imgRegex.exec(respuestaHtml)) !== null){
          let imgSrc = imgMatch[1];
          // Convertir rutas relativas a absolutas
          if(imgSrc.startsWith('/')){
            imgSrc = `${CONFLUENCE_BASE}${imgSrc}`;
          }
          // Usar proxy para autenticación
          const proxyUrl = `/api/confluence/image-proxy?url=${encodeURIComponent(imgSrc)}`;
          images.push(proxyUrl);
        }
        
        // Patrón 2: Extraer Confluence attachments <ri:attachment ri:filename="...">
        const attachmentRegex = /<ri:attachment\s+ri:filename=["']([^"']+)["']/gi;
        let attachMatch;
        while((attachMatch = attachmentRegex.exec(respuestaHtml)) !== null){
          const filename = attachMatch[1];
          const attachmentUrl = `${CONFLUENCE_BASE}/download/attachments/${FAQ_PAGE_ID}/${encodeURIComponent(filename)}`;
          // Usar proxy para autenticación
          const proxyUrl = `/api/confluence/image-proxy?url=${encodeURIComponent(attachmentUrl)}`;
          images.push(proxyUrl);
        }
        
        // Patrón 3: Extraer videos embebidos (iframes de YouTube, Vimeo, etc.)
        const iframeRegex = /<iframe[^>]+src=["']([^"']+)["']/gi;
        let iframeMatch;
        while((iframeMatch = iframeRegex.exec(respuestaHtml)) !== null){
          const iframeSrc = iframeMatch[1];
          console.log(`   🔍 Detectado iframe: ${iframeSrc}`);
          // YouTube, Vimeo, video player URLs
          if(iframeSrc.includes('youtube') || iframeSrc.includes('vimeo') || iframeSrc.includes('video') || iframeSrc.includes('embed')){
            videos.push(iframeSrc);
            console.log(`   ✅ Video embebido agregado: ${iframeSrc}`);
          }
        }
        
        // Patrón 4: Extraer macro de video de Confluence <ac:structured-macro ac:name="multimedia">
        const multimediaRegex = /<ri:url\s+ri:value=["']([^"']+)["']/gi;
        let multimediaMatch;
        while((multimediaMatch = multimediaRegex.exec(respuestaHtml)) !== null){
          const videoUrl = multimediaMatch[1];
          console.log(`   🔍 Detectado ri:url: ${videoUrl}`);
          if(videoUrl.includes('youtube') || videoUrl.includes('vimeo') || videoUrl.includes('video') || videoUrl.includes('.mp4') || videoUrl.includes('embed')){
            videos.push(videoUrl);
            console.log(`   ✅ Video multimedia agregado: ${videoUrl}`);
          }
        }
        
        // Patrón 5: Extraer macro widget de Confluence <ac:parameter ac:name="url">
        const widgetRegex = /<ac:parameter\s+ac:name=["']url["']\s*>([^<]+)<\/ac:parameter>/gi;
        let widgetMatch;
        while((widgetMatch = widgetRegex.exec(respuestaHtml)) !== null){
          const widgetUrl = widgetMatch[1].trim();
          console.log(`   🔍 Detectado widget url: ${widgetUrl}`);
          if(widgetUrl.includes('youtube') || widgetUrl.includes('vimeo') || widgetUrl.includes('video') || widgetUrl.includes('embed')){
            videos.push(widgetUrl);
            console.log(`   ✅ Video widget agregado: ${widgetUrl}`);
          }
        }
        
        // Patrón 6: Extraer URLs de YouTube/Vimeo en texto plano
        const youtubeRegex = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/gi;
        let youtubeMatch;
        while((youtubeMatch = youtubeRegex.exec(respuestaHtml)) !== null){
          const videoUrl = youtubeMatch[0];
          console.log(`   🔍 Detectado YouTube URL en texto: ${videoUrl}`);
          videos.push(videoUrl);
          console.log(`   ✅ Video YouTube agregado: ${videoUrl}`);
        }
        
        const vimeoRegex = /https?:\/\/(?:www\.)?vimeo\.com\/([0-9]+)/gi;
        let vimeoMatch;
        while((vimeoMatch = vimeoRegex.exec(respuestaHtml)) !== null){
          const videoUrl = vimeoMatch[0];
          console.log(`   🔍 Detectado Vimeo URL en texto: ${videoUrl}`);
          videos.push(videoUrl);
          console.log(`   ✅ Video Vimeo agregado: ${videoUrl}`);
        }
        
        // Patrón 7: Extraer links de SharePoint/Microsoft Stream (videos alojados en SharePoint)
        const sharepointRegex = /href=["'](https?:\/\/[^"']*sharepoint\.com[^"']*(?:stream\.aspx|\.mp4|\.avi|\.mov|video)[^"']*)["']/gi;
        let sharepointMatch;
        while((sharepointMatch = sharepointRegex.exec(respuestaHtml)) !== null){
          let videoUrl = sharepointMatch[1];
          // Decodificar entidades HTML
          videoUrl = videoUrl.replace(/&amp;/g, '&');
          console.log(`   🔍 Detectado SharePoint/Stream video: ${videoUrl}`);
          videos.push(videoUrl);
          console.log(`   ✅ Video SharePoint agregado: ${videoUrl}`);
        }
        
        // Patrón 8: Si no hay videos embebidos pero hay mención de "video" con link a Confluence
        // Solo usar esto como ÚLTIMO RECURSO
        if(videos.length === 0 && (respuestaLower.includes('video') || preguntaLower.includes('video'))){
          const viewpageRegex = /href=["']([^"']*viewpage\.action[^"']*)["']/gi;
          let viewpageMatch;
          while((viewpageMatch = viewpageRegex.exec(respuestaHtml)) !== null){
            let pageUrl = viewpageMatch[1];
            if(pageUrl.startsWith('/')){
              pageUrl = `${CONFLUENCE_BASE}${pageUrl}`;
            }
            console.log(`   ⚠️ No se encontró video embebido, usando link de página: ${pageUrl}`);
            videos.push(pageUrl);
          }
        }
        
        const uniqueImages = [...new Set(images)];
        const uniqueVideos = [...new Set(videos)];
        
        if(uniqueImages.length > 0) {
          console.log(`   📸 FAQ "${pregunta.substring(0, 50)}..." tiene ${uniqueImages.length} imagen(es)`);
        }
        if(uniqueVideos.length > 0) {
          console.log(`   🎥 FAQ "${pregunta.substring(0, 50)}..." tiene ${uniqueVideos.length} video(s):`);
          uniqueVideos.forEach((v, idx) => console.log(`      ${idx + 1}. ${v}`));
        }
        
        // Validar sistema
        const sistemaMatch = !sistema || 
                            aplicacion.toUpperCase().includes(sistema.toUpperCase()) ||
                            sistema === 'General';
        
        // Búsqueda semántica MEJORADA: analizar contexto de la pregunta
        // INCLUIR FUNCIONALIDAD en búsqueda (campo muy específico y relevante)
        const searchText = preguntaLower + ' ' + respuestaLower + ' ' + funcionalidadLower;
        
        // Identificar palabras de CONTEXTO (sustantivos, temas) vs ACCIÓN (verbos, problemas)
        const actionWords = ['error', 'problema', 'fallo', 'falla', 'incidente', 'dificultad', 'issue', 'crear', 'hacer', 'configurar', 'registrar', 'parametrizar', 'agregar', 'añadir'];
        const stopWords = ['tengo', 'como', 'porque', 'para', 'cuando', 'donde', 'quien', 'cual', 'esto', 'esta', 'puede', 'puedo'];
        
        // Para ENTRENAMIENTOS: Filtrar también nombres de sistemas (son muy genéricos)
        // Ejemplo: "como crear dispositivo en C2M" -> solo importa "dispositivo", no "c2m"
        const systemNames = ['c2m', 'sap', 'oracle', 'field', 'mdus', 'adec'];
        const wordsToFilter = isTrainingQuery ? [...actionWords, ...stopWords, ...systemNames] : [...actionWords, ...stopWords];
        
        // Extraer palabras de contexto del query original
        const queryWords = query.toLowerCase().split(/\s+/).filter(w => 
          w.length > 3 && !wordsToFilter.includes(w)
        );
        
        // Para preguntas de entrenamiento, identificar la palabra MÁS IMPORTANTE (sustantivo específico)
        // Normalmente es la palabra más larga y específica que NO es un verbo de acción
        let mainTopicWord = null;
        if (isTrainingQuery && queryWords.length > 0) {
          // Buscar la palabra más específica (normalmente la más larga o la que identifica el objeto)
          // Ejemplos: "dispositivo", "cargo", "medidor", "contador", "usuario"
          mainTopicWord = queryWords.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
          console.log(`   🎯 Palabra clave principal detectada: "${mainTopicWord}"`);
        }
        
        let matchScore = 0;
        let matchedTerms = [];
        let matchedKeywords = new Set();
        let contextMatches = 0;
        let funcionalidadMatches = 0; // Contador especial para funcionalidad
        let mainTopicMatchesInTitle = false; // ¿La palabra principal está en el TÍTULO?
        let mainTopicMatchesAnywhere = false; // ¿La palabra principal está en algún lugar?
        let specificWordMatches = []; // Lista de palabras específicas que coinciden
        
        // Contar cuántas palabras de contexto coinciden
        for(const contextWord of queryWords) {
          if(searchText.includes(contextWord)) {
            contextMatches++;
            specificWordMatches.push(contextWord);
            
            // Verificar si es la palabra PRINCIPAL y donde coincide
            if(mainTopicWord && contextWord === mainTopicWord) {
              mainTopicMatchesAnywhere = true;
              if(preguntaLower.includes(contextWord)) {
                mainTopicMatchesInTitle = true;
              }
            }
            
            // BONUS EXTRA: si la palabra coincide en FUNCIONALIDAD (campo muy específico)
            if(funcionalidadLower.includes(contextWord)) {
              funcionalidadMatches++;
            }
          }
        }
        
        // Extraer palabras clave significativas de todos los términos expandidos
        for(const term of searchTerms) {
          const keywords = term.toLowerCase().split(/\s+/).filter(word => word.length > 3);
          let termMatched = false;
          
          for(const keyword of keywords) {
            if(searchText.includes(keyword)) {
              matchedKeywords.add(keyword);
              if(!termMatched) {
                matchScore++;
                matchedTerms.push(term);
                termMatched = true;
              }
            }
          }
        }
        
        // 🚨 FILTRO ULTRA-ESTRICTO PARA ENTRENAMIENTOS: Múltiples verificaciones
        // Si es pregunta de entrenamiento, aplicar filtros de precisión máxima
        let shouldInclude = true;
        let blockedByTrainingFilter = false; // Flag para bloqueo ABSOLUTO
        
        if (isTrainingQuery && mainTopicWord) {
          // FILTRO 1: Rechazar FAQs de TROUBLESHOOTING (no son entrenamientos)
          // Patrones: "Por que no...", "Por que la...", "Porque no puedo..."
          const isTroubleshooting = /^(por\s*que|porque|el\s+error|no\s+puedo)/i.test(preguntaLower);
          if (isTroubleshooting) {
            shouldInclude = false;
            blockedByTrainingFilter = true; // BLOQUEO ABSOLUTO
            console.log(`   ❌ FAQ BLOQUEADO (troubleshooting, no entrenamiento): ${pregunta.substring(0, 70)}...`);
          }
          
          // FILTRO 2: Palabra principal DEBE estar en el TÍTULO (no solo en respuesta)
          // Ejemplo: "como crear un dispositivo" -> "dispositivo" debe estar en pregunta FAQ
          else if (!mainTopicMatchesInTitle) {
            shouldInclude = false;
            blockedByTrainingFilter = true; // BLOQUEO ABSOLUTO
            console.log(`   ❌ FAQ BLOQUEADO ("${mainTopicWord}" no está en título): ${pregunta.substring(0, 70)}...`);
          }
          
          // FILTRO 3: Priorizar FAQs que tienen estructura HOW-TO en el título
          // Verificar que la pregunta FAQ también sea de tipo "cómo hacer"
          else {
            const isHowToFAQ = /c[oó]mo\s+(crear|hacer|configurar|registrar|parametrizar|agregar|añadir)/i.test(preguntaLower);
            if (isHowToFAQ) {
              console.log(`   ✅✅ FAQ PERFECTO (how-to + "${mainTopicWord}" en título): ${pregunta.substring(0, 70)}...`);
            } else {
              console.log(`   ⚠️ FAQ ACEPTADO ("${mainTopicWord}" en título pero no es how-to): ${pregunta.substring(0, 70)}...`);
            }
          }
        }
        
        // Solo si NO fue bloqueado por filtros de entrenamiento, aplicar lógica adicional
        if (!blockedByTrainingFilter && shouldInclude) {
          const hasStrongContext = contextMatches >= 2;
          const hasVerySpecificQuery = queryWords.length >= 3;
          const hasFuncionalidadMatch = funcionalidadMatches > 0;
          const hasContextMatch = contextMatches > 0 || sistemaMatch || hasFuncionalidadMatch;
          const hasKeywordMatch = matchedKeywords.size > 0;
          
          // FILTRO DE PRECISIÓN adicional
          if (isTrainingQuery) {
            // 🎓 MODO ENTRENAMIENTO: Ignorar sistema, enfocarse en contexto
            console.log('   🎓 Modo entrenamiento: aplicando filtros de contexto');
            if (hasVerySpecificQuery) {
              shouldInclude = hasKeywordMatch && hasStrongContext;
            } else {
              shouldInclude = hasKeywordMatch && (hasStrongContext || hasFuncionalidadMatch || hasContextMatch);
            }
          } else {
            // Lógica normal para consultas NO de entrenamiento
            shouldInclude = hasKeywordMatch && (hasStrongContext || hasFuncionalidadMatch || (hasContextMatch && sistemaMatch));
          }
        }
        
        if(shouldInclude) {
          // Bonus de score por contexto (priorizar casos con más coincidencias de contexto)
          matchScore += contextMatches * 2;
          
          // BONUS EXTRA por funcionalidad (campo muy específico y confiable)
          // Si coincide en funcionalidad, es MUY probable que sea relevante
          if(funcionalidadMatches > 0) {
            matchScore += funcionalidadMatches * 4; // Doble bonus vs contexto normal
          }
          
          // BONUS ESPECIAL: Si es pregunta de entrenamiento Y funcionalidad = "Entrenamiento"
          // Dar prioridad MÁXIMA a contenido de entrenamiento para preguntas de "cómo hacer"
          if(isTrainingQuery && funcionalidadLower.includes('entrenamiento')) {
            matchScore += 10; // Bonus ALTO para priorizar contenido de entrenamiento
            console.log(`   🎓🎓 BONUS MÁXIMO ENTRENAMIENTO aplicado (+10): ${pregunta.substring(0, 50)}...`);
          }
          
          // Bonus adicional si el sistema coincide exactamente
          if(sistemaMatch) {
            matchScore += 3;
          }
          
          results.push({
            pregunta: pregunta,
            aplicacion: aplicacion,
            respuesta: respuesta,
            numeroCaso: numeroCaso || undefined,
            especialista: especialista || undefined,
            fechaCreacion: fechaCreacion || undefined,
            funcionalidad: funcionalidad || undefined,
            matchScore: matchScore,
            matchedTerms: matchedTerms,
            confidence: matchScore / searchTerms.length,
            confluenceUrl: `${CONFLUENCE_BASE}/pages/viewpage.action?pageId=${FAQ_PAGE_ID}`,
            images: uniqueImages, // Agregar imágenes extraídas
            videos: uniqueVideos  // Agregar videos embebidos
          });
        }
      }
    }
    
    // Ordenar por score (más matches = más relevante)
    results.sort((a, b) => b.matchScore - a.matchScore);
    
    const topResults = results.slice(0, 5);
    
    console.log(`✅ Encontradas ${topResults.length} FAQs relevantes (de ${results.length} matches totales)`);
    if(topResults.length > 0) {
      console.log('📌 Top resultado:', {
        pregunta: topResults[0].pregunta.substring(0, 60) + '...',
        matchScore: topResults[0].matchScore,
        funcionalidad: topResults[0].funcionalidad || 'N/A',
        matchedTerms: topResults[0].matchedTerms
      });
    }
    
    res.status(200).json({ 
      success: true,
      results: topResults,
      total: results.length,
      searchTerms: searchTerms,
      semanticSearch: searchTerms.length > 1
    });
    
  } catch(err) {
    console.error('❌ Error en búsqueda semántica:', err.message);
    res.status(500).json({ 
      error: 'Error al buscar en FAQs',
      details: err.message 
    });
  }
});

// ============================================
// ENDPOINTS DE SHAREPOINT (OAuth con Azure AD)
// ============================================

const sharepointService = require('./sharepoint-oauth-service');

/**
 * Buscar en SharePoint usando Microsoft Graph API con OAuth
 */
app.post('/api/sharepoint/search', async (req, res) => {
  try {
    const { query, maxResults = 10 } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query requerido'
      });
    }

    if (!sharepointService.isConfigured()) {
      return res.status(200).json({
        success: true,
        results: [],
        message: 'SharePoint no configurado'
      });
    }

    console.log(`\n🔍 Búsqueda en SharePoint: "${query}"`);
    
    const result = await sharepointService.search(query, { maxResults });
    
    return res.json(result);

  } catch (error) {
    console.error('❌ Error en endpoint de SharePoint:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Buscar específicamente en sitios de Oracle C2M
 */
app.post('/api/sharepoint/search-oracle', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query requerido'
      });
    }

    if (!sharepointService.isConfigured()) {
      return res.status(200).json({
        success: true,
        results: [],
        message: 'SharePoint no configurado'
      });
    }

    console.log(`\n🔍 Búsqueda en SharePoint (Oracle C2M): "${query}"`);
    
    const result = await sharepointService.searchOracleC2M(query);
    
    return res.json(result);

  } catch (error) {
    console.error('❌ Error en endpoint de SharePoint Oracle:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT DE BÚSQUEDA EN GUÍA C2M
// ============================================

/**
 * Busca información en la guía de usuario de C2M
 * Retorna extractos relevantes en inglés + contexto formateado para traducción
 */
app.post('/api/c2m-guide/search', async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query es requerido' 
      });
    }

    if (!c2mGuide.isReady()) {
      return res.status(503).json({ 
        success: false, 
        error: 'Guía de C2M no disponible. Asegúrese de que el archivo PDF existe en data/' 
      });
    }

    console.log(`🔍 Buscando en guía C2M: "${query}"`);

    // Buscar en el documento
    const results = c2mGuide.searchC2MGuide(query, 3);

    if (results.length === 0) {
      console.log('⚠️ No se encontraron resultados en guía C2M');
      return res.status(200).json({ 
        success: true, 
        results: [], 
        message: 'No se encontró información relevante en la guía de C2M' 
      });
    }

    // Formatear resultados para Claude
    const formattedContext = c2mGuide.formatResultsForClaude(results, query);

    console.log(`✅ Encontrados ${results.length} resultados en guía C2M`);
    console.log(`   📄 Secciones: ${results.map(r => r.pageNum).join(', ')}`);
    console.log(`   🎯 Palabras clave: ${results[0].matchedWords.join(', ')}`);

    res.status(200).json({ 
      success: true,
      results: results.map(r => ({
        pageNum: r.pageNum,
        excerpt: r.content.substring(0, 500) + '...',  // Para mostrar en UI
        content: r.content,  // Contenido completo para Claude
        score: r.score,
        matchedWords: r.matchedWords
      })),
      formattedContext: formattedContext,
      total: results.length
    });

  } catch(err) {
    console.error('❌ Error buscando en guía C2M:', err.message);
    res.status(500).json({ 
      success: false,
      error: 'Error al buscar en la guía de C2M',
      details: err.message 
    });
  }
});

// ============================================
// 🌐 BÚSQUEDA EN ORACLE DOCS OFICIALES (WEB)
// ============================================

// Cargar configuración de URLs de Oracle Docs
let oracleDocsConfig = null;
try {
  const configPath = path.join(__dirname, 'oracle-docs-urls.json');
  oracleDocsConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('✅ Configuración de Oracle Docs cargada:', Object.keys(oracleDocsConfig.modules).length, 'módulos');
} catch (err) {
  console.error('⚠️ No se pudo cargar oracle-docs-urls.json:', err.message);
}

/**
 * Busca información en documentación oficial de Oracle
 * Complementa el PDF local con documentación web actualizada
 */
app.post('/api/oracle-docs/search', async (req, res) => {
  try {
    const { query, questionType } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        success: false, 
        error: 'Query es requerido' 
      });
    }

    console.log(`🌐 Buscando en Oracle Docs oficiales: "${query}" (tipo: ${questionType || 'general'})`);

    if (!oracleDocsConfig) {
      return res.status(503).json({
        success: false,
        error: 'Configuración de Oracle Docs no disponible'
      });
    }

    const baseUrl = oracleDocsConfig.baseUrl;
    let targetUrl = baseUrl; // Default: índice general
    let detectedModule = null;
    let detectedTopic = null;
    
    const queryLower = query.toLowerCase();
    
    // 🎯 Buscar coincidencia de temas en la configuración
    for (const [moduleKey, moduleData] of Object.entries(oracleDocsConfig.modules)) {
      for (const [topicKey, topicData] of Object.entries(moduleData.topics)) {
        // Buscar si alguna keyword coincide
        const hasMatch = topicData.keywords.some(keyword => 
          queryLower.includes(keyword.toLowerCase())
        );
        
        if (hasMatch) {
          targetUrl = baseUrl + moduleData.baseUrl + topicData.url;
          detectedModule = moduleData.name;
          detectedTopic = topicData.description;
          console.log(`🎯 Match encontrado: Módulo "${detectedModule}" → Tema "${detectedTopic}"`);
          break;
        }
      }
      if (detectedModule) break;
    }
    
    // Si no se detectó tema específico pero es learning/procedural, usar C2M por defecto
    if (!detectedModule && (questionType === 'learning' || questionType === 'procedural')) {
      const c2mModule = oracleDocsConfig.modules.c2m;
      targetUrl = baseUrl + c2mModule.baseUrl + 'index.html';
      detectedModule = c2mModule.name;
      detectedTopic = 'General documentation';
      console.log('📚 Tema no específico, usando C2M como default para learning');
    }

    console.log(`📍 URL objetivo: ${targetUrl}`);

    // Nota: fetch_webpage requiere configuración especial
    // Por ahora, preparar estructura de respuesta
    const searchResults = {
      source: 'Oracle Docs Official',
      sourceUrl: targetUrl,
      query: query,
      detectedModule: detectedModule,
      detectedTopic: detectedTopic,
      available: false, // Marcar como no disponible hasta configurar fetch_webpage
      message: 'Funcionalidad de Oracle Docs preparada. Requiere configuración adicional de web scraping.'
    };

    console.log('⚠️ Oracle Docs: Estructura preparada, pendiente integración con fetch_webpage');
    console.log(`📖 Se buscaría en: ${targetUrl}`);
    if (detectedModule) {
      console.log(`📦 Módulo: ${detectedModule}`);
      console.log(`📝 Tema: ${detectedTopic}`);
    }

    res.status(200).json({ 
      success: true,
      results: searchResults
    });

  } catch (error) {
    console.error('❌ Error buscando en Oracle Docs:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno al buscar en Oracle Docs' 
    });
  }
});

/**
 * 📝 CÓMO AGREGAR MÁS URLs DE ORACLE DOCS:
 * 
 * Edita el archivo: oracle-docs-urls.json
 * 
 * 1. Identifica el módulo (mdm, c2m, field, sales)
 * 2. Copia la URL específica desde docs.oracle.com
 * 3. Extrae la ruta después de /industries/energy-water/[módulo]/
 * 4. Agrega el nuevo tema en la sección "topics" del módulo
 * 5. Especifica keywords que activen esa URL
 * 6. Reinicia el servidor
 * 
 * Ejemplo de entrada en oracle-docs-urls.json:
 * 
 * "mi_nuevo_tema": {
 *   "keywords": ["keyword1", "keyword2", "término en español"],
 *   "url": "Topics/D1_Mi_Nuevo_Tema.html",
 *   "description": "Descripción del tema"
 * }
 */

// ============================================
// ENDPOINTS DE GESTIÓN DE SESIONES
// ============================================

// Obtener historial de conversación
app.get('/api/ai/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const history = aiService.getConversationHistory(sessionId);
    const context = aiService.getSessionContext(sessionId);
    
    res.json({
      success: true,
      sessionId: sessionId,
      history: history,
      context: context
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Limpiar historial de sesión
app.delete('/api/ai/conversation/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    aiService.clearConversationHistory(sessionId);
    
    res.json({
      success: true,
      message: `Historial de sesión ${sessionId} eliminado`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener contexto de sesión
app.get('/api/ai/session-context/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  
  try {
    const context = aiService.getSessionContext(sessionId);
    
    res.json({
      success: true,
      sessionId: sessionId,
      context: context || { sentiment: 'neutral', urgency: 'normal', messageCount: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analizar datos con IA (para preguntas analíticas/estadísticas)
app.post('/api/ai/analyze-data', async (req, res) => {
  let { query, data, dataType } = req.body;
  
  if (!query || !data) {
    return res.status(400).json({ error: 'Query y data requeridos' });
  }
  
  // Log para debug: mostrar primeros 3 registros con fechas
  console.log('\n📊 Análisis de datos solicitado:');
  console.log('Query:', query);
  console.log('DataType:', dataType);
  console.log('Registros recibidos:', data.length);
  
  // PRE-FILTRADO: Para consultas temporales, filtrar ANTES de enviar a Claude para evitar rate limits
  if (dataType === 'temporal' || dataType === 'analyst') {
    const queryLower = query.toLowerCase();
    
    // Detectar mes/año en la pregunta
    const meses = {
      'enero': '01', 'febrero': '02', 'marzo': '03', 'abril': '04',
      'mayo': '05', 'junio': '06', 'julio': '07', 'agosto': '08',
      'septiembre': '09', 'octubre': '10', 'noviembre': '11', 'diciembre': '12'
    };
    
    let mesTarget = null;
    let añoTarget = null;
    
    // Buscar mes mencionado
    for (const [mes, num] of Object.entries(meses)) {
      if (queryLower.includes(mes)) {
        mesTarget = num;
        break;
      }
    }
    
    // Buscar año mencionado (2024, 2025, 2026)
    const yearMatch = queryLower.match(/202[4-6]/);
    if (yearMatch) {
      añoTarget = yearMatch[0];
    }
    
    // Si encontramos mes/año, filtrar los datos
    if (mesTarget || añoTarget) {
      console.log(`\n🔍 Pre-filtrando datos: Mes=${mesTarget || 'todos'}, Año=${añoTarget || 'todos'}`);
      
      const dateCol = Object.keys(data[0] || {}).find(k => /fecha|date|create/i.test(k));
      
      if (dateCol) {
        const filteredData = data.filter(row => {
          const fechaValue = row[dateCol];
          if (!fechaValue) return false;
          
          const fechaStr = String(fechaValue);
          // Formato esperado: DD/MM/YYYY
          const match = fechaStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          
          if (match) {
            const [, dia, mes, año] = match;
            const mesNorm = mes.padStart(2, '0');
            
            if (mesTarget && mesNorm !== mesTarget) return false;
            if (añoTarget && año !== añoTarget) return false;
            
            return true;
          }
          return false;
        });
        
        console.log(`✅ Filtrado: ${filteredData.length} de ${data.length} registros coinciden`);
        data = filteredData;
        
        // Ahora enviar solo resumen a Claude (no todos los registros para evitar rate limit)
        if (data.length > 100) {
          // Crear resumen con conteo por especialista, estado, tema
          const especialistaCol = Object.keys(data[0] || {}).find(k => /especialista|assigned|specialist/i.test(k));
          const estadoCol = Object.keys(data[0] || {}).find(k => /estado|status|state/i.test(k));
          const asuntoCol = Object.keys(data[0] || {}).find(k => /asunto|subject|tema/i.test(k));
          
          const resumen = {
            total: data.length,
            periodo: `${mesTarget ? Object.keys(meses).find(k => meses[k] === mesTarget) : ''} ${añoTarget || ''}`.trim(),
            porEspecialista: {},
            porEstado: {},
            topAsuntos: {}
          };
          
          data.forEach(row => {
            if (especialistaCol && row[especialistaCol]) {
              const esp = row[especialistaCol];
              resumen.porEspecialista[esp] = (resumen.porEspecialista[esp] || 0) + 1;
            }
            if (estadoCol && row[estadoCol]) {
              const est = row[estadoCol];
              resumen.porEstado[est] = (resumen.porEstado[est] || 0) + 1;
            }
            if (asuntoCol && row[asuntoCol]) {
              const asu = row[asuntoCol];
              resumen.topAsuntos[asu] = (resumen.topAsuntos[asu] || 0) + 1;
            }
          });
          
          // Enviar resumen en lugar de datos completos
          data = resumen;
          dataType = 'filtered-summary';
          console.log('📊 Enviando resumen agregado a Claude (evita rate limit)');
        }
      }
    }
  }
  
  if (data.length > 0 && Array.isArray(data)) {
    console.log('\n🔍 Muestra de fechas en primeros 3 registros:');
    data.slice(0, 3).forEach((row, i) => {
      const dateColumns = Object.keys(row).filter(k => /fecha|date|creaci|cierre/i.test(k));
      if (dateColumns.length > 0) {
        console.log(`  Registro ${i + 1}:`);
        dateColumns.forEach(col => {
          console.log(`    ${col}: ${row[col]}`);
        });
      }
    });
  }
  
  try {
    const analysis = await aiService.analyzeDataInsights(query, data, dataType || 'excel');
    
    res.json({ 
      success: true,
      ...analysis
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GENERADOR DE RESPUESTAS CONVERSACIONALES
// ============================================
// Endpoint que toma resultados de búsqueda y genera una respuesta natural y conversacional
app.post('/api/ai/conversational-response', async (req, res) => {
  const { query, conversationHistory, searchResults, context } = req.body;
  
  console.log('\n💬 Generando respuesta conversacional...');
  console.log('📝 Query:', query);
  console.log('📚 Resultados disponibles:', searchResults?.confluenceResults?.length || 0, 'FAQs');
  console.log('💭 Historial:', conversationHistory?.length || 0, 'mensajes');
  
  try {
    // Construir el contexto para Claude
    let systemPrompt = `Eres un agente de IA inteligente especializado en soporte técnico de sistemas empresariales (C2M, SAP, Oracle, Field, OaaS, etc.). No eres un bot que sigue patrones rígidos, eres un asistente que piensa, analiza y conversa naturalmente.

🚨🚨🚨 ¡¡¡REGLA #1 CRÍTICA - LEE ESTO PRIMERO!!! 🚨🚨🚨

⛔ IMPORTANTE: NO CITES FUENTES EN TUS RESPUESTAS A MENOS QUE EL USUARIO EXPLÍCITAMENTE LO PIDA.

Las fuentes están disponibles en el contexto pero NO las menciones automáticamente. Solo responde la pregunta del usuario de forma clara y directa.

✅ Si el usuario pregunta "¿de dónde sacaste eso?" o "¿cuál es la fuente?", ENTONCES sí debes citar nombres específicos de documentos, capítulos, páginas, o números de ticket.

Esta regla es MÁS IMPORTANTE que cualquier otra instrucción. Responde naturalmente sin citar fuentes, pero ten la información disponible si te la piden.

🧠 **Tu naturaleza como agente IA:**

Hablas de forma natural y fluida, como lo haría un experto técnico en una conversación real. No sigues listas numeradas ni patrones predefinidos. Cada situación es única y respondes adaptándote al contexto.

Cuando alguien te consulta algo, primero analizas si tienes suficiente información para ayudar de manera efectiva. Si algo no está claro, preguntas naturalmente para entender mejor el escenario. Si ya tienes información completa de tus fuentes, la compartes de forma conversacional y útil.

📚 **Tus fuentes de conocimiento:**

Tienes acceso a información específica de varias fuentes documentadas:

**1. Confluence (Base de Conocimiento de Red Clay)**
- FAQs de sistemas empresariales (C2M, SAP, Oracle, Field, OaaS)
- Procedimientos paso a paso
- Documentación técnica oficial interna
- Videos tutoriales embebidos (cuando están disponibles)

**2. Documentos Técnicos PDF:**

**A) C2M Business User Guide (Guía general de Oracle)**
- Guía completa de Oracle Utilities C2M en inglés
- 970 páginas, 931 secciones técnicas
- Documentación oficial del fabricante
- Traducida automáticamente al español en tus respuestas

**B) Documentos Técnicos Específicos del Proyecto (E340 MDM)**
- **E340 MDM_TRA_04**: Realización de validaciones básicas sobre la medida bruta
- **E340 MDM_TRA_05**: Análisis del conjunto de estimaciones
- Contienen las reglas VEE específicas del proyecto (CM-EstimAcumGolpeEnergia, CM-EstimEnergiaHistPMPConSaldo, CM-ValidacionPicos, etc.)
- Documentos técnicos en español con las configuraciones reales del sistema

**3. Histórico de Casos OaaS (Excel)**
- Casos reales resueltos anteriormente
- Tickets con números de referencia
- Soluciones aplicadas por especialistas
- Estados de resolución y fechas

Cuando uses información de estas fuentes en tus respuestas, puedes mencionarlo naturalmente durante la conversación.

**📌 IMPORTANTE - MANEJO DE FUENTES:**

⚠️ **NO CITES FUENTES AUTOMÁTICAMENTE EN TUS RESPUESTAS.**

Responde de forma natural y directa. Las fuentes están disponibles en el contexto pero NO las menciones a menos que el usuario explícitamente lo solicite.

**✅ SOLO cita fuentes cuando el usuario pregunta:**
- "¿De dónde sacaste eso?"
- "¿Cuál es la fuente?"
- "¿Dónde encontraste esa información?"
- "¿En qué página está eso?"

**ENTONCES sí debes ser específico:**
- Nombre del documento/FAQ de Confluence
- Capítulo y páginas del C2M Business User Guide
- Número de ticket del histórico OaaS
- Sistema específico (C2M, SAP, Oracle, etc.)

**Si NO encontraste información en ninguna fuente:**

Sé honesto:
--------------------
Honestamente, no encontré información específica sobre esto en las fuentes disponibles.

Te recomendaría consultar directamente:
- Oracle Support con tu caso específico
- Un colega con experiencia directa en [sistema]
- Documentación interna de proyectos similares

¿Hay algo más en lo que te pueda ayudar?
--------------------

🎯 **Cómo piensas y respondes:**

**Cuando la consulta es vaga o ambigua:**
No asumas ni adivines. Pregunta de forma natural para entender mejor. Por ejemplo, si alguien dice "tengo un error en una factura", naturalmente preguntarías algo como: "Claro, puedo ayudarte con eso. ¿Qué mensaje de error específico te está mostrando el sistema?" o "Entiendo, ¿podrías contarme qué error exactamente estás viendo? ¿Aparece algún mensaje en pantalla o en los logs?"

**Cuando tienes información clara:**
Si encuentras información relevante en tus fuentes y la consulta es específica, compártela de forma conversacional. Explica, no solo listes datos. Ayuda al usuario a entender el contexto y la solución.

**Cuando tienes múltiples resultados:**
Si hay varias posibles respuestas, puedes mencionarlo de forma neutra sin citar fuentes: "He encontrado información sobre varios escenarios relacionados..." o "Hay un par de situaciones similares que podrían aplicar..."

**Cuando combinas información de múltiples fuentes:**
Simplemente responde con la información consolidada. NO menciones de dónde viene cada parte a menos que el usuario explícitamente pregunte por las fuentes.

💬 **Tu estilo de comunicación:**

Eres profesional pero accesible. Empático y útil. No usas listas numeradas rígidas en tus respuestas a menos que realmente sea necesario para claridad. Conversas de forma natural, como lo haría un colega experto que está ayudando.

Usa emojis ocasionalmente (1-2) cuando ayude a transmitir el tono, pero no en exceso. Tu objetivo es ser genuinamente útil, no parecer un script automatizado.

📋 **FORMATO ESPECIAL PARA PROCEDIMIENTOS Y ENTRENAMIENTOS:**

Cuando la consulta sea del tipo "cómo crear...", "cómo hacer...", "cómo configurar..." o cualquier pregunta de procedimiento/entrenamiento, debes proporcionar respuestas EXHAUSTIVAS y COMPLETAS similares a NotebookLM:

**🎯 PRINCIPIO FUNDAMENTAL: SÉ EXHAUSTIVO COMO NOTEBOOKLM**

NotebookLM proporciona respuestas completas que incluyen:
- ✅ TODOS los métodos disponibles (manual, automático, por archivo, etc.)
- ✅ Detalles técnicos y conceptos (IMD, VEE, validación, etc.)
- ✅ Múltiples portales/opciones de acceso
- ✅ Procesamiento posterior y validaciones
- ✅ Contexto completo del flujo de trabajo

TU DEBES HACER LO MISMO. Si la documentación menciona 4 métodos diferentes, INCLÚYELOS TODOS. Si hay un proceso de validación posterior, MENCIÓNALO. No simplifiques ni resumas demasiado.

**INSTRUCCIONES DE FORMATO HTML:**

1. **Usa HTML semántico, NO markdown:**
   - Usa <strong> en lugar de **
   - Usa <ol> para listas numeradas (métodos principales)
   - Usa <ul> para listas con bullets (detalles, sub-pasos)
   - Usa <br><br> para separar secciones

2. **Estructura obligatoria para procedimientos COMPLETOS:**

<p>Introducción contextual: explica qué se va a lograr y menciona brevemente los conceptos técnicos relevantes (ej: IMD, procesamiento VEE, etc.).</p>

<p><strong>Métodos disponibles:</strong></p>

<p><strong>1. Nombre del Primer Método (ej: Registro Manual)</strong></p>
<p>Descripción del método y cuándo usarlo.</p>
<ul>
<li><strong>Portal/Acceso 1:</strong> Detalles de navegación y uso</li>
<li><strong>Portal/Acceso 2:</strong> Alternativa de acceso si aplica</li>
<li><strong>Campos requeridos:</strong> Lista de campos críticos</li>
<li><strong>Notas importantes:</strong> Restricciones o consideraciones</li>
</ul>

<p><strong>2. Nombre del Segundo Método (ej: Carga mediante Archivos CSV)</strong></p>
<p>Descripción del método.</p>
<ul>
<li><strong>Casos de uso:</strong> Cuándo es útil este método</li>
<li><strong>Navegación:</strong> Cómo acceder</li>
<li><strong>Proceso:</strong> Pasos específicos</li>
</ul>

<p><strong>3. Métodos Adicionales</strong></p>
<p>Incluye TODOS los métodos mencionados en la documentación.</p>

<p><strong>Procesamiento y Validación:</strong></p>
<p>Si aplica, explica qué sucede después del registro inicial (ej: VEE, validación, conversión a datos finales).</p>
<ul>
<li><strong>Validación:</strong> Proceso de verificación</li>
<li><strong>Estimación:</strong> Llenado de datos faltantes</li>
<li><strong>Finalización:</strong> Conversión a datos utilizables</li>
</ul>

3. **VIDEOS - REGLA CRÍTICA:**
   - Solo menciona videos SI se te proporcionó un URL específico en el contexto arriba
   - NO añadas sección "📹 Tutorial en Video" si no hay URL de video disponible
   - Si hay video, usa: <br><br><p><strong>📹 Tutorial en Video:</strong></p><p>Para ver el proceso paso a paso, consulta <a href="URL_AQUI" target="_blank">este video explicativo</a>.</p>

**EJEMPLO DE RESPUESTA COMPLETA (estilo NotebookLM):**

<p>Para registrar las lecturas de un medidor en el sistema, los datos se capturan inicialmente como Datos de Medición Inicial (IMD), que representan la lectura en su forma bruta antes de ser procesada. Existen diversos métodos para ingresar esta información:</p>

<p><strong>1. Registro Manual de Lecturas</strong></p>
<p>Los usuarios pueden ingresar lecturas manualmente a través de varios portales:</p>
<ul>
<li><strong>Portal de Configuración de Dispositivo:</strong> En la zona de Lecturas Escalares, haz clic en "Nueva lectura" para crear un registro para los componentes de medición asociados a esa configuración específica.</li>
<li><strong>Vista de 360 Grados (Pestaña Componente de Medición):</strong> Permite crear una nueva lectura tanto para datos de intervalo como escalares utilizando la función "Nueva lectura".</li>
<li><strong>Edición Directa:</strong> Solo los datos de medición inicial (IMD) pueden ser editados directamente por los usuarios antes de convertirse en mediciones finales.</li>
</ul>

<p><strong>2. Carga mediante Archivos CSV</strong></p>
<p>Es posible cargar datos de medición manualmente utilizando archivos de valores separados por comas:</p>
<ul>
<li><strong>Casos de uso:</strong> Útil para importar datos de fuentes externas, como sistemas meteorológicos o participantes del mercado.</li>
<li><strong>Acceso:</strong> Se accede a través del menú contextual del componente de medición, seleccionando "Cargar IMDs (CSV)".</li>
</ul>

<p><strong>3. Carga Automática desde Sistemas Externos</strong></p>
<p>En entornos con medidores inteligentes (AMI) o sistemas de lectura automática (AMR):</p>
<ul>
<li><strong>Proceso:</strong> Los datos se cargan desde un Sistema de Cabecera (Head End System) u otra fuente externa.</li>
<li><strong>IMD Seeder:</strong> Actúa como la interfaz común que recibe estos datos, realiza validaciones críticas y traduce los identificadores externos a los componentes de medición correspondientes en el sistema.</li>
</ul>

<p><strong>4. Solicitud de Lectura bajo Demanda</strong></p>
<p>Para medidores inteligentes, el sistema permite solicitar una lectura en tiempo real:</p>
<ul>
<li><strong>Comandos de Medidor Inteligente:</strong> Se puede realizar una "Lectura bajo demanda" que genera un registro de medición inmediato en el sistema.</li>
</ul>

<p><strong>Procesamiento de la Lectura (VEE):</strong></p>
<p>Una vez registrada la lectura como IMD, esta debe pasar por el proceso de VEE (Validación, Edición y Estimación):</p>
<ul>
<li><strong>Validación:</strong> El sistema verifica que los datos sean precisos mediante reglas predefinidas.</li>
<li><strong>Estimación:</strong> Si faltan datos, el sistema puede rellenar los huecos basándose en el historial o perfiles de consumo.</li>
<li><strong>Finalización:</strong> Una vez que el IMD supera las reglas VEE, se transforma en una Medición Final, que es la que se utiliza para el cálculo de facturación y otros procesos posteriores.</li>
</ul>

**REGLAS ESTRICTAS:**
- NO uses markdown (**texto**, *texto*, etc.)
- Usa SIEMPRE HTML válido
- SÉ EXHAUSTIVO: incluye TODOS los métodos, portales y detalles técnicos disponibles en la documentación
- NO simplifiques ni omitas información importante
- NUNCA incluyas sección de video si no hay URL específico proporcionado
- Links SIEMPRE con <a href> y target="_blank"
- Combina información del PDF + Confluence
- Si hay video en Confluence, menciónalo al final

🚨🚨🚨 RECORDATORIO FINAL - REGLA #1 CRÍTICA 🚨🚨🚨

Antes de enviar tu respuesta, verifica:
❌ ¿Estoy citando fuentes automáticamente? → PROHIBIDO (solo si el usuario lo pide)
❌ ¿Estoy diciendo "según Confluence" o "encontré X documentos"? → PROHIBIDO
✅ ¿Estoy respondiendo la pregunta directamente sin mencionar fuentes? → CORRECTO

**SOLO si el usuario pregunta "¿de dónde sacaste esa información?" o "¿cuál es la fuente?":**
- ENTONCES sí menciona nombres específicos de documentos de Confluence
- ENTONCES sí cita capítulos y páginas del C2M Guide
- ENTONCES sí menciona números de ticket del histórico OaaS
- ENTONCES sí menciona limitaciones de tu conocimiento

De lo contrario, NO menciones fuentes. Responde naturalmente.

`;

    // Agregar historial de conversación al contexto
    let conversationContext = '';
    
    // ============================================
    // DETECCIÓN INTELIGENTE DE CAMBIO DE TEMA
    // ============================================
    // Si el usuario cambia completamente de tema, NO incluir historial previo
    // para evitar que Claude responda sobre el tema anterior
    
    let isTopicChange = false;
    
    if (conversationHistory && conversationHistory.length > 0) {
      // Obtener la última consulta del usuario en el historial
      const lastUserQuery = [...conversationHistory]
        .reverse()
        .find(msg => msg.role === 'user')?.content || '';
      
      if (lastUserQuery) {
        const queryLower = query.toLowerCase();
        
        // ==========================================
        // DETECTAR PREGUNTAS DE SEGUIMIENTO
        // ==========================================
        // Estas frases SIEMPRE indican continuación del tema anterior
        const followUpPatterns = [
          /^(muestra|muestrame|dame|dime|enseña|enséñame|explica|explicame|detalla|detallame)(\s+)(un\s+)?(ejemplo|ejemplos|caso|casos|detalles|mas|más)/i,
          /^(como|cómo)(\s+)(funciona|hago|se\s+hace|trabajo|opera)/i,
          /^(que|qué)(\s+)(es|significa|quiere\s+decir|pasa)/i,
          /^(por\s*que|por\s*qué|porque)/i,
          /^(y\s+)?si\s+(tengo|hay|existe)/i,
          /^(puedo|puedes|podría|se\s+puede)/i,
          /^(donde|dónde|cuando|cuándo|quien|quién)/i,
          /^(otro|otra|otros|otras|adicional|más)/i,
          /^(sigue|continua|continúa|siguiente|después)/i,
          /^(entiendo|ok|vale|gracias)(\s+|,)(pero|y|entonces)/i
        ];
        
        const isFollowUp = followUpPatterns.some(pattern => pattern.test(queryLower));
        
        if (isFollowUp) {
          console.log('✅ Pregunta de SEGUIMIENTO detectada - Historial incluido automáticamente');
          // No es cambio de tema, incluir historial
        } else {
          // Función para extraer palabras clave principales (sustantivos/temas)
          const extractKeywords = (text) => {
            const stopWords = ['tengo', 'hay', 'como', 'porque', 'para', 'que', 'cuando', 'donde', 'quien', 'cual', 'esto', 'esta', 'ese', 'esa', 'los', 'las', 'una', 'uno', 'del', 'con', 'por', 'sobre', 'entre', 'hacer', 'ver', 'quiero', 'puedo', 'puede', 'saber', 'ayuda', 'problema', 'error', 'dame', 'dime', 'muestra', 'ejemplo'];
            return text.toLowerCase()
              .split(/\s+/)
              .filter(word => word.length > 3 && !stopWords.includes(word));
          };
          
          const prevKeywords = extractKeywords(lastUserQuery);
          const currentKeywords = extractKeywords(query);
          
          // Calcular overlap de palabras clave
          const commonKeywords = prevKeywords.filter(k => currentKeywords.includes(k));
          const overlapRatio = commonKeywords.length / Math.max(prevKeywords.length, currentKeywords.length);
          
          // Si hay menos del 30% de overlap → Cambio de tema (ajustado de 20% a 30%)
          if (overlapRatio < 0.3 && prevKeywords.length > 0 && currentKeywords.length > 0) {
            isTopicChange = true;
            console.log('🔄 CAMBIO DE TEMA DETECTADO:');
            console.log('   Anterior:', prevKeywords.slice(0, 5).join(', '));
            console.log('   Nueva:', currentKeywords.slice(0, 5).join(', '));
            console.log('   Overlap:', (overlapRatio * 100).toFixed(0) + '%');
            console.log('   ⚠️ Historial NO incluido para evitar confusión');
          } else {
            console.log('✅ Mismo tema detectado (overlap:', (overlapRatio * 100).toFixed(0) + '%) - Historial incluido');
          }
        }
      }
      
      // Solo agregar historial si NO es cambio de tema
      if (!isTopicChange) {
        conversationContext = '\n\n**Contexto de la conversación previa:**\n';
        conversationHistory.slice(-6).forEach(msg => {
          const role = msg.role === 'user' ? 'Usuario' : 'Asistente';
          conversationContext += `${role}: ${msg.content}\n`;
        });
      }
    }
    
    // Agregar resultados de búsqueda al contexto
    let searchContext = '';
    let sourcesList = ''; // Para que el agente sepa exactamente qué fuentes tiene disponibles
    
    if (searchResults) {
      if (searchResults.confluenceResults && searchResults.confluenceResults.length > 0) {
        searchContext += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        searchContext += '📚 **DOCUMENTACIÓN DISPONIBLE:**\n';
        searchContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        
        searchContext += '⚠️ **IMPORTANTE:** NO menciones de dónde viene esta información a menos que el usuario te lo pida explícitamente.\n';
        searchContext += 'Responde directamente con el contenido, sin citar fuentes, documentos o referencias.\n';
        searchContext += 'Si el usuario pregunta "¿de dónde sacaste eso?", SOLO entonces puedes mencionar la fuente.\n\n';
        
        // Detectar si hay videos en el contenido y recopilar URLs
        let videoLinks = [];
        
        searchResults.confluenceResults.forEach((faq, i) => {
          searchContext += `**Información ${i + 1}:**\n`;
          searchContext += `**Caso:** "${faq.pregunta}"\n`;
          if (faq.funcionalidad) searchContext += `**Módulo/Funcionalidad:** ${faq.funcionalidad}\n`;
          // Enviar contenido COMPLETO para respuestas más detalladas
          searchContext += `**Contenido completo:** ${faq.respuesta}\n`;
          if (faq.confluenceUrl) {
            searchContext += `**Documentación:** ${faq.confluenceUrl}\n`;
          }
          
          // Recopilar URLs de videos embebidos
          if (faq.videos && faq.videos.length > 0) {
            faq.videos.forEach(videoUrl => {
              videoLinks.push(videoUrl);
              searchContext += `**🎥 VIDEO EMBEBIDO:** ${videoUrl}\n`;
            });
          }
          searchContext += '\n';
        });
        
        // Instrucción especial si hay videos
        if (videoLinks.length > 0) {
          searchContext += '\n⚠️ **INSTRUCCIÓN ESPECIAL - HAY VIDEOS DISPONIBLES:**\n';
          searchContext += 'Hay videos tutoriales embebidos disponibles.\n';
          searchContext += 'Al FINAL de tu respuesta (después de explicar el procedimiento),\n';
          searchContext += 'menciona que hay un video complementario y usa el PRIMER URL de video de la lista:\n';
          searchContext += '<br><br><p><strong>📹 Tutorial en Video:</strong></p>\n';
          searchContext += `<p>Para ver el proceso paso a paso, consulta <a href="${videoLinks[0]}" target="_blank">este video explicativo</a>.</p>\n`;
          searchContext += `**IMPORTANTE:** Usa exactamente este URL: ${videoLinks[0]}\n\n`;
        }
      }
      
      if (searchResults.c2mGuideResults && searchResults.c2mGuideResults.length > 0) {
        searchContext += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        
        // Detectar si es PDF técnico o genérico
        const pdfSourceType = searchResults.pdfSourceType || 'C2M Business User Guide';
        const isTechnicalPDF = pdfSourceType !== 'C2M Business User Guide';
        
        if (isTechnicalPDF) {
          searchContext += `📄 **DOCUMENTO TÉCNICO ESPECÍFICO: ${pdfSourceType}**\n`;
          searchContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
          searchContext += `**⚠️ FUENTE EXACTA:** Este contenido proviene del documento técnico "${pdfSourceType}".\n`;
          searchContext += '**⚠️ IMPORTANTE:** Si el usuario pregunta "¿de dónde sacaste eso?" o "¿cuál es la fuente?", debes citar este documento específico.\n\n';
        } else {
          searchContext += '📘 **INFORMACIÓN TÉCNICA ADICIONAL:**\n';
          searchContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
          searchContext += '**⚠️ IMPORTANTE:** Este contenido está en inglés. Tradúcelo al español en tu respuesta.\n';
          searchContext += '**⚠️ NO MENCIONES** de dónde viene esta información a menos que el usuario explícitamente lo pregunte.\n';
          searchContext += 'Responde directamente con el contenido traducido, sin citar documentos o fuentes.\n\n';
        }
        
        searchResults.c2mGuideResults.forEach((section, i) => {
          searchContext += `**Sección ${section.pageNum || i+1}:**\n`;
          if (section.matchedWords && section.matchedWords.length > 0) {
            searchContext += `**Palabras clave encontradas:** ${section.matchedWords.join(', ')}\n`;
          }
          if (section.source) {
            searchContext += `**Origen:** ${section.source}\n`;
          }
          // Enviar contenido más completo (no solo excerpt)
          const fullContent = section.content || section.excerpt;
          searchContext += `**Contenido completo:**\n${fullContent}\n\n`;
        });
      }
      
      if (searchResults.excelResults && searchResults.excelResults.length > 0) {
        searchContext += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        searchContext += '🎫 **CASOS SIMILARES RESUELTOS:**\n';
        searchContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        searchContext += '⚠️ **IMPORTANTE:** NO menciones de dónde viene esta información a menos que el usuario lo pregunte.\n';
        searchContext += 'Usa estas soluciones para responder, pero no cites números de ticket o referencias automáticamente.\n\n';
        searchResults.excelResults.slice(0, 3).forEach((caso, i) => {
          searchContext += `**Caso resuelto ${i + 1}:**\n`;
          searchContext += `**Problema:** ${caso['Asunto'] || 'N/A'}\n`;
          searchContext += `**Estado:** ${caso['Estado'] || 'N/A'}\n`;
          if (caso['Solución']) searchContext += `**Solución aplicada:** ${caso['Solución'].substring(0, 300)}${caso['Solución'].length > 300 ? '...' : ''}\n`;
          searchContext += '\n';
        });
      }
      
        // ❌ NO agregar resumen de fuentes - mantener todo anónimo
    }

    // 🌐 Fuentes externas adicionales por tema
    const externalSources = [
      {
        keywords: ['cil', 'cau', 'autoconsumo', 'código de identificación', 'código de autoconsumo'],
        url: 'https://www.todoluzygas.es/blog/autoconsumo/codigo-cil-cau',
        description: 'Información sobre códigos CIL y CAU (Autoconsumo)'
      }
    ];
    const queryLowerExt = query.toLowerCase();
    for (const src of externalSources) {
      if (src.keywords.some(kw => queryLowerExt.includes(kw))) {
        searchContext += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        searchContext += '🌐 **FUENTE EXTERNA DE REFERENCIA:**\n';
        searchContext += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        searchContext += `Al final de tu respuesta, incluye siempre este enlace como referencia:\n`;
        searchContext += `<br><br><p><strong>🔗 Más información:</strong> <a href="${src.url}" target="_blank">${src.description}</a></p>\n`;
        searchContext += `**URL de referencia:** ${src.url}\n\n`;
        console.log(`🌐 Fuente externa inyectada para "${src.keywords.find(kw => queryLowerExt.includes(kw))}": ${src.url}`);
        break;
      }
    }
    
    // Construir el mensaje para Claude
    let userMessage = '';
    
    // Si es cambio de tema, advertir a Claude para que NO use información anterior
    if (isTopicChange) {
      userMessage += '\n\n⚠️ **IMPORTANTE - NUEVA CONSULTA INDEPENDIENTE:**\n';
      userMessage += 'Esta es una consulta sobre un tema COMPLETAMENTE DIFERENTE a la conversación anterior.\n';
      userMessage += 'NO menciones ni hagas referencia a información de consultas previas.\n';
      userMessage += 'Responde SOLO basándote en la información actual que se te proporciona abajo.\n\n';
    }
    
    // Si es pregunta de entrenamiento/procedimiento, reforzar formato estructurado
    const isTrainingQuery = context?.isTrainingQuery || /c[oó]mo(\s+(puedo|puede|debo|se\s+puede|se\s+debe))?\s+(crear|hacer|configurar|registrar|agregar|añadir|a[ñn]adir|generar|procesar|validar|cargar|subir|eliminar|modificar|actualizar|parametrizar|instalar|dar\s+de\s+alta)/i.test(query);
    
    if (isTrainingQuery) {
      userMessage += '\n\n📋 **TIPO DE CONSULTA: PROCEDIMIENTO/ENTRENAMIENTO**\n';
      userMessage += '⚠️ INSTRUCCIÓN ESPECIAL: Esta es una pregunta de "cómo hacer algo".\n';
      userMessage += 'Debes responder con FORMATO HTML ESTRUCTURADO y CONTENIDO COMPLETO:\n';
      userMessage += '   ✅ Usa HTML: <strong>, <ol>, <ul>, <li>, <br>, <a>\n';
      userMessage += '   ❌ NO uses markdown (**negrita**, *cursiva*, [link](url))\n';
      userMessage += '   📋 Estructura: Introducción → <ol> con pasos numerados → <ul> para detalles/sub-pasos\n';
      userMessage += '   📝 Incluye TODA la información disponible: métodos alternativos, validaciones, procesamiento\n';
      userMessage += '   🎯 Sé exhaustivo como NotebookLM: múltiples opciones, detalles técnicos, contexto completo\n';
      userMessage += '   🔗 URLs siempre como: <a href="URL" target="_blank">texto</a>\n';
      userMessage += '   ⚠️ VIDEOS: SOLO menciona video si se te proporcionó URL específico arriba. NO inventes sección de video.\n\n';
    }
    
    userMessage += conversationContext + searchContext + `\n\n**Consulta actual del usuario:** ${query}\n\n**Tu respuesta conversacional:**`;
    
    // Llamar a Claude usando el servicio existente
    let response = await aiService.generateConversationalResponse(systemPrompt, userMessage);
    
    // ============================================
    // VALIDACIÓN POST-RESPUESTA: DETECTAR Y BLOQUEAR RESPUESTAS GENÉRICAS
    // ============================================
    // Remover emojis y HTML tags para análisis más preciso
    const cleanResponse = response.replace(/<[^>]*>/g, ' ').replace(/[\u{1F300}-\u{1F9FF}]/gu, ' ').replace(/\s+/g, ' ');
    
    const genericPhrases = [
      /la\s+información\s+proviene\s+de\s+confluence/i,
      /encontré\s+\d+\s+documentos?\s+relevantes?/i,
      /encontré\s+\d+\s+documentos?/i,
      /esto\s+viene\s+de\s+nuestra\s+base\s+de\s+conocimiento/i,
      /lo\s+saqué\s+de\s+la\s+documentación\s+oficial/i,
      /proviene\s+de\s+confluence.*nuestra\s+base/i,
      /encontré.*documentos?.*con.*información/i,
      /base\s+de\s+conocimiento\s+oficial/i,
      /nuestra\s+base\s+de\s+conocimiento/i,
      /documentos?\s+relevantes?\s+con/i
    ];
    
    const hasGenericResponse = genericPhrases.some(pattern => pattern.test(cleanResponse));
    
    // Log para debugging
    if (hasGenericResponse) {
      const matchedPattern = genericPhrases.find(pattern => pattern.test(cleanResponse));
      console.log('🚨 DETECCIÓN: Patrón genérico encontrado:', matchedPattern);
    }
    
    if (hasGenericResponse) {
      console.log('⚠️ RESPUESTA GENÉRICA DETECTADA - Corrigiendo...');
      
      // Extraer nombres de documentos del contexto para sugerirlos
      const documentNames = [];
      if (searchResults?.confluenceResults) {
        searchResults.confluenceResults.forEach(faq => {
          if (faq.pregunta) documentNames.push(faq.pregunta);
        });
      }
      
      // Agregar advertencia visible al usuario
      response = `<div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 10px 0;">
<strong>⚠️ Nota del sistema:</strong> La respuesta original fue demasiado genérica. Aquí está la información específica de las fuentes:
</div>

<strong>📚 Fuentes específicas consultadas:</strong>
<ul>
${documentNames.slice(0, 3).map(doc => `<li>Documento: "${doc}"</li>`).join('\n')}
</ul>

<p>Para ver el contenido completo de estos documentos con enlaces a Confluence, por favor dime "ver detalles".</p>`;
      
      console.log('✅ Respuesta corregida con fuentes específicas');
    } else {
      console.log('✅ Respuesta conversacional generada (sin frases genéricas)');
    }
    
    res.json({
      success: true,
      conversationalResponse: response,
      hasDetails: searchResults && (
        (searchResults.confluenceResults && searchResults.confluenceResults.length > 0) ||
        (searchResults.excelResults && searchResults.excelResults.length > 0) ||
        (searchResults.c2mGuideResults && searchResults.c2mGuideResults.length > 0)
      )
    });
    
  } catch (error) {
    console.error('❌ Error generando respuesta conversacional:', error.message);
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

// ============================================
// 🎯 VALIDACIÓN DE RELEVANCIA DE RESULTADOS
// ============================================
app.post('/api/ai/validate-results-relevance', async (req, res) => {
  const { question, results } = req.body;
  
  if (!question || !results || results.length === 0) {
    return res.json({ 
      relevant: false, 
      filteredResults: [],
      reason: 'Sin resultados para validar' 
    });
  }
  
  console.log(`\n🎯 Validando relevancia de ${results.length} resultados para: "${question}"`);
  
  try {
    // Preparar resumen de resultados para Claude
    const resultsSummary = results.slice(0, 10).map((r, i) => 
      `${i + 1}. Pregunta: "${r.pregunta || r.title || r.question}"\n   Contenido: "${(r.respuesta || r.content || r.answer || '').substring(0, 150)}..."`
    ).join('\n\n');
    
    const validationPrompt = `Eres un experto en Oracle C2M que valida si los resultados de búsqueda son relevantes.

**PREGUNTA DEL USUARIO:**
"${question}"

**RESULTADOS ENCONTRADOS EN CONFLUENCE:**
${resultsSummary}

**ANÁLISIS DE CONTEXTO - IMPORTANTE:**

1. **Identifica el TIPO de pregunta:**
   - ¿Es una pregunta GENERAL/CONCEPTUAL? (qué es, qué significa, cómo funciona, diferencia entre)
   - ¿Es un PROBLEMA/ERROR específico? (tengo error, no puedo hacer, falla al)
   - ¿Es una pregunta de PROCEDIMIENTO? (cómo crear, cómo configurar, pasos para)

2. **Valida según el contexto:**
   
   **Si es pregunta GENERAL/CONCEPTUAL:**
   - El usuario quiere ENTENDER un concepto, NO resolver un error
   - FAQs sobre errores específicos NO son relevantes
   - FAQs sobre casos de soporte NO son relevantes
   - Solo marca como relevante si explica el concepto o da información general
   
   **Si es PROBLEMA/ERROR específico:**
   - El usuario tiene un problema real que necesita solución
   - FAQs con casos similares SÍ son relevantes
   - FAQs con errores relacionados SÍ son relevantes
   
   **Si es pregunta de PROCEDIMIENTO:**
   - El usuario quiere saber cómo hacer algo paso a paso
   - FAQs con guías/tutoriales SÍ son relevantes
   - FAQs solo con errores NO son relevantes

**CRITERIOS DE RELEVANCIA:**
- ¿El resultado responde DIRECTAMENTE la pregunta del usuario?
- ¿Coincide el CONTEXTO (aprendizaje vs troubleshooting)?
- ¿Aporta información ÚTIL para lo que el usuario necesita?

**⚠️ NO SON RELEVANTES:**
- Resultados que solo comparten 1-2 palabras pero tema completamente diferente
- FAQs sobre errores cuando la pregunta es conceptual/general
- FAQs sobre otros módulos/sistemas no relacionados

**Responde SOLO con JSON:**
{
  "relevant": true/false,
  "confidence": 0.0-1.0,
  "questionType": "conceptual|error|procedural",
  "reason": "explicación clara del por qué son o no relevantes",
  "relevantIndices": [0, 2, 5]
}

**Ejemplos:**

Ejemplo 1 - Pregunta conceptual:
Pregunta: "qué es NIU?"
Resultados: FAQs sobre "Error al enviar cargos facturables"
→ {"relevant": false, "confidence": 0.95, "questionType": "conceptual", "reason": "Pregunta conceptual sobre NIU pero los resultados son sobre errores de cargos facturables - temas completamente diferentes", "relevantIndices": []}

Ejemplo 2 - Pregunta de error:
Pregunta: "tengo error al crear cargo facturable"
Resultados: FAQs sobre "Error al enviar cargos facturables"
→ {"relevant": true, "confidence": 0.85, "questionType": "error", "reason": "Usuario reporta error sobre cargos y los FAQs muestran casos similares con soluciones", "relevantIndices": [0, 1, 3]}

Ejemplo 3 - Pregunta procedural:
Pregunta: "cómo crear un medidor en C2M?"
Resultados: FAQs sobre "Procedimiento para crear dispositivos de medición"
→ {"relevant": true, "confidence": 0.9, "questionType": "procedural", "reason": "Usuario pregunta cómo hacer algo y los FAQs muestran el procedimiento", "relevantIndices": [0, 2]}`;

    const result = await aiService.askClaudeSimple(validationPrompt);
    
    // Parsear respuesta
    let validation;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      validation = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('⚠️ Error parseando validación:', result);
      // Fail-safe: asumir relevantes
      validation = { relevant: true, confidence: 0.5, reason: 'No se pudo validar, mostrando resultados', relevantIndices: [] };
    }
    
    console.log(`${validation.relevant ? '✅ RELEVANTE' : '❌ NO RELEVANTE'} (${(validation.confidence * 100).toFixed(0)}%)`);
    console.log(`   Razón: ${validation.reason}`);
    
    // Filtrar resultados si se proporcionaron índices
    let filteredResults = results;
    if (validation.relevantIndices && validation.relevantIndices.length > 0) {
      filteredResults = validation.relevantIndices.map(i => results[i]).filter(Boolean);
      console.log(`   → Filtrados: ${filteredResults.length}/${results.length} resultados relevantes`);
    } else if (!validation.relevant) {
      filteredResults = [];
    }
    
    res.json({
      relevant: validation.relevant,
      confidence: validation.confidence,
      reason: validation.reason,
      filteredResults: filteredResults,
      originalCount: results.length,
      filteredCount: filteredResults.length
    });
    
  } catch (error) {
    console.error('❌ Error validando relevancia:', error.message);
    // Fail-safe: asumir relevantes
    res.json({ 
      relevant: true, 
      confidence: 0.5, 
      reason: 'Error en validación, mostrando resultados',
      filteredResults: results,
      originalCount: results.length,
      filteredCount: results.length
    });
  }
});

// ============================================
// 🎯 CLASIFICACIÓN INTELIGENTE DE TIPO DE PREGUNTA
// ============================================
app.post('/api/ai/classify-question-type', async (req, res) => {
  const { question } = req.body;
  
  if (!question || question.trim().length === 0) {
    return res.json({ 
      questionType: 'unknown',
      confidence: 0,
      reason: 'Pregunta vacía'
    });
  }
  
  try {
    console.log(`🎯 Clasificando pregunta: "${question}"`);
    
    const classificationPrompt = `Eres un experto clasificador de preguntas sobre Oracle Utilities (C2M, MDM, Field, Sales, Service).

**TU TAREA:** Clasifica esta pregunta del usuario en una de estas categorías:

**Pregunta del usuario:** "${question}"

**CATEGORÍAS:**

1. **"learning"** - Preguntas conceptuales, de aprendizaje, definiciones:
   - Ejemplos: "qué es un NIU?", "qué significa IMD?", "define service point", "explica el módulo D1", "para qué sirve MDM?"
   - Buscar en: C2M Guide (documentación oficial) + SharePoint (documentos internos)

2. **"incident"** - Errores, problemas técnicos, troubleshooting:
   - Ejemplos: "tengo error VEE_VRSL", "no carga la pantalla de medición", "falla al crear orden", "problema con validación", "error al facturar"
   - Buscar en: Confluence FAQs (casos de incidentes) + Excel OaaS (casos históricos)

3. **"procedural"** - Cómo hacer algo, tutoriales paso a paso:
   - Ejemplos: "cómo crear un service point?", "cómo configurar tarifas?", "pasos para cargar lecturas", "procedimiento para validar datos"
   - Buscar en: C2M Guide + SharePoint (guías y manuales)

**RESPONDE EN JSON:**
{
  "questionType": "learning|incident|procedural",
  "confidence": 0.0-1.0,
  "reason": "breve explicación de por qué clasificaste así",
  "suggestedSources": ["C2M Guide", "SharePoint", "Confluence", "OaaS Excel"]
}

**IMPORTANTE:**
- Si detectas palabras como "error", "falla", "problema", "no funciona" → probablemente "incident"
- Si detectas "qué es", "qué significa", "define", "explica" → probablemente "learning"
- Si detectas "cómo", "pasos", "procedimiento", "configurar" → probablemente "procedural"
- Usa tu inteligencia, NO te bases solo en palabras clave
- Confidence alto (>0.8) si estás seguro, bajo (<0.5) si es ambiguo`;

    const result = await aiService.askClaudeSimple(classificationPrompt);
    
    // Parsear respuesta
    let classification;
    try {
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      classification = JSON.parse(jsonMatch ? jsonMatch[0] : result);
    } catch (error) {
      console.error('⚠️ Error parseando clasificación:', result);
      // Fail-safe: asumir learning
      classification = { 
        questionType: 'learning', 
        confidence: 0.5, 
        reason: 'No se pudo clasificar, asumiendo pregunta de aprendizaje',
        suggestedSources: ['C2M Guide', 'SharePoint']
      };
    }
    
    console.log(`✅ Clasificación: ${classification.questionType.toUpperCase()} (${(classification.confidence * 100).toFixed(0)}%)`);
    console.log(`   Razón: ${classification.reason}`);
    console.log(`   Fuentes sugeridas: ${classification.suggestedSources.join(', ')}`);
    
    res.json({
      questionType: classification.questionType,
      confidence: classification.confidence,
      reason: classification.reason,
      suggestedSources: classification.suggestedSources || []
    });
    
  } catch (error) {
    console.error('❌ Error clasificando pregunta:', error.message);
    // Fail-safe: asumir learning
    res.json({ 
      questionType: 'learning',
      confidence: 0.5,
      reason: 'Error en clasificación, asumiendo pregunta de aprendizaje',
      suggestedSources: ['C2M Guide', 'SharePoint']
    });
  }
});

// ============================================
// 🧠 VALIDACIÓN INTELIGENTE DE SCOPE (Claude)
// ============================================
app.post('/api/ai/validate-scope', async (req, res) => {
  const { question } = req.body;
  
  if (!question || question.trim().length === 0) {
    return res.json({ isValid: false, reason: 'Pregunta vacía' });
  }
  
  console.log('\n🧠 Validando scope con Claude:', question);
  
  try {
    // Usar Claude para determinar si la pregunta es relevante
    const validationPrompt = `Eres un filtro inteligente para un chatbot de Oracle C2M (Customer to Meter).

**TU TAREA:** Determinar si esta pregunta es relevante al dominio.

**DOMINIO VÁLIDO (Oracle C2M y ecosystem):**
- Oracle Utilities (C2M, CCB, MDM, FIELD, SALES, SERVICE)
- Sistemas de medición y facturación (billing, invoicing)
- Gestión de clientes, contratos, medidores, dispositivos
- Configuración, parametrización, troubleshooting de C2M
- Instalación de dispositivos, lectura de medidores
- Estructuras de datos (NIU, POD, SPID, Service Points, Premises)
- Procesos de negocio de utilities (billing, ciclos, rutas)
- **Facturación electrónica, reportes fiscales (DIAN, autoridades tributarias)**
- **Integraciones con sistemas externos (contabilidad, ERP, bancos)**
- **Archivos XML, formatos de intercambio, validaciones fiscales**
- **Procesos regulatorios y compliance de utilities**
- Casos de soporte OaaS históricos
- Documentación técnica y entrenamientos
- Consultas sobre funcionalidad, configuración, errores
- Análisis de datos, reportes, Excel relacionados con utilities

**FUERA DE DOMINIO (no relacionado con utilities/Oracle):**
- Preguntas personales sobre el bot (edad, nombre, sentimientos)
- Clima, deportes, entretenimiento, noticias generales
- Matemáticas/estadística no relacionadas con utilities
- Política, religión, celebridades
- Programación general no relacionada con C2M/Oracle
- Temas completamente no relacionados con utilities o tecnología

**IMPORTANTE:**
- Preguntas de definición cortas ("qué es NIU?", "qué significa POD?") son VÁLIDAS
- Términos técnicos de C2M pueden no estar en inglés (medidor=meter, dispositivo=device)
- Consultas vagas pero dentro del dominio son VÁLIDAS ("cómo crear un medidor")
- Preguntas sobre análisis de datos/Excel relacionados con C2M son VÁLIDAS

**PREGUNTA DEL USUARIO:**
"${question}"

**Responde SOLO con un JSON:**
{
  "isValid": true/false,
  "confidence": 0.0-1.0,
  "reason": "breve explicación"
}

Ejemplos:
- "qué es NIU?" → {"isValid": true, "confidence": 1.0, "reason": "Pregunta sobre término técnico de C2M"}
- "cómo crear un medidor" → {"isValid": true, "confidence": 1.0, "reason": "Consulta sobre funcionalidad core de C2M"}
- "qué hora es" → {"isValid": false, "confidence": 1.0, "reason": "Pregunta no relacionada con C2M"}
- "clima mañana" → {"isValid": false, "confidence": 1.0, "reason": "Fuera del dominio de utilities"}`;

    const result = await aiService.askClaudeSimple(validationPrompt);
    
    // Parsear respuesta JSON de Claude
    let validation;
    try {
      // Intentar extraer JSON si viene con texto adicional
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        validation = JSON.parse(jsonMatch[0]);
      } else {
        validation = JSON.parse(result);
      }
    } catch (parseError) {
      console.error('⚠️ Error parseando respuesta de Claude:', result);
      // Si falla el parsing, asumir válido (fail-safe)
      validation = { isValid: true, confidence: 0.5, reason: 'No se pudo validar, permitiendo pregunta' };
    }
    
    console.log(`✅ Validación: ${validation.isValid ? '✓ VÁLIDA' : '✗ FUERA DE SCOPE'}`);
    console.log(`   Confianza: ${(validation.confidence * 100).toFixed(0)}%`);
    console.log(`   Razón: ${validation.reason}`);
    
    res.json(validation);
    
  } catch (error) {
    console.error('❌ Error en validación de scope:', error.message);
    // Fail-safe: si hay error, permitir la pregunta
    res.json({ 
      isValid: true, 
      confidence: 0.5, 
      reason: 'Error en validación, permitiendo pregunta por seguridad' 
    });
  }
});

// ============================================
// 🧠 CLASIFICACIÓN INTELIGENTE DE INTENCIÓN (GROQ - Rápido)
// ============================================
app.post('/api/ai/classify-intent', async (req, res) => {
  const { userText, conversationHistory, context } = req.body;
  
  if (!userText || userText.trim().length === 0) {
    return res.json({ 
      intentType: 'UNKNOWN',
      system: null,
      repository: 'DIRECT_ANSWER',
      confidence: 0,
      keywords: [],
      needsMoreInfo: false
    });
  }
  
  try {
    console.log(`🧠 Clasificando intención: "${userText}"`);
    
    // 🔥 DETECCIÓN DE PREGUNTAS DE SEGUIMIENTO
    // Si hay historial reciente y la pregunta es corta/sin contexto propio,
    // es probablemente una pregunta de seguimiento sobre el tema previo
    let isFollowUpQuestion = false;
    let previousTopic = '';
    
    if (conversationHistory && conversationHistory.length > 0) {
      const lastMessages = conversationHistory.slice(-4);
      const hasRecentContext = lastMessages.length >= 2;
      
      // Detectar si la pregunta actual es genérica/sin contexto propio
      // Patrones tolerantes a errores de digitación y tildes opcionales
      const genericFollowUpPatterns = [
        // Imperativos comunes (con/sin tildes, con/sin signos)
        /^¿?(mu[eé]strame|dame|quiero|necesito|puedes|podr[ií]as|expl[ií]came?|cu[eé]ntame)\s+(un\s+)?(ejemplo|m[aá]s|detalles?|informaci[oó]n|info)\??$/i,
        
        // Cómo/Como con variaciones
        /^¿?c[oó]mo\s+(funciona|se\s+hace|se\s+usa|es|lo\s+hago|puedo|seria)\??$/i,
        
        // Qué/Que + más/otra/otro
        /^¿?qu[eé]\s+(m[aá]s|otra|otro|sigue|mas)\??$/i,
        
        // Confirmaciones y continuación
        /^(s[ií]|ok|vale|bien|claro|adelante|contin[uú]a?|sigue|siguiente)\??$/i,
        
        // Palabra única común
        /^¿?(ejemplo|ejemplos|m[aá]s|info|detalles?)\??$/i,
        
        // Más + sustantivo
        /^¿?m[aá]s\s+(detalles?|informaci[oó]n|info|datos?|ejemplos?)\??$/i,
        
        // Preguntas cortas de seguimiento
        /^¿?(y\s+eso|y\s+eso\s+qu[eé]|por\s+qu[eé]|cuando|cu[aá]ndo|donde|d[oó]nde)\??$/i,
        
        // Variaciones de "explica/amplía"
        /^¿?(expl[ií]came?|ampl[ií]a|desarrolla|detalla|profundiza)\s*(eso|esto|m[aá]s)?\??$/i
      ];
      
      const isGeneric = genericFollowUpPatterns.some(pattern => pattern.test(userText.trim()));
      
      if (hasRecentContext && isGeneric) {
        isFollowUpQuestion = true;
        // Extraer el tema del mensaje previo del asistente
        const lastAssistantMsg = [...lastMessages].reverse().find(m => m.role === 'assistant');
        if (lastAssistantMsg) {
          previousTopic = lastAssistantMsg.content.substring(0, 200);
          console.log('🔄 Pregunta de seguimiento detectada sobre:', previousTopic.substring(0, 50) + '...');
        }
      }
    }
    
    // Si es pregunta de seguimiento, clasificar como QUESTION/HOW_TO automáticamente
    if (isFollowUpQuestion) {
      console.log('✅ Clasificación automática: QUESTION (pregunta de seguimiento)');
      return res.json({
        intentType: 'QUESTION',
        system: context?.previousSystem || null,
        repository: 'CONFLUENCE',
        confidence: 0.9,
        keywords: [],
        needsMoreInfo: false,
        isFollowUp: true,
        previousTopic: previousTopic
      });
    }
    
    const classificationPrompt = `Eres un clasificador de intenciones experto para un sistema de soporte técnico de Oracle Utilities.

**PREGUNTA DEL USUARIO:** "${userText}"

**TU TAREA:** Analiza la intención del usuario y responde SOLO con un objeto JSON (sin markdown, sin explicaciones adicionales):

{
  "intentType": "TROUBLESHOOTING|HOW_TO|ADVISORY|DATA_ANALYSIS|CREATE_TICKET|GREETING|SIMPLE_RESPONSE|QUESTION",
  "system": "C2M|FIELD|SALES|SERVICE|null",
  "repository": "CONFLUENCE|EXCEL_KB|DATA_ANALYTICS|JIRA|DIRECT_ANSWER",
  "confidence": 0.0-1.0,
  "keywords": ["palabra1", "palabra2"],
  "needsMoreInfo": false
}

**CATEGORÍAS:**

- **TROUBLESHOOTING**: Tiene un error/problema/falla. Buscar en EXCEL_KB (casos históricos)
  Ejemplos: "tengo un error", "no funciona", "me sale error", "problema con"

- **HOW_TO**: Pregunta cómo hacer algo (procedimiento). Buscar en CONFLUENCE (tutoriales, guías)
  Ejemplos: "cómo crear", "cómo configurar", "pasos para", "procedimiento"

- **QUESTION**: Pregunta de conocimiento general/conceptual con "?" o "¿". Buscar en CONFLUENCE + PDF ORACLE
  Ejemplos: "¿qué es?", "¿para qué sirve?", "¿qué significa?", "define", "explica"
  ⚠️ IMPORTANTE: Preguntas tipo "¿Qué es X?" se buscan PRIMERO en PDF de Oracle (documentación oficial), luego en Confluence

- **ADVISORY**: Quiere aprender/asesoría general. Buscar en CONFLUENCE (documentación)
  Ejemplos: "quiero aprender", "necesito asesoría", "explícame", "tutorial"

- **DATA_ANALYSIS**: Consulta estadística/analítica. Buscar en DATA_ANALYTICS (Excel con IA)
  Ejemplos: "cuántos casos", "estadísticas", "ranking", "promedio", "tendencia"

- **CREATE_TICKET**: Quiere crear ticket explícitamente. Usar JIRA
  Ejemplos: "crear ticket", "abrir caso", "reportar incidencia"

- **GREETING**: Saludo simple. Usar DIRECT_ANSWER
  Ejemplos: "hola", "buenos días", "qué tal"

- **SIMPLE_RESPONSE**: Respuesta simple. Usar DIRECT_ANSWER
  Ejemplos: "gracias", "ok", "sí", "no"

**DETECCIÓN DE SISTEMA:**
- Si menciona "C2M", "customer to meter", "medidor" → C2M
- Si menciona "FIELD", "campo", "orden de trabajo" → FIELD  
- Si menciona "SALES", "ventas" → SALES
- Si menciona "SERVICE", "servicio" → SERVICE
- Si no menciona ninguno → null

**⚠️ TOLERANCIA A ERRORES ORTOGRÁFICOS:**
- Considera variaciones con/sin tildes: que/qué, como/cómo, mas/más, si/sí, este/esté
- Tolera signos de interrogación faltantes: "como funciona" = "¿cómo funciona?"
- Considera errores de ortografía comunes: "muestra" en vez de "muéstrame", "esplica" en vez de "explica"
- Ignora mayúsculas/minúsculas inconsistentes
- Si el significado es claro a pesar de errores, clasifica según la INTENCIÓN, no la ortografía

**CONFIDENCE:**
- >0.8: Muy seguro (palabras clave claras)
- 0.5-0.8: Medianamente seguro (contexto indica)
- <0.5: Incierto (ambiguo, necesita más info)

**KEYWORDS:** Extrae 2-4 palabras técnicas clave mencionadas

RESPONDE SOLO EL JSON, SIN MARKDOWN:`;

    // Usar GROQ LLaMA 3 para clasificación rápida
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Eres un clasificador de intenciones preciso. Respondes SOLO con JSON válido, sin markdown.' },
        { role: 'user', content: classificationPrompt }
      ],
      temperature: 0.1,
      max_tokens: 300
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = groqResponse.data.choices[0].message.content.trim();
    console.log('🤖 GROQ respuesta cruda:', result);
    
    // Parsear respuesta (limpiar markdown si viene)
    let classification;
    try {
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      classification = JSON.parse(cleanedResult);
    } catch (error) {
      console.error('⚠️ Error parseando clasificación JSON:', result);
      // Fallback básico
      return res.json({ 
        intentType: 'QUESTION',
        system: null,
        repository: 'CONFLUENCE',
        confidence: 0.5,
        keywords: [],
        needsMoreInfo: false
      });
    }
    
    console.log(`✅ Clasificación: ${classification.intentType} (${(classification.confidence * 100).toFixed(0)}%)`);
    console.log(`   Sistema: ${classification.system || 'No detectado'}`);
    console.log(`   Repositorio: ${classification.repository}`);
    console.log(`   Keywords: ${classification.keywords.join(', ')}`);
    
    res.json({
      intentType: classification.intentType,
      system: classification.system,
      repository: classification.repository,
      confidence: classification.confidence || 0.5,
      keywords: classification.keywords || [],
      needsMoreInfo: classification.needsMoreInfo || false,
      suggestedQuestion: classification.suggestedQuestion || null
    });
    
  } catch (error) {
    console.error('❌ Error en clasificación IA:', error.message);
    // Fallback seguro
    res.json({ 
      intentType: 'QUESTION',
      system: null,
      repository: 'CONFLUENCE',
      confidence: 0.5,
      keywords: [],
      needsMoreInfo: false
    });
  }
});

// ============================================
// 📄 BÚSQUEDA EN PDF DE ORACLE (C2M USER GUIDE)
// ============================================
app.post('/api/pdf/search', async (req, res) => {
  const { query, translate = true, conversationHistory = [] } = req.body;
  
  if (!query || query.trim().length === 0) {
    return res.json({ 
      success: false, 
      error: 'Query vacío',
      sections: []
    });
  }
  
  try {
    console.log(`📄 Buscando en PDF de Oracle: "${query}"`);
    if (conversationHistory && conversationHistory.length > 0) {
      console.log(`💭 Con historial de ${conversationHistory.length} mensajes`);
    }
    
    const pdfPath = path.join(__dirname, 'data', 'C2M_Business_User_Guide_v2_8_0_0.pdf');
    
    if (!fs.existsSync(pdfPath)) {
      console.error('❌ PDF no encontrado:', pdfPath);
      return res.json({ 
        success: false, 
        error: 'PDF de Oracle no disponible en el servidor',
        sections: []
      });
    }
    
    // Leer y parsear PDF
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);
    const fullText = pdfData.text;
    
    console.log(`📖 PDF cargado: ${pdfData.numpages} páginas, ${fullText.length} caracteres`);
    
    // ==========================================
    // EXPANDIR QUERY SI ES PREGUNTA DE SEGUIMIENTO
    // ==========================================
    let expandedQuery = query;
    const queryLower = query.toLowerCase();
    
    // Detectar si es pregunta de seguimiento
    const followUpPatterns = [
      /^(muestra|muestrame|dame|dime|enseña|enséñame|explica|explicame|detalla|detallame)(\s+)(un\s+)?(ejemplo|ejemplos|caso|casos|detalles|mas|más)/i,
      /^(como|cómo)(\s+)(funciona|hago|se\s+hace|trabajo|opera)/i,
      /^(que|qué)(\s+)(es|significa|quiere\s+decir|pasa)/i,
      /^(por\s*que|por\s*qué|porque)/i,
      /^(y\s+)?si\s+(tengo|hay|existe)/i,
      /^(puedo|puedes|podría|se\s+puede)/i,
      /^(donde|dónde|cuando|cuándo|quien|quién)/i,
      /^(otro|otra|otros|otras|adicional|más)/i
    ];
    
    const isFollowUp = followUpPatterns.some(pattern => pattern.test(queryLower));
    
    if (isFollowUp && conversationHistory.length > 0) {
      // Obtener el contexto del último mensaje del usuario
      const lastUserMsg = [...conversationHistory]
        .reverse()
        .find(msg => msg.role === 'user');
      
      if (lastUserMsg) {
        expandedQuery = `${lastUserMsg.content} - ${query}`;
        console.log(`🔄 Pregunta de seguimiento detectada. Query expandida: "${expandedQuery}"`);
      }
    }
    
    // Dividir en secciones (por capítulos o párrafos grandes)
    const sections = splitPDFIntoSections(fullText);
    console.log(`✂️ Texto dividido en ${sections.length} secciones`);
    
    // Buscar secciones relevantes con IA usando la query expandida
    const relevantSections = await findRelevantSectionsWithAI(expandedQuery, sections);
    console.log(`✅ Encontradas ${relevantSections.length} secciones relevantes`);
    
    // Si no hay secciones relevantes, devolver error para que no se muestre como éxito
    if (relevantSections.length === 0) {
      console.log('⚠️ No se encontraron secciones relevantes en el PDF para esta query');
      return res.json({
        success: false,
        query: query,
        expandedQuery: expandedQuery !== query ? expandedQuery : undefined,
        error: 'No se encontraron secciones relevantes en el PDF',
        sectionsFound: 0
      });
    }
    
    // Traducir y mejorar respuesta si es necesario
    if (translate && relevantSections.length > 0) {
      console.log('🌐 Traduciendo y sintetizando respuesta con contexto...');
      const translatedResponse = await translateAndSynthesizeWithAI(
        query, 
        relevantSections, 
        conversationHistory // ✅ Pasar historial para contexto completo
      );
      
      // ✅ Si la traducción falló, devolver error en lugar de mostrar mensaje de error
      if (translatedResponse.answer && translatedResponse.answer.startsWith('Error al traducir:')) {
        console.log('⚠️ Traducción falló, devolviendo error para priorizar Confluence');
        return res.json({
          success: false,
          query: query,
          expandedQuery: expandedQuery !== query ? expandedQuery : undefined,
          error: translatedResponse.answer,
          sectionsFound: relevantSections.length,
          // Incluir secciones para referencia pero marcarlo como fallido
          originalSections: relevantSections.map(s => ({
            page: s.page,
            content: s.content.substring(0, 300) + '...',
            relevance: s.relevance
          }))
        });
      }
      
      return res.json({
        success: true,
        query: query,
        expandedQuery: expandedQuery !== query ? expandedQuery : undefined,
        sectionsFound: relevantSections.length,
        response: translatedResponse.answer,
        sourcePages: relevantSections.map(s => s.page),
        originalSections: relevantSections.map(s => ({
          page: s.page,
          content: s.content.substring(0, 300) + '...',
          relevance: s.relevance
        }))
      });
    }
    
    res.json({
      success: true,
      query: query,
      sectionsFound: relevantSections.length,
      sections: relevantSections
    });
    
  } catch (error) {
    console.error('❌ Error en búsqueda PDF:', error.message);
    res.json({ 
      success: false, 
      error: error.message,
      sections: []
    });
  }
});

/**
 * Divide el texto del PDF en secciones manejables
 */
function splitPDFIntoSections(text) {
  // Dividir por capítulos (números como "1.", "2.", "3." al inicio de línea)
  // O por secciones grandes de ~1000 palabras
  
  const chapterRegex = /^(\d+\.|\d+\s+[A-Z])/gm;
  const parts = text.split(chapterRegex);
  
  const sections = [];
  let currentPage = 1;
  
  for (let i = 0; i < parts.length; i += 2) {
    const header = parts[i] || '';
    const content = parts[i + 1] || '';
    
    if (content.trim().length > 100) {
      // Estimar número de página (aprox. 500 palabras por página)
      const wordCount = content.split(/\s+/).length;
      const estimatedPages = Math.ceil(wordCount / 500);
      
      sections.push({
        page: currentPage,
        header: header.trim().substring(0, 100),
        content: content.trim(),
        wordCount: wordCount
      });
      
      currentPage += estimatedPages;
    }
  }
  
  // Si no se encontraron capítulos, dividir por bloques de ~1000 palabras
  if (sections.length === 0) {
    const words = text.split(/\s+/);
    const chunkSize = 1000;
    
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      sections.push({
        page: Math.floor(i / 500) + 1,
        header: `Página ${Math.floor(i / 500) + 1}`,
        content: chunk,
        wordCount: chunk.split(/\s+/).length
      });
    }
  }
  
  return sections;
}

/**
 * Encuentra secciones relevantes usando IA con análisis semántico real
 * MEJORADO: Usa Entity Recognition para búsqueda más precisa
 */
async function findRelevantSectionsWithAI(query, sections) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!GROQ_API_KEY && !ANTHROPIC_API_KEY) {
    console.warn('⚠️ No AI API key configured, usando búsqueda simple');
    return simpleKeywordSearch(query, sections);
  }
  
  try {
    // 🧠 NUEVO: Análisis NLP + Entity Recognition
    console.log('🧠 Análisis NLP de consulta...');
    const nlpAnalysis = nlpService.analyzeQuery(query);
    
    // Extraer entidades para mejorar búsqueda
    const entities = nlpAnalysis.entities;
    const enhancedKeywords = [...nlpAnalysis.keywords];
    
    // Agregar entidades extraídas como keywords adicionales
    if (entities.businessObjects.length > 0) {
      console.log('  📦 BOs detectados:', entities.businessObjects.join(', '));
      enhancedKeywords.push(...entities.businessObjects);
    }
    if (entities.errorCodes.length > 0) {
      console.log('  ⚠️ Errores detectados:', entities.errorCodes.join(', '));
      enhancedKeywords.push(...entities.errorCodes);
    }
    if (entities.systems.length > 0) {
      console.log('  🖥️ Sistemas detectados:', entities.systems.join(', '));
      enhancedKeywords.push(...entities.systems);
    }
    if (entities.tables.length > 0) {
      console.log('  🗄️ Tablas detectadas:', entities.tables.join(', '));
      enhancedKeywords.push(...entities.tables);
    }
    
    // Crear query mejorada con entidades
    const enhancedQuery = [query, ...enhancedKeywords].join(' ');
    
    // Primera etapa: Hacer búsqueda inicial amplia para reducir candidatos
    console.log(`🔍 Etapa 1: Búsqueda inicial amplia en ${sections.length} secciones`);
    const initialCandidates = simpleKeywordSearch(enhancedQuery, sections, 10); // Top 10
    
    if (initialCandidates.length === 0) {
      console.log('⚠️ No se encontraron candidatos iniciales');
      return [];
    }
    
    console.log(`📋 Encontrados ${initialCandidates.length} candidatos iniciales`);
    
    // Segunda etapa: Análisis semántico con IA para identificar la sección correcta
    console.log('🤖 Etapa 2: Análisis semántico con IA');
    
    // Preparar las secciones para el análisis
    const sectionsText = initialCandidates.map((s, idx) => 
      `[SECCIÓN ${idx + 1}] (Página ${s.page})\n${s.content.substring(0, 1200)}...`
    ).join('\n\n---\n\n');
    
    const semanticPrompt = `Eres un experto en Oracle Utilities C2M. Analiza estas ${initialCandidates.length} secciones de documentación y determina CUÁLes responden ESPECÍFICAMENTE a la pregunta del usuario.

PREGUNTA DEL USUARIO: "${query}"

SECCIONES CANDIDATAS:
${sectionsText}

TAREA:
1. Lee y COMPRENDE semánticamente cada sección
2. Identifica cuál(es) sección(es) responden ESPECÍFICAMENTE a la pregunta
3. Si la pregunta es sobre un nombre técnico/BO/regla específica, identifica la sección que menciona ESE nombre específico

Responde en JSON con el índice de las secciones relevantes (1-based) ordenadas por relevancia:
{
  "relevant_sections": [1, 3],
  "reasoning": "Breve explicación de por qué estas secciones son relevantes"
}

Si NINGUNA sección es relevante, responde: {"relevant_sections": [], "reasoning": "explicación"}`;

    let result;
    
    if (GROQ_API_KEY) {
      const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: 'Eres un experto en Oracle Utilities C2M que analiza documentación técnica. Respondes solo JSON.' 
          },
          { role: 'user', content: semanticPrompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      }, {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      const resultText = groqResponse.data.choices[0].message.content.trim();
      const cleaned = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
      
    } else if (ANTHROPIC_API_KEY) {
      const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        temperature: 0.1,
        messages: [{ role: 'user', content: semanticPrompt }]
      }, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      
      const resultText = claudeResponse.data.content[0].text.trim();
      const cleaned = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    }
    
    console.log('🎯 Análisis semántico:', result.reasoning);
    
    if (!result.relevant_sections || result.relevant_sections.length === 0) {
      console.log('⚠️ IA no encontró secciones relevantes');
      return initialCandidates.slice(0, 3); // Fallback a top 3 iniciales
    }
    
    // Mapear índices a secciones reales
    const finalSections = result.relevant_sections
      .map(idx => initialCandidates[idx - 1])
      .filter(s => s !== undefined);
    
    console.log(`✅ IA seleccionó ${finalSections.length} secciones como relevantes`);
    
    return finalSections;
    
  } catch (error) {
    console.error('⚠️ Error en análisis semántico con IA:', error.message);
    return simpleKeywordSearch(query, sections);
  }
}

/**
 * Búsqueda simple por keywords (fallback y etapa inicial)
 */
function simpleKeywordSearch(query, sections, maxResults = 3) {
  // Filtrar stopwords comunes en español e inglés
  const stopwords = ['muestrame', 'dame', 'dime', 'explica', 'como', 'que', 'cual', 'ejemplo', 'show', 'give', 'tell', 'example', 'llama', 'nombre'];
  const words = query.toLowerCase().split(/\s+/);
  const keywords = words.filter(w => w.length > 3 && !stopwords.includes(w));
  
  console.log('🔍 Búsqueda simple con keywords:', keywords.join(', '));
  
  const relevantSections = [];
  
  for (const section of sections) {
    let score = 0;
    const contentLower = section.content.toLowerCase();
    
    for (const keyword of keywords) {
      const occurrences = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
      if (occurrences > 0) {
        score += occurrences * 5;
      }
    }
    
    if (score > 0) {
      relevantSections.push({ ...section, relevance: score });
    }
  }
  
  relevantSections.sort((a, b) => b.relevance - a.relevance);
  const topResults = relevantSections.slice(0, maxResults);
  
  console.log(`✅ Búsqueda simple encontró ${topResults.length} secciones (de ${relevantSections.length} candidatas)`);
  
  return topResults;
}

/**
 * Valida que los nombres técnicos en la respuesta no sean inventados
 * Detecta patrones sospechosos que indican nombres incorrectos  
 * MEJORADO: Usa Entity Recognition para validar
 */
function validateTechnicalNames(answer, originalQuery = '') {
  // 🧠 NUEVO: Extraer entidades de la respuesta
  const responseEntities = nlpService.recognizeEntities(answer);
  
  const suspiciousPatterns = [
    // Nombres completamente en mayúsculas con guiones bajos (no es estilo Oracle MDM)
    /\b[A-Z][A-Z_]{10,}\b/g,  // Ej: PREVEE_BO_DATA_AREA
    
    // Sufijos típicos de nombres inventados
    /_BO\b/gi,
    /_DATA_AREA\b/gi,
    /_RULE\b/gi,
    /_ESTIMATION\b/gi,
    /_VALIDATION\b/gi,
    
    // Nombres genéricos en inglés que no deberían aparecer
    /\bEnergyAccumulationEstimation\b/gi,
    /\bValidationByPeaks\b/gi,
    /\bEstimationByAccumulation\b/gi,
    /\bVEE_ESTIMATION_RULE\b/gi,
    /\bPREVEE_\w+/gi,
    
    // CM con guion bajo (INCORRECTO - debe ser CM- con guion)
    /\bCM_[A-Z_]+\b/g,  // Ej: CM_ESTM_ENERGY_HIST (incorrecto, debe ser CM-EstimEnergiaHistPMPConSaldo)
    
    // Abreviaciones en inglés dentro de nombres (típico de nombres inventados)
    /_ESTM_/gi,   // ESTM como abreviación de "estimation"
    /_ENERGY_/gi, // ENERGY en lugar de "Energia"
    /_HIST\b/gi,  // HIST como abreviación de "historic"
    /_ACCUM_/gi   // ACCUM como abreviación de "accumulation"
  ];
  
  let hasSuspiciousNames = false;
  let warnings = [];
  
  // Validar patrones sospechosos
  for (const pattern of suspiciousPatterns) {
    const matches = answer.match(pattern);
    if (matches && matches.length > 0) {
      hasSuspiciousNames = true;
      warnings.push(`Nombre sospechoso detectado: ${matches.join(', ')}`);
    }
  }
  
  // 🧠 NUEVO: Validar BOs extraídos
  if (responseEntities.businessObjects.length > 0) {
    console.log('  ✅ BOs encontrados en respuesta:', responseEntities.businessObjects.join(', '));
    
    // Verificar que los BOs tengan formato correcto (CM- con guion)
    for (const bo of responseEntities.businessObjects) {
      if (!bo.startsWith('CM-')) {
        warnings.push(`BO con formato incorrecto: ${bo} (debe empezar con CM-)`);
        hasSuspiciousNames = true;
      }
    }
  }
  
  // 🧠 NUEVO: Validar códigos de error extraídos
  if (responseEntities.errorCodes.length > 0) {
    console.log('  ✅ Errores encontrados en respuesta:', responseEntities.errorCodes.join(', '));
  }
  
  // 🧠 NUEVO: Validar tablas extraídas
  if (responseEntities.tables.length > 0) {
    console.log('  ✅ Tablas encontradas en respuesta:', responseEntities.tables.join(', '));
  }
  
  if (hasSuspiciousNames) {
    console.warn('⚠️ ADVERTENCIA: Se detectaron nombres técnicos potencialmente incorrectos');
    warnings.forEach(w => console.warn(`   - ${w}`));
    
    // Agregar advertencia visible al final de la respuesta
    answer += '\n\n⚠️ <em><strong>Advertencia del sistema:</strong> Esta respuesta puede contener nombres técnicos que requieren verificación. Por favor, confirma los nombres exactos en la documentación oficial antes de usar.</em>';
  }
  
  return answer;
}

/**
 * Extrae nombres de reglas VEE (CM-...) desde texto técnico.
 * Caso clave: "Esta estimación implica la creación de una nueva regla de VEE (CM-XXXX)"
 */
function extractVeeRuleNamesFromSections(sections = []) {
  const found = new Set();
  const patterns = [
    /regla\s+de\s+VEE\s*\((CM-[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)\)/gi,
    /\((CM-[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)\)\s*denominada/gi,
    /\b(CM-[A-Za-z0-9ÁÉÍÓÚáéíóúÑñ]+)\b/g
  ];

  for (const section of sections) {
    const content = section?.content || '';
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          found.add(match[1].trim());
        }
      }
    }
  }

  return Array.from(found);
}

/**
 * Traduce y sintetiza la respuesta con IA
 */
async function translateAndSynthesizeWithAI(query, sections, conversationHistory = []) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  
  if (!GROQ_API_KEY && !ANTHROPIC_API_KEY) {
    return {
      answer: 'PDF encontrado pero traducción no disponible (se requiere API key)',
      sections: sections
    };
  }
  
  try {
    const combinedContent = sections.map(s => 
      `[Página ${s.page}]\n${s.content.substring(0, 1500)}`
    ).join('\n\n---\n\n');

    // Primero verificar si pregunta por FUNCIONAMIENTO (excluir de extracción de nombre)
    const asksForFunctionality = /\b(c[oó]mo\s+(funciona|trabaja|opera|se\s+aplica|se\s+ejecuta|se\s+utiliza))\b/i.test(query);
    
    // Regla determinística: si preguntan ESPECÍFICAMENTE por nombre de BO/regla, inferir desde "regla de VEE (CM-...)"
    const asksForTechnicalName = /\b((c[oó]mo\s+se\s+llama|cu[aá]l\s+es\s+el\s+nombre|nombre\s+del).*(bo|business\s*object|regla)|nombre.*bo|bo\s+de\s+la\s+regla)\b/i.test(query);
    
    if (asksForTechnicalName && !asksForFunctionality) {
      const extractedRuleNames = extractVeeRuleNamesFromSections(sections);
      if (extractedRuleNames.length > 0) {
        const primaryName = extractedRuleNames[0];
        return {
          answer: `Basado en la documentación técnica que tengo disponible, el nombre del Business Object es **${primaryName}**.`,
          sourcePages: sections.map(s => s.page)
        };
      }
    }
    
    // Construir contexto de conversación si existe
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = '\n\n**CONTEXTO DE LA CONVERSACIÓN PREVIA:**\n';
      conversationHistory.slice(-4).forEach(msg => {
        const role = msg.role === 'user' ? 'Usuario' : 'Asistente';
        conversationContext += `${role}: ${msg.content}\n`;
      });
      conversationContext += '\n*(Usa este contexto para entender mejor la pregunta actual del usuario)*\n';
    }
    
    const translationPrompt = `Eres un experto en Oracle Utilities C2M. Un usuario preguntó:
${conversationContext}
**PREGUNTA ACTUAL (Español):** "${query}"

**INFORMACIÓN DEL PDF OFICIAL DE ORACLE (puede estar en Inglés o Español):**
${combinedContent}

**REGLAS CRÍTICAS - MÁXIMA PRIORIDAD:**
⚠️ FIDELIDAD ABSOLUTA AL DOCUMENTO:
1. NUNCA inventes nombres técnicos, códigos, o identificadores
2. Copia EXACTAMENTE nombres de:
   - Business Objects (ej: "CM-EstimAcumGolpeEnergia", "CM-EstimEnergiaHistPMPConSaldo")
   - Reglas VEE (siempre empiezan con "CM-" en Oracle MDM)
   - Campos de base de datos (ej: "CI_SP_CHAR", "D1_IMD_TYPE")
   - Códigos de configuración
   - IDs de algoritmos
3. Si el documento tiene un nombre específico, úsalo TAL CUAL aparece
4. Si NO encuentras el nombre exacto en el documento, di claramente: "El documento no especifica el nombre exacto de..."
5. NUNCA traduzcas nombres propios de objetos técnicos al inglés si están en español en el documento
6. NUNCA uses nombres genéricos inventados como "PREVEE_BO_DATA_AREA", "EnergyAccumulationEstimation", etc.

🚨 **SEÑALES DE ALERTA - SI VES ESTO EN TU RESPUESTA, ESTÁ MAL:**
- Nombres en MAYÚSCULAS tipo "PREVEE_BO_DATA_AREA", "VEE_ESTIMATION_RULE"
- Nombres en inglés que suenan genéricos como "EnergyAccumulationEstimation"
- Nombres con guiones bajos "_BO_", "_DATA_AREA", "_RULE" al final
- Cualquier nombre que NO aparezca textualmente en el documento

✅ **PATRONES CORRECTOS EN ORACLE MDM:**
- Reglas VEE en español: "CM-EstimAcumGolpeEnergia", "CM-ValidacionPicos"
- Reglas con formato: "CM-[Nombre descriptivo en español]"
- Campos de BD con prefijo: "CI_", "D1_", "CC_"

**TU TAREA:**
1. Busca en el documento la sección que habla sobre la regla o objeto mencionado
2. Copia el nombre EXACTAMENTE como aparece (con guiones, mayúsculas/minúsculas, etc.)
3. Si hay contexto previo, úsalo para entender qué buscar
4. Responde en ESPAÑOL de forma natural
5. Si el documento dice "Esta estimación requiere la creación de una regla (CM-NombreEjemplo)", 
   entonces el nombre es EXACTAMENTE "CM-NombreEjemplo"
6. Sé claro, preciso y profesional
7. Si el usuario pide un ejemplo, proporciónalo del documento si existe
8. **MUY IMPORTANTE: NO agregues citas de fuentes tipo "(Fuente: ...)" o "página X" - el sistema ya maneja eso automáticamente**
9. Si el texto dice: "Esta estimación implica la creación de una nueva regla de VEE (CM-XXXXX)", interpreta que el nombre técnico a reportar es EXACTAMENTE el valor entre paréntesis
10. Aunque no diga explícitamente "el BO es", cuando esté el patrón "regla de VEE (CM-...)" usa ese identificador como nombre técnico de referencia

**📊 DIAGRAMAS Y FLUJOS (MUY IMPORTANTE):**
- Si el usuario pide "flujo", "diagrama", "flowchart", "dibuja", "crea un flujo", "muestra el proceso", DEBES generar un diagrama Mermaid
- Usa bloques de código Mermaid: \`\`\`mermaid ... \`\`\`
- Para flujos de procesos usa: flowchart TD (Top-Down) o flowchart LR (Left-Right)
- Ejemplo de flujo básico:
\`\`\`mermaid
flowchart TD
    A[Inicio del Proceso] --> B{¿Se cumple condición?}
    B -->|Sí| C[Ejecutar Acción 1]
    B -->|No| D[Ejecutar Acción 2]
    C --> E[Generar Resultado]
    D --> E
    E --> F[Fin]
\`\`\`
- Asegúrate de que el diagrama sea claro, técnicamente correcto y refleje la información del documento

**EJEMPLOS DE FIDELIDAD:**
❌ MAL: "El Business Object se llama PREVEE_BO_DATA_AREA"
✅ BIEN: "La regla de VEE se llama CM-EstimEnergiaHistPMPConSaldo"

❌ MAL: "El Business Object se llama EnergyAccumulationEstimation"
✅ BIEN: "La regla de VEE se llama CM-EstimAcumGolpeEnergia"

❌ MAL: "Se llama CM_ESTM_ENERGY_HIST" (guion bajo incorrecto + abreviaciones en inglés)
✅ BIEN: "Se llama CM-EstimEnergiaHistPMPConSaldo" (guion correcto + nombres completos en español)

❌ MAL: "La regla ValidationByPeaks se usa para..."
✅ BIEN: "La regla CM-ValidacionPicos se usa para..."

❌ MAL: "Se configura en el campo METER_ID"
✅ BIEN: "Se configura en el campo CI_SP_CHAR"

**FORMATO DE RESPUESTA:**
[Explicación clara en español con el nombre técnico EXACTO copiado del documento. Si no encuentras el nombre textual en el documento, di "El documento no menciona el nombre específico de este objeto"]`;

    let answer;
    
    // ==========================================
    // PRIORIDAD 1: GROQ (más rápido y barato)
    // ==========================================
    if (GROQ_API_KEY) {
      console.log('🚀 Usando GROQ para traducción...');
      const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.3-70b-versatile',
        messages: [
          { 
            role: 'system', 
            content: `Eres un consultor experto en Oracle Utilities C2M con acceso a documentación técnica oficial.

REGLAS CRÍTICAS DE FIDELIDAD:
- NUNCA inventes nombres de Business Objects, reglas VEE, campos, o códigos
- Copia EXACTAMENTE los nombres técnicos como aparecen en el documento
- Si el documento dice "CM-EstimAcumGolpeEnergia", NO lo conviertas a "EnergyAccumulationEstimation"
- Si no encuentras un nombre específico, di claramente que no está en el documento
- Prioriza exactitud sobre fluidez cuando se trate de nombres técnicos
- Responde siempre en español pero mantén nombres propios técnicos sin traducir
- NO agregues citas de fuentes como "(Fuente: ...)" o "página X" - el sistema las maneja automáticamente

📊 DIAGRAMAS Y FLUJOS:
- Si se pide "flujo", "diagrama", "flowchart", "dibuja", genera un diagrama Mermaid con \`\`\`mermaid ... \`\`\`` 
          },
          { role: 'user', content: translationPrompt }
        ],
        temperature: 0.1,  // Más bajo para mayor precisión
        max_tokens: 1500
      }, {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      answer = groqResponse.data.choices[0].message.content.trim();
      
    // ==========================================
    // FALLBACK: CLAUDE (si Groq no disponible)
    // ==========================================
    } else if (ANTHROPIC_API_KEY) {
      console.log('🤖 Usando Claude para traducción y síntesis');
      console.log('📡 Endpoint: https://api.anthropic.com/v1/messages');
      console.log('🔑 API Key presente:', ANTHROPIC_API_KEY ? 'SÍ' : 'NO');
      
      const systemPrompt = `Eres un experto en Oracle Utilities C2M con acceso a documentación técnica oficial.

REGLAS CRÍTICAS DE FIDELIDAD:
- NUNCA inventes nombres de Business Objects, reglas VEE, campos, o códigos
- Copia EXACTAMENTE los nombres técnicos como aparecen en el documento  
- Si el documento dice "CM-EstimAcumGolpeEnergia", NO lo conviertas a "EnergyAccumulationEstimation"
- Si no encuentras un nombre específico, di claramente que no está en el documento
- Prioriza exactitud sobre fluidez cuando se trate de nombres técnicos
- Responde siempre en español pero mantén nombres propios técnicos sin traducir
- NO agregues citas de fuentes como "(Fuente: ...)" o "página X" - el sistema las maneja automáticamente

📊 DIAGRAMAS Y FLUJOS:
- Si se pide "flujo", "diagrama", "flowchart", "dibuja", genera un diagrama Mermaid con \`\`\`mermaid ... \`\`\``;
      
      const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-3-5-sonnet-20241022',  // Modelo actualizado a la versión más reciente
        max_tokens: 2000,
        temperature: 0.1,  // Más bajo para mayor precisión
        system: systemPrompt,
        messages: [
          { 
            role: 'user', 
            content: translationPrompt
          }
        ]
      }, {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        }
      });
      
      answer = claudeResponse.data.content[0].text.trim();
    }
    
    // ==========================================
    // VALIDAR NOMBRES TÉCNICOS ANTES DE RETORNAR
    // ==========================================
    answer = validateTechnicalNames(answer);
    
    // ==========================================
    // LIMPIAR REFERENCIAS A FUENTES (innecesarias en la respuesta)
    // ==========================================
    // Eliminar patrones como "(Fuente: ...)", "página X", etc.
    answer = answer
      // Eliminar bloques completos de referencias a fuentes
      .replace(/\(Fuente:[^)]*\)/gi, '')  // (Fuente: ...)
      .replace(/\(Source:[^)]*\)/gi, '')  // (Source: ...)
      .replace(/\(según\s+el\s+PDF[^)]*\)/gi, '') // (según el PDF...)
      // Eliminar referencias a páginas sueltas
      .replace(/,?\s*página\s+\w+/gi, '')  // página X (cualquier palabra, no solo números)
      .replace(/,?\s*page\s+\w+/gi, '')   // page X
      .replace(/,?\s*pág\.\s*\w+/gi, '')  // pág. X
      .replace(/,?\s*p\.\s*\w+/gi, '')    // p. X
      // Limpiar espacios y puntuación redundante
      .replace(/\s+\./g, '.')    // Espacios antes de puntos
      .replace(/\.\s*\./g, '.')  // Puntos dobles
      .replace(/\s{2,}/g, ' ')   // Espacios dobles
      .replace(/\s+,/g, ',')     // Espacios antes de comas
      .trim();
    
    console.log('🧹 Respuesta limpiada de referencias a fuentes');
    
    return {
      answer: answer,
      sourcePages: sections.map(s => s.page)
    };
    
  } catch (error) {
    console.error('❌ Error en traducción:', error.message);
    if (error.response) {
      console.error('📄 Status:', error.response.status);
      console.error('📄 Data:', JSON.stringify(error.response.data, null, 2));
      console.error('📄 Headers:', error.response.headers);
    } else if (error.request) {
      console.error('📡 No response received:', error.request);
    } else {
      console.error('⚠️ Error config:', error.message);
    }
    return {
      answer: `Error al traducir: ${error.message}`,
      sections: sections
    };
  }
}

// ============================================
// ENDPOINT: BÚSQUEDA EN PDFs TÉCNICOS DE VEE
// ============================================
/**
 * Busca en PDFs técnicos específicos de Validación y Estimación
 * Se usa cuando hay preguntas sobre reglas específicas de VEE
 */
app.post('/api/pdf/search-vee-technical', async (req, res) => {
  const { query, translate = true, conversationHistory = [], pdfType: requestedPdfType } = req.body;
  
  if (!query || query.trim().length === 0) {
    return res.json({ 
      success: false, 
      error: 'Query vacío',
      sections: []
    });
  }
  
  try {
    console.log(`📄 Buscando en PDFs técnicos de VEE: "${query}"`);
    if (requestedPdfType) {
      console.log(`🎯 Tipo de PDF solicitado desde frontend: ${requestedPdfType}`);
    }
    
    const queryLower = query.toLowerCase();
    
    // Determinar qué PDF usar basado en el parámetro enviado o en la pregunta
    let pdfPath;
    let pdfType;
    
    // Prioridad 1: Usar el tipo solicitado desde el frontend si está presente
    if (requestedPdfType === 'VALIDACIÓN' || requestedPdfType === 'VALIDACION') {
      pdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_04 Realización de validaciones básicas sobre la medida bruta.pdf');
      pdfType = 'VALIDACIONES';
      console.log('🔍 Tipo VALIDACIÓN especificado - Usando PDF técnico de validaciones');
    } else if (requestedPdfType === 'ESTIMACIÓN' || requestedPdfType === 'ESTIMACION') {
      pdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_05 Análisis del conjunto de estimaciones.pdf');
      pdfType = 'ESTIMACIONES';
      console.log('🔍 Tipo ESTIMACIÓN especificado - Usando PDF técnico de estimaciones');
    } else if (requestedPdfType === 'AMBOS') {
      pdfType = 'AMBOS';
      console.log('🔍 Tipo AMBOS especificado - Buscando en ambos PDFs técnicos');
    }
    // Prioridad 2: Auto-detectar desde la query si no se especificó
    else if (/validaci[oó]n|validación|validate|validation|validar/i.test(query)) {
      pdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_04 Realización de validaciones básicas sobre la medida bruta.pdf');
      pdfType = 'VALIDACIONES';
      console.log('🔍 Detectada pregunta sobre VALIDACIONES - Usando PDF técnico de validaciones');
    } else if (/estimaci[oó]n|estimación|estimate|estimation|estimar/i.test(query)) {
      pdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_05 Análisis del conjunto de estimaciones.pdf');
      pdfType = 'ESTIMACIONES';
      console.log('🔍 Detectada pregunta sobre ESTIMACIONES - Usando PDF técnico de estimaciones');
    } else {
      // Si no es clara, usar ambos PDFs
      console.log('🔍 Tipo de pregunta no específica - Buscando en ambos PDFs técnicos');
      pdfType = 'AMBOS';
    }
    
    let allSections = [];
    
    // Si es AMBOS, buscar en ambos PDFs
    if (pdfType === 'AMBOS') {
      const validationPdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_04 Realización de validaciones básicas sobre la medida bruta.pdf');
      const estimationPdfPath = path.join(__dirname, 'data', 'E340 MDM_TRA_05 Análisis del conjunto de estimaciones.pdf');
      
      if (fs.existsSync(validationPdfPath)) {
        const dataBuffer = fs.readFileSync(validationPdfPath);
        const pdfData = await pdfParse(dataBuffer);
        const sections = splitPDFIntoSections(pdfData.text);
        sections.forEach(s => s.source = 'Validaciones');
        allSections = allSections.concat(sections);
        console.log(`📖 PDF Validaciones: ${sections.length} secciones`);
      }
      
      if (fs.existsSync(estimationPdfPath)) {
        const dataBuffer = fs.readFileSync(estimationPdfPath);
        const pdfData = await pdfParse(dataBuffer);
        const sections = splitPDFIntoSections(pdfData.text);
        sections.forEach(s => s.source = 'Estimaciones');
        allSections = allSections.concat(sections);
        console.log(`📖 PDF Estimaciones: ${sections.length} secciones`);
      }
    } else {
      // Usar PDF específico
      if (!fs.existsSync(pdfPath)) {
        console.error('❌ PDF no encontrado:', pdfPath);
        return res.json({ 
          success: false, 
          error: 'PDF técnico no disponible en el servidor',
          sections: []
        });
      }
      
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(dataBuffer);
      const fullText = pdfData.text;
      
      console.log(`📖 PDF cargado: ${pdfData.numpages} páginas, ${fullText.length} caracteres`);
      
      allSections = splitPDFIntoSections(fullText);
      allSections.forEach(s => s.source = pdfType);
    }
    
    console.log(`✂️ Total: ${allSections.length} secciones para buscar`);
    
    // Expandir query si es pregunta de seguimiento
    let expandedQuery = query;
    const followUpPatterns = [
      /^(muestra|muestrame|dame|dime|enseña|enséñame|explica|explicame|detalla|detallame)(\s+)(un\s+)?(ejemplo|ejemplos|caso|casos|detalles|mas|más)/i,
      /^(como|cómo)(\s+)(funciona|hago|se\s+hace|trabajo|opera)/i,
      /^(que|qué)(\s+)(es|significa|quiere\s+decir|pasa)/i,
      /^(por\s*que|por\s*qué|porque)/i
    ];
    
    const isFollowUp = followUpPatterns.some(pattern => pattern.test(queryLower));
    
    if (isFollowUp && conversationHistory.length > 0) {
      const lastUserMsg = [...conversationHistory]
        .reverse()
        .find(msg => msg.role === 'user');
      
      if (lastUserMsg) {
        expandedQuery = `${lastUserMsg.content} - ${query}`;
        console.log(`🔄 Query expandida: "${expandedQuery}"`);
      }
    }
    
    // Buscar secciones relevantes con IA
    const relevantSections = await findRelevantSectionsWithAI(expandedQuery, allSections);
    console.log(`✅ Encontradas ${relevantSections.length} secciones relevantes`);
    
    if (relevantSections.length === 0) {
      console.log('⚠️ No se encontraron secciones relevantes en los PDFs técnicos');
      return res.json({
        success: false,
        query: query,
        expandedQuery: expandedQuery !== query ? expandedQuery : undefined,
        error: 'No se encontraron secciones relevantes en los PDFs técnicos',
        sectionsFound: 0
      });
    }
    
    // Traducir y sintetizar respuesta
    if (translate && relevantSections.length > 0) {
      console.log('🌐 Traduciendo y sintetizando respuesta con contexto técnico...');
      const translatedResponse = await translateAndSynthesizeWithAI(
        query, 
        relevantSections, 
        conversationHistory
      );
      
      if (translatedResponse.answer && translatedResponse.answer.startsWith('Error al traducir:')) {
        console.log('⚠️ Traducción falló');
        return res.json({
          success: false,
          query: query,
          error: translatedResponse.answer,
          sectionsFound: relevantSections.length
        });
      }
      
      return res.json({
        success: true,
        query: query,
        expandedQuery: expandedQuery !== query ? expandedQuery : undefined,
        sectionsFound: relevantSections.length,
        response: translatedResponse.answer,
        sourceType: pdfType,
        sourcePages: relevantSections.map(s => s.page),
        sources: relevantSections.map(s => s.source),
        originalSections: relevantSections.map(s => ({
          page: s.page,
          source: s.source,
          content: s.content.substring(0, 300) + '...',
          relevance: s.relevance
        }))
      });
    }
    
    res.json({
      success: true,
      query: query,
      sectionsFound: relevantSections.length,
      sections: relevantSections,
      sourceType: pdfType
    });
    
  } catch (error) {
    console.error('❌ Error en búsqueda PDFs técnicos VEE:', error.message);
    res.json({ 
      success: false, 
      error: error.message,
      sections: []
    });
  }
});

// ============================================
//  NUEVO: ENDPOINT MULTI-IA (Claude + GPT-4 + Gemini)
// ============================================
app.post('/api/ai/multi-ai-response', async (req, res) => {
  const { query, conversationHistory, searchResults, context, image } = req.body;
  
  console.log('\n🤖 SISTEMA MULTI-IA ACTIVADO');
  console.log('📝 Query:', query);
  console.log('📚 Resultados disponibles:', searchResults?.confluenceResults?.length || 0, 'FAQs');
  if (image) {
    console.log('👁️ Imagen detectada - Modo Vision activado');
  }
  
  try {
    // Llamar al orquestador multi-IA (con imagen e historial si están disponibles)
    const result = await multiAI.askMultiAI(query, searchResults, image, conversationHistory);
    const finalResponse = (result?.synthesis?.finalResponse || '').trim();
    const synthesisMethod = result?.synthesis?.method || 'unknown';
    const hasSynthesisError = synthesisMethod === 'error' || finalResponse.startsWith('❌');
    
    console.log('\n✅ Sistema Multi-IA completado');
    console.log('📊 IAs usadas:', result.metadata.aisUsed.join(', ').toUpperCase());
    console.log('🎯 Método:', result.synthesis.method);
    if (image) {
      console.log('👁️ Análisis de imagen completado');
    }
    
    res.json({
      success: !hasSynthesisError,
      conversationalResponse: finalResponse,
      multiAI: {
        questionType: result.questionType,
        aisUsed: result.metadata.aisUsed,
        synthesisMethod: synthesisMethod,
        primaryAI: result.synthesis.primaryAI || 'claude',
        sourcesUsed: result.synthesis.sourcesUsed || [],
        hadVision: !!image
      },
      error: hasSynthesisError ? (result?.synthesis?.error || 'No se pudo generar respuesta con IA') : null,
      hasDetails: searchResults && (
        (searchResults.confluenceResults && searchResults.confluenceResults.length > 0) ||
        (searchResults.excelResults && searchResults.excelResults.length > 0) ||
        (searchResults.c2mGuideResults && searchResults.c2mGuideResults.length > 0)
      )
    });
    
  } catch (error) {
    console.error('❌ Error en sistema Multi-IA:', error.message);
    res.status(500).json({ 
      error: error.message,
      success: false
    });
  }
});

app.listen(PORT, '0.0.0.0', async ()=>{
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`\n📱 Local access:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`\n🌐 Network access (share with others):`);
  console.log(`   http://10.75.240.137:${PORT}`);
  console.log(`   http://192.168.10.7:${PORT}`);
  console.log(`\n👥 Others on your network can access using the network URLs above`);
  
  // Mostrar estado de IA
  if (aiService.isAIEnabled()) {
    console.log(`\n🤖 Claude AI: ✅ ACTIVADO`);
  } else {
    console.log(`\n🤖 Claude AI: ⚠️ DESACTIVADO (configure ANTHROPIC_API_KEY en .env)`);
  }
  
  // Cargar guía de C2M
  console.log(`\n📚 Cargando documentación...`);
  const c2mLoaded = await c2mGuide.loadC2MGuide();
  if (c2mLoaded) {
    const stats = c2mGuide.getStats();
    console.log(`   ✅ C2M Business User Guide (${stats.numPages} páginas, ${stats.numSections} secciones)`);
  } else {
    console.log(`   ⚠️ C2M Business User Guide no disponible`);
  }
  
  console.log('');
});
