// ============================================
// SHAREPOINT SERVICE - REST API con Basic Auth
// ============================================
// Servicio para buscar documentación en SharePoint usando REST API con App Password

require('isomorphic-fetch');

class SharePointService {
  constructor() {
    this.username = process.env.SHAREPOINT_USERNAME;
    this.password = process.env.SHAREPOINT_PASSWORD;
    this.tenant = process.env.SHAREPOINT_TENANT || 'redclay';
    this.siteUrl = process.env.SHAREPOINT_SITE_URL || `https://${this.tenant}.sharepoint.com`;
  }

  // Verificar si SharePoint está configurado
  isConfigured() {
    const configured = !!(this.username && this.password);
    if (configured) {
      console.log('✅ SharePoint Service: Configurado con usuario', this.username);
    } else {
      console.log('⚠️ SharePoint Service: No configurado (faltan credenciales)');
    }
    return configured;
  }

  // Crear headers de autenticación básica
  getAuthHeaders() {
    const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json;odata=nometadata',
      'Content-Type': 'application/json'
    };
  }

  // Buscar en SharePoint usando Search REST API
  async search(query, options = {}) {
    if (!this.isConfigured()) {
      return { success: true, results: [], message: 'SharePoint no configurado' };
    }

    try {
      console.log(`🔍 Buscando en SharePoint: "${query}"`);
      
      // Construir URL de búsqueda
      const maxResults = options.maxResults || 10;
      const searchUrl = `${this.siteUrl}/_api/search/query?querytext='${encodeURIComponent(query)}'&rowlimit=${maxResults}&selectproperties='Title,Path,LastModifiedTime,FileExtension,HitHighlightedSummary'`;

      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: this.getAuthHeaders()
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ Error en búsqueda de SharePoint:', error);
        return { success: false, results: [], error: error };
      }

      const data = await response.json();
      
      if (!data.PrimaryQueryResult || !data.PrimaryQueryResult.RelevantResults) {
        console.log('ℹ️ No se encontraron resultados en SharePoint');
        return { success: true, results: [], count: 0 };
      }

      const rows = data.PrimaryQueryResult.RelevantResults.Table.Rows;
      
      if (!rows || rows.length === 0) {
        console.log('ℹ️ No se encontraron resultados en SharePoint');
        return { success: true, results: [], count: 0 };
      }

      // Procesar resultados
      const results = rows.map(row => {
        const cells = {};
        row.Cells.forEach(cell => {
          cells[cell.Key] = cell.Value;
        });

        const fileName = cells.Title || this.getFileNameFromPath(cells.Path || '');
        const fileExtension = (cells.FileExtension || '').toLowerCase();

        return {
          title: fileName,
          webUrl: cells.Path,
          lastModified: cells.LastModifiedTime,
          summary: this.cleanHtmlSummary(cells.HitHighlightedSummary || ''),
          contentType: this.getContentTypeFromExtension(fileExtension),
          icon: this.getFileIcon(fileName),
          source: 'SharePoint'
        };
      });

      console.log(`✅ Encontrados ${results.length} resultados en SharePoint`);
      
      return {
        success: true,
        results: results,
        count: results.length
      };

    } catch (error) {
      console.error('❌ Error buscando en SharePoint:', error.message);
      return {
        success: false,
        results: [],
        error: error.message
      };
    }
  }

  // Buscar específicamente en sitios de Oracle C2M
  async searchOracleC2M(query) {
    if (!this.isConfigured()) {
      return { success: true, results: [], message: 'SharePoint no configurado' };
    }

    try {
      console.log(`🔍 Búsqueda Oracle C2M en SharePoint: "${query}"`);
      
      // Agregar términos relacionados a Oracle C2M
      const enhancedQuery = `${query} (Oracle OR C2M OR "Oracle Utilities" OR medición OR facturación OR billing OR meter)`;
      
      // Buscar con filtros de sitios específicos (si existen)
      const sitesFilter = '(site:OracleC2M OR site:Documentacion OR site:Training)';
      const fullQuery = `${enhancedQuery} ${sitesFilter}`;
      
      return await this.search(fullQuery, { maxResults: 15 });

    } catch (error) {
      console.error('❌ Error en búsqueda Oracle C2M:', error.message);
      return {
        success: false,
        results: [],
        error: error.message
      };
    }
  }

  // Obtener tipo de contenido desde la extensión del archivo
  getContentTypeFromExtension(extension) {
    const types = {
      'pdf': 'PDF',
      'docx': 'Word',
      'doc': 'Word',
      'xlsx': 'Excel',
      'xls': 'Excel',
      'pptx': 'PowerPoint',
      'ppt': 'PowerPoint',
      'txt': 'Texto',
      'md': 'Markdown',
      'csv': 'CSV'
    };
    return types[extension.toLowerCase()] || 'Documento';
  }

  // Obtener tipo de contenido desde el nombre del archivo
  getContentType(fileName) {
    if (!fileName) return 'Documento';
    const extension = fileName.split('.').pop().toLowerCase();
    return this.getContentTypeFromExtension(extension);
  }

  // Obtener icono según el tipo de archivo
  getFileIcon(fileName) {
    if (!fileName) return '📄';
    const extension = fileName.split('.').pop().toLowerCase();
    
    const icons = {
      'pdf': '📕',
      'docx': '📘',
      'doc': '📘',
      'xlsx': '📗',
      'xls': '📗',
      'pptx': '📙',
      'ppt': '📙',
      'txt': '📄',
      'md': '📝',
      'csv': '📊'
    };
    
    return icons[extension] || '📄';
  }

  // Extraer nombre de archivo de una ruta
  getFileNameFromPath(path) {
    if (!path) return 'Sin título';
    const parts = path.split('/');
    return parts[parts.length - 1] || 'Sin título';
  }

  // Limpiar HTML del resumen
  cleanHtmlSummary(html) {
    if (!html) return '';
    // Remover tags HTML pero mantener el texto
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }
}

// Exportar instancia única (singleton)
module.exports = new SharePointService();
