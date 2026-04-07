# 🔐 Guía de Configuración: SharePoint OAuth con Azure AD

## 📋 Resumen

Este sistema ahora usa **Microsoft Graph API con OAuth 2.0** para acceder a SharePoint. Es el método oficial y más seguro recomendado por Microsoft.

## ✅ Ventajas de OAuth vs Basic Auth

- ✅ **Método oficial de Microsoft** (Basic Auth está deprecado)
- ✅ **Más seguro** (no expone contraseñas directamente)
- ✅ **Permisos granulares** (control preciso de accesos)
- ✅ **No caduca** (los tokens se renuevan automáticamente)

---

## 🚀 Pasos para Configurar Azure AD

### **Paso 1: Acceder al Portal de Azure**

1. Ve a: **https://portal.azure.com**
2. Inicia sesión con tu cuenta de **johan.valles@redclay.com**
3. Si es la primera vez, puede pedirte permisos de administrador

---

### **Paso 2: Registrar la Aplicación**

1. **Busca "Azure Active Directory"** en la barra de búsqueda superior
2. En el menú izquierdo, selecciona **"App registrations"** (Registros de aplicaciones)
3. Haz clic en **"+ New registration"** (+ Nuevo registro)

#### Configuración del Registro:

- **Name**: `AI-Assistant-Agent` (o el nombre que prefieras)
- **Supported account types**: 
  - Selecciona: **"Accounts in this organizational directory only (Red Clay Consulting only - Single tenant)"**
- **Redirect URI**: 
  - Déjalo en blanco (no es necesario para aplicaciones de servidor)
- Haz clic en **"Register"**

---

### **Paso 3: Obtener Credenciales**

Una vez registrada la app, verás la página de "Overview":

#### 3.1. **Tenant ID y Client ID**

En la página de **Overview**, copia:

- **Directory (tenant) ID**: Este es tu `AZURE_TENANT_ID`
  - Ejemplo: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- **Application (client) ID**: Este es tu `AZURE_CLIENT_ID`
  - Ejemplo: `yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy`

#### 3.2. **Client Secret**

1. En el menú izquierdo, ve a **"Certificates & secrets"**
2. Haz clic en **"+ New client secret"**
3. **Description**: `AI-Assistant-Secret`
4. **Expires**: Selecciona **"24 months"** (o el período que prefieras)
5. Haz clic en **"Add"**
6. **¡IMPORTANTE!** Copia el **Value** inmediatamente (solo se muestra una vez)
   - Este es tu `AZURE_CLIENT_SECRET`
   - Si no lo copias ahora, tendrás que crear uno nuevo

---

### **Paso 4: Configurar Permisos**

1. En el menú izquierdo, ve a **"API permissions"**
2. Haz clic en **"+ Add a permission"**
3. Selecciona **"Microsoft Graph"**
4. Selecciona **"Application permissions"** (NO Delegated)

#### Permisos Requeridos:

Busca y agrega los siguientes permisos:

- ✅ **Sites.Read.All** (Leer elementos en todos los sitios)
- ✅ **Files.Read.All** (Leer archivos en todos los sitios)

5. Haz clic en **"Add permissions"**
6. **¡CRÍTICO!** Haz clic en **"Grant admin consent for Red Clay Consulting"**
   - Este botón otorga los permisos a la aplicación
   - Si no tienes permisos de administrador, contacta a tu administrador de Azure AD

✅ Deberías ver checkmarks verdes junto a los permisos que indican "Granted"

---

### **Paso 5: Actualizar Variables de Entorno**

Abre el archivo `.env` en tu proyecto y actualiza:

```env
AZURE_TENANT_ID=tu-tenant-id-copiado-del-paso-3
AZURE_CLIENT_ID=tu-client-id-copiado-del-paso-3
AZURE_CLIENT_SECRET=tu-client-secret-copiado-del-paso-3
SHAREPOINT_TENANT=redclay
SHAREPOINT_SITE_NAME=root
```

**Ejemplo real:**
```env
AZURE_TENANT_ID=12345678-1234-1234-1234-123456789012
AZURE_CLIENT_ID=87654321-4321-4321-4321-210987654321
AZURE_CLIENT_SECRET=AbC1~dEfGh2.ijKlMn3_opQrStUv4-wxYz5
SHAREPOINT_TENANT=redclay
SHAREPOINT_SITE_NAME=root
```

---

### **Paso 6: Reiniciar el Servidor**

```bash
cd chatbox-server
npm start
```

Deberías ver:
```
✅ SharePoint OAuth Service: Configurado correctamente
   Tenant: redclay
   Site: root
✅ Cliente de Microsoft Graph inicializado
```

---

## 🧪 Probar la Conexión

Abre tu navegador y ve a:
```
http://localhost:3000
```

Haz una pregunta que incluya términos en SharePoint:
- "¿Tienes información sobre Oracle?"
- "Busca documentos de C2M"

El sistema buscará automáticamente en:
1. PDFs de Oracle (local)
2. Confluence
3. **SharePoint** ← NUEVO con OAuth
4. Casos históricos (Excel)

---

## 🔍 Solución de Problemas

### Error: "Invalid tenant"
- ✅ Verifica que `AZURE_TENANT_ID` sea correcto
- ✅ Asegúrate de copiar el **Directory (tenant) ID** completo

### Error: "Invalid client"
- ✅ Verifica que `AZURE_CLIENT_ID` sea correcto
- ✅ Asegúrate de copiar el **Application (client) ID** completo

### Error: "Invalid client secret"
- ✅ Verifica que `AZURE_CLIENT_SECRET` sea correcto
- ✅ Si expiro, genera un nuevo Client Secret en Azure Portal

### Error: "Insufficient privileges"
- ✅ Verifica que otorgaste **admin consent** a los permisos
- ✅ Asegúrate de usar **Application permissions** (NO Delegated)
- ✅ Los permisos deben tener checkmarks verdes

### No se devuelven resultados
- ✅ Verifica que `SHAREPOINT_TENANT` sea correcto (ej: `redclay`)
- ✅ Verifica que `SHAREPOINT_SITE_NAME` sea correcto (usa `root` para el sitio principal)
- ✅ Verifica que haya documentos en SharePoint con los términos buscados

---

## 📚 Recursos Adicionales

- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
- [Microsoft Graph API Permissions](https://docs.microsoft.com/en-us/graph/permissions-reference)
- [Graph API Search](https://docs.microsoft.com/en-us/graph/api/search-query)

---

## 🆘 Soporte

Si necesitas ayuda:
1. Verifica que todos los pasos se completaron correctamente
2. Revisa los logs del servidor para mensajes de error específicos
3. Contacta a tu administrador de Azure AD si no tienes permisos

---

**✨ Una vez configurado, el sistema podrá buscar automáticamente en SharePoint junto con todas las demás fuentes de información!**
