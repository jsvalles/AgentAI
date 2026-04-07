// ============================================
// SHAREPOINT SERVICE - Microsoft Graph API con OAuth 2.0
// ============================================
// Servicio para buscar documentación en SharePoint usando Graph API con Azure AD

const { Client } = require('@microsoft/microsoft-graph-client');
const { ClientSecretCredential } = require('@azure/identity');
require('isomorphic-fetch');

class SharePointOAuthService {
  constructor() {
    this.tenantId = process.env.AZURE_TENANT_ID;
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.siteName = process.env.SHAREPOINT_SITE_NAME || 'root';
    this.tenant = process.env.SHAREPOINT_TENANT || 'redclay';
    this.siteUrl = `https://${this.tenant}.sharepoint.com`;
    
    this.client = null;
    this.siteId = null;
  }

  // Verificar si SharePoint OAuth está configurado
  isConfigured() {
    const configured = !!(this.tenantId && this.clientId && this.clientSecret);
    if (configured) {
      console.log('✅ SharePoint OAuth Service: Configurado correctamente');
      console.log(`   Tenant: ${this.tenant}`);
      console.log(`   Site: ${this.siteName}`);
    } else {
      console.log('⚠️ SharePoint OAuth Service: No configurado');
      if (!this.tenantId) console.log('   ❌ Falta: AZURE_TENANT_ID');
      if (!this.clientId) console.log('   ❌ Falta: AZURE_CLIENT_ID');
      if (!this.clientSecret) console.log('   ❌ Falta: AZURE_CLIENT_SECRET');
    }
    return configured;
  }

  // Inicializar cliente de Graph API
  async initializeClient() {
    if (this.client) return this.client;

    if (!this.isConfigured()) {
      throw new Error('SharePoint OAuth no está configurado');
    }

    try {
      // Crear credencial con Client Secret
      const credential = new ClientSecretCredential(
        this.tenantId,
        this.clientId,
        this.clientSecret
      );

      // Crear cliente de Graph API
      this.client = Client.initWithMiddleware({
        authProvider: {
          getAccessToken: async () => {
            const token = await credential.getToken('https://graph.microsoft.com/.default');
            return token.token;
          }
        }
      });

      console.log('✅ Cliente de Microsoft Graph inicializado');
      return this.client;
    } catch (error) {
      console.error('❌ Error inicializando Graph Client:', error.message);
      throw error;
    }
  }

  // Obtener ID del sitio de SharePoint
  async getSiteId() {
    if (this.siteId) return this.siteId;

    try {
      const client = await this.initializeClient();
      
      // Obtener el sitio raíz o un sitio específico
      let site;
      if (this.siteName === 'root') {
        site = await client.api(`/sites/${this.tenant}.sharepoint.com:/`).get();
      } else {
        site = await client.api(`/sites/${this.tenant}.sharepoint.com:/sites/${this.siteName}`).get();
      }
      
      this.siteId = site.id;
      console.log(`✅ Site ID obtenido: ${this.siteId}`);
      return this.siteId;
    } catch (error) {
      console.error('❌ Error obteniendo Site ID:', error.message);
      throw error;
    }
  }

  // Buscar en SharePoint usando Graph API
  async search(query, options = {}) {
    if (!this.isConfigured()) {
      return { success: true, results: [], message: 'SharePoint OAuth no configurado' };
    }

    try {
      console.log(`🔍 Buscando en SharePoint con Graph API: "${query}"`);
      
      const client = await this.initializeClient();
      const maxResults = options.maxResults || 10;

      // Buscar usando Microsoft Search API (Graph API Search)
      const searchRequest = {
        requests: [
          {
            entityTypes: ['driveItem', 'listItem'],
            query: {
              queryString: query
            },
            from: 0,
            size: maxResults
          }
        ]
      };

      const searchResponse = await client
        .api('/search/query')
        .post(searchRequest);

      if (!searchResponse.value || searchResponse.value.length === 0) {
        console.log('ℹ️ No se encontraron resultados en SharePoint');
        return { success: true, results: [], count: 0 };
      }

      const hitsContainer = searchResponse.value[0].hitsContainers;
      
      if (!hitsContainer || hitsContainer.length === 0 || !hitsContainer[0].hits) {
        console.log('ℹ️ No se encontraron resultados en SharePoint');
        return { success: true, results: [], count: 0 };
      }

      const hits = hitsContainer[0].hits;

      // Procesar resultados
      const results = hits.map(hit => {
        const resource = hit.resource;
        const fileName = resource.name || 'Sin título';
        const fileExtension = this.getFileExtension(fileName);

        return {
          title: fileName,
          webUrl: resource.webUrl,
          lastModified: resource.lastModifiedDateTime,
          summary: hit.summary || resource.name || '',
          contentType: this.getContentTypeFromExtension(fileExtension),
          icon: this.getFileIcon(fileName),
          source: 'SharePoint (Graph API)',
          driveId: resource.parentReference?.driveId,
          itemId: resource.id
        };
      });

      console.log(`✅ Encontrados ${results.length} resultados en SharePoint`);
      
      return {
        success: true,
        results: results,
        count: results.length
      };

    } catch (error) {
      console.error('❌ Error buscando en SharePoint con Graph API:', error.message);
      
      // Si es error de autenticación, dar más detalles
      if (error.message.includes('Invalid tenant') || error.message.includes('AADSTS')) {
        console.error('💡 Verifica que AZURE_TENANT_ID, AZURE_CLIENT_ID y AZURE_CLIENT_SECRET sean correctos');
        console.error('💡 Asegúrate de que la app tenga permisos: Sites.Read.All, Files.Read.All');
      }
      
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
      return { success: true, results: [], message: 'SharePoint OAuth no configurado' };
    }

    try {
      console.log(`🔍 Búsqueda Oracle C2M en SharePoint: "${query}"`);
      
      // Agregar términos relacionados a Oracle C2M
      const enhancedQuery = `${query} (Oracle OR C2M OR "Oracle Utilities" OR medición OR facturación OR billing OR meter)`;
      
      return await this.search(enhancedQuery, { maxResults: 15 });

    } catch (error) {
      console.error('❌ Error en búsqueda Oracle C2M:', error.message);
      return {
        success: false,
        results: [],
        error: error.message
      };
    }
  }

  // Obtener contenido de un archivo específico
  async getFileContent(driveId, itemId) {
    try {
      const client = await this.initializeClient();
      
      // Descargar contenido del archivo
      const content = await client
        .api(`/drives/${driveId}/items/${itemId}/content`)
        .get();
      
      return content;
    } catch (error) {
      console.error('❌ Error obteniendo contenido del archivo:', error.message);
      throw error;
    }
  }

  // Obtener extensión del archivo
  getFileExtension(fileName) {
    if (!fileName) return '';
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
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

  // Obtener icono según el tipo de archivo
  getFileIcon(fileName) {
    if (!fileName) return '📄';
    const extension = this.getFileExtension(fileName);
    
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
}

// Exportar instancia única (singleton)
module.exports = new SharePointOAuthService();
