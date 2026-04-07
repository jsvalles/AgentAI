# Configuración de Jira para Crear Tickets Automáticamente

## Descripción
Cuando un usuario hace una búsqueda en el chatbox, se crea automáticamente un ticket en Jira con:
- La búsqueda realizada
- El sistema y módulo donde ocurrió
- Los resultados encontrados (o si no hubo resultados)
- Timestamp

## Requisitos

### 1. Verificar que tienes un Proyecto en Jira
El endpoint crea tickets en el proyecto con clave `CD` (Celsia DevOps). 

✅ Ya existe y está configurado.

### 2. Verificar Permisos
El usuario con el que te autenticas (`JIRA_EMAIL` y `JIRA_TOKEN`) debe tener permiso para crear issues en el proyecto `CD`.

**Verifica en:**
1. Ve al proyecto CD: https://redclay.atlassian.net/jira/software/projects/CD
2. Clic en "Configuración del Proyecto"
3. Clic en "Permisos"
4. Verifica que tu email esté en un grupo que pueda crear issues

### 3. Configuración en `.env`
Asegúrate de que las siguientes variables estén configuradas:

```env
JIRA_BASE=https://redclay.atlassian.net
JIRA_EMAIL=tu-email@redclay.com
JIRA_TOKEN=tu-token-api
```

## Cómo obtener el Token de API

1. Ve a: https://redclay.atlassian.net/manage/api-tokens
2. Clic en "Crear token de API"
3. Nombre: "Chatbox"
4. Clic en "Crear"
5. Copia el token y pégalo en `JIRA_TOKEN=...` en `.env`

## Estructura del Ticket Creado

Cuando se crea un ticket, incluye:

- **Resumen:** `[Chatbox] Búsqueda: {query} - {sistema}`
- **Descripción:**
  ```
  Usuario buscó: "{query}"
  
  Sistema: {sistema}
  Módulo: {módulo}
  
  {Resultados encontrados o "No se encontraron resultados"}
  
  Timestamp: {fecha-hora}
  ```
- **Tipo:** Task
- **Prioridad:** Low
- **Proyecto:** CD (Celsia DevOps)

## Personalización

Si quieres cambiar el proyecto, tipo de issue o prioridad:

1. Edita [server.js](server.js) - busca el endpoint `/api/jira/create-ticket`
2. Modifica en la sección `fields`:

```javascript
const issueData = {
  fields: {
    project: { key: 'CD' },  // Cambiar proyecto (CD, CELITSM, etc)
    summary: `[Chatbox] Búsqueda: ${searchQuery} - ${sistema || 'General'}`,
    description: `...`,
    issuetype: { name: 'Task' },  // Cambiar tipo (Task, Bug, Story, etc)
    priority: { name: 'Low' }  // Cambiar prioridad (Low, Medium, High, Highest)
  }
};
```

## Debugging

### Ver tickets creados en Jira
https://redclay.atlassian.net/browse/CD

### Ver logs del backend
Cuando reinicies `npm start` y hagas una búsqueda, verás en la terminal:

```
Jira ticket created: CD-123
```

### Si no se crea el ticket
1. Verifica `/api/debug/config` - `jira_auth` debe estar en `configured`
2. Verifica que el proyecto `CD` existe
3. Verifica permisos en el proyecto CD
4. Revisa los logs del backend para mensajes de error

## Ejemplo de Ticket Generado

```
Proyecto: CD
Clave: CD-123
Resumen: [Chatbox] Búsqueda: error de conexión - C2M
Descripción:
  Usuario buscó: "error de conexión"
  
  Sistema: C2M
  Módulo: actividades_campo
  
  Encontrados 2 resultado(s):
  1. Reinicio de TPW
  2. Errores y Validaciones de GIS
  
  Timestamp: 15/1/2026 14:30:45
```

