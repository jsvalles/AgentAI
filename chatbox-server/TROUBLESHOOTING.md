# Troubleshooting - Error "Failed to fetch"

## Diagnóstico Rápido

### 1. Verificar que el backend esté corriendo

```bash
# En la carpeta chatbox-server, verifica que el servidor esté activo:
# Debes ver algo como: "Chatbox backend listening on http://localhost:3000"

# Si no está corriendo, ejecuta:
npm start
```

### 2. Verificar configuración de Confluence

Abre en el navegador: `http://localhost:3000/api/debug/config`

Verás algo como:
```json
{
  "confluence_base": "configured",
  "confluence_space": "KMCELSIA",
  "confluence_auth": "configured",
  "jira_base": "configured",
  "jira_auth": "configured",
  "email_configured": "yes"
}
```

Si ves `"NOT SET"`, significa que las variables de entorno no están configuradas.

### 3. Verificar archivo `.env`

Asegúrate que exista el archivo `.env` en la carpeta `chatbox-server/` con:

```
CONFLUENCE_BASE=https://redclay.atlassian.net/wiki
CONFLUENCE_SPACE=KMCELSIA
CONFLUENCE_EMAIL=tu-email@redclay.com
CONFLUENCE_TOKEN=tu-token-api-aqui
```

**Para obtener el token API:**
1. Ve a: https://redclay.atlassian.net/manage/api-tokens
2. Crea un nuevo token
3. Cópialo y pégalo en `.env` como `CONFLUENCE_TOKEN`

### 4. Verificar credenciales de Confluence

Prueba en terminal (Windows PowerShell):

```powershell
$email = "johan.valles@redclay.com"
$token = "ATATT3xFfGF09h1EkuvkxXfgPD75s1_GjQWTBgKPeeFeDv2GJvNpQMHiqjZ4tCWOJ7txt7NRE0cUo-8lOol1HDU3_iW7J_zxIbwfsYR-9wTpWdDaDBrOvDd8wJxZL3slKZZj4vYwL3fx5MShwcWVx4PcrVqcKoH0cwuDLRnkXG_g8T4cSas3UAo=EC864526"
$pair = "$email`:$token"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$base64 = [System.Convert]::ToBase64String($bytes)
$headers = @{ Authorization = "Basic $base64" }

$response = Invoke-WebRequest -Uri "https://redclay.atlassian.net/wiki/rest/api/content/search?cql=type=page&limit=1" -Headers $headers
$response.StatusCode
```

Si obtienes `200`, las credenciales son correctas.

### 5. Verificar logs del backend

Cuando reinicies el backend y hagas una búsqueda en el chat:

```bash
npm start
# Verás logs como:
# Searching Confluence: https://redclay.atlassian.net/wiki, CQL: type=page AND space="KMCELSIA" ...
# Found 2 results
```

Si ves errores, cópialos y revisa qué dice exactamente.

## Errores Comunes

### ❌ `confluence_auth: "NOT SET"`
- **Causa:** Variables de entorno no configuradas
- **Solución:** Copia `.env.example` a `.env` y completa los valores

### ❌ `401 Unauthorized`
- **Causa:** Email o token incorrectos
- **Solución:** Verifica credenciales en https://redclay.atlassian.net/manage/api-tokens

### ❌ `404 Not Found`
- **Causa:** El espacio KMCELSIA no existe o está mal escrito
- **Solución:** Ve a https://redclay.atlassian.net/wiki/spaces/ y verifica el nombre exacto

### ❌ `Failed to fetch` (desde el chat)
- **Causa:** El backend no está corriendo o hay error CORS
- **Solución:** 
  1. Verifica `http://localhost:3000/health` en el navegador
  2. Reinicia el backend con `npm start`
  3. Comprueba que el chat hace requests a `http://localhost:3000` (no a otra URL)

## Pasos de Solución

1. **Reinicia el backend:**
   ```bash
   # Detén con Ctrl+C y ejecuta:
   npm start
   ```

2. **Limpia caché del navegador:**
   - Presiona `F12` → Consola
   - Abre DevTools (F12) → Network para ver requests

3. **Verifica el endpoint de debug:**
   - Abre: `http://localhost:3000/api/debug/config`
   - Todos los valores deben estar en `configured`

4. **Prueba manualmente desde el chat:**
   - Abre [chatbox/index.html](../chatbox/index.html)
   - Reporta incidencia → C2M → Actividades de campo
   - Ingresa un error como "conexión perdida"
   - Mira la consola del navegador (F12) para ver qué endpoint se llama

5. **Revisa logs del backend:**
   - En la terminal donde corre `npm start` verás logs detallados

¿Necesitas más ayuda? Comparte los logs del backend y la consola del navegador (F12).
