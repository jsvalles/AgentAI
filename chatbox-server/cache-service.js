// cache-service.js - Sistema de cache para optimizar APIs externas
const NodeCache = require('node-cache');

// Cache en memoria (para desarrollo/staging)
const memoryCache = new NodeCache({ 
    stdTTL: 600,           // 10 minutos por defecto
    checkperiod: 120,      // Limpia cada 2 minutos
    useClones: false       // Mejor performance
});

// Configuración de TTL por tipo de dato
const TTL_CONFIG = {
    confluence: 600,        // 10 minutos
    excel: 1800,           // 30 minutos
    jira: 300,             // 5 minutos
    ai_response: 3600      // 1 hora
};

// Estadísticas de cache
let stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0
};

/**
 * Obtener dato del cache
 * @param {string} key - Clave única
 * @returns {any} Valor cacheado o null
 */
function get(key) {
    const value = memoryCache.get(key);
    
    if (value !== undefined) {
        stats.hits++;
        console.log(`✅ Cache HIT: ${key}`);
        return value;
    }
    
    stats.misses++;
    console.log(`❌ Cache MISS: ${key}`);
    return null;
}

/**
 * Guardar dato en cache
 * @param {string} key - Clave única
 * @param {any} value - Valor a cachear
 * @param {number} ttl - Time to live en segundos (opcional)
 */
function set(key, value, ttl = null) {
    const success = memoryCache.set(key, value, ttl || 600);
    
    if (success) {
        stats.sets++;
        console.log(`💾 Cache SET: ${key} (TTL: ${ttl || 600}s)`);
    }
    
    return success;
}

/**
 * Eliminar dato del cache
 * @param {string} key - Clave a eliminar
 */
function del(key) {
    const count = memoryCache.del(key);
    
    if (count > 0) {
        stats.deletes++;
        console.log(`🗑️  Cache DELETE: ${key}`);
    }
    
    return count;
}

/**
 * Limpiar todo el cache
 */
function flush() {
    memoryCache.flushAll();
    console.log('🧹 Cache FLUSH: Todo limpio');
}

/**
 * Wrapper para Confluence con cache automático
 */
async function getConfluenceCached(fetchFunction, pageId) {
    const cacheKey = `confluence_${pageId}`;
    
    // Revisar cache
    let data = get(cacheKey);
    if (data) return data;
    
    // Llamar API
    console.log(`📞 Llamando Confluence API: ${pageId}`);
    data = await fetchFunction(pageId);
    
    // Guardar en cache
    set(cacheKey, data, TTL_CONFIG.confluence);
    
    return data;
}

/**
 * Wrapper para búsqueda Confluence con cache
 */
async function searchConfluenceCached(fetchFunction, query) {
    // Normalizar query para key consistente
    const normalizedQuery = query.toLowerCase().trim();
    const cacheKey = `confluence_search_${normalizedQuery}`;
    
    let data = get(cacheKey);
    if (data) return data;
    
    console.log(`📞 Buscando en Confluence: "${query}"`);
    data = await fetchFunction(query);
    
    set(cacheKey, data, TTL_CONFIG.confluence);
    
    return data;
}

/**
 * Wrapper para Excel con cache
 */
async function getExcelDataCached(fetchFunction) {
    const cacheKey = 'excel_data_all';
    
    let data = get(cacheKey);
    if (data) return data;
    
    console.log('📂 Cargando datos de Excel...');
    data = await fetchFunction();
    
    set(cacheKey, data, TTL_CONFIG.excel);
    
    return data;
}

/**
 * Wrapper para JIRA con cache
 */
async function getJiraCached(fetchFunction, caseId) {
    const cacheKey = `jira_${caseId}`;
    
    let data = get(cacheKey);
    if (data) return data;
    
    console.log(`📞 Llamando JIRA API: ${caseId}`);
    data = await fetchFunction(caseId);
    
    set(cacheKey, data, TTL_CONFIG.jira);
    
    return data;
}

/**
 * Wrapper para respuestas de IA con cache
 * IMPORTANTE: Solo cachear si la respuesta es determinista
 */
async function getAIResponseCached(fetchFunction, query, context) {
    // Crear hash del query + contexto
    const contextHash = JSON.stringify(context).substring(0, 50);
    const cacheKey = `ai_response_${query}_${contextHash}`;
    
    // Solo cachear si no hay contexto dinámico (es determinista)
    const isDeterministic = !context || Object.keys(context).length === 0;
    
    if (isDeterministic) {
        let data = get(cacheKey);
        if (data) {
            console.log('⚡ Respuesta IA desde cache (ahorro de tokens)');
            return data;
        }
    }
    
    console.log('🤖 Generando respuesta con Claude AI...');
    const data = await fetchFunction(query, context);
    
    // Cachear solo si es determinista
    if (isDeterministic) {
        set(cacheKey, data, TTL_CONFIG.ai_response);
    }
    
    return data;
}

/**
 * Obtener estadísticas del cache
 */
function getStats() {
    const keys = memoryCache.keys();
    const hitRate = stats.hits + stats.misses > 0 
        ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2)
        : 0;
    
    return {
        ...stats,
        hitRate: `${hitRate}%`,
        totalKeys: keys.length,
        memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024 // MB
    };
}

/**
 * Middleware Express para estadísticas
 */
function statsMiddleware(req, res, next) {
    req.cacheStats = getStats();
    next();
}

module.exports = {
    // Funciones básicas
    get,
    set,
    del,
    flush,
    
    // Wrappers específicos
    getConfluenceCached,
    searchConfluenceCached,
    getExcelDataCached,
    getJiraCached,
    getAIResponseCached,
    
    // Utilidades
    getStats,
    statsMiddleware,
    TTL_CONFIG
};
