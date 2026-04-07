# 🤖 Configuración de Claude AI

## Descripción
Esta integración agrega capacidades avanzadas de IA al chatbot usando Claude de Anthropic.

## Funcionalidades Implementadas

### 1. ✨ Respuestas Mejoradas con IA
- Genera respuestas contextuales basadas en resultados de Confluence y Excel
- Combina información de múltiples fuentes
- Respuestas más naturales y completas

### 2. 📝 Resumen Automático
- Resume documentación larga automáticamente
- Extrae información técnica clave
- Configurable por longitud máxima

### 3. 🌐 Traducción Español-Inglés
- Traduce consultas y respuestas
- Mantiene términos técnicos
- Bidireccional (ES ↔ EN)

### 4. 😊 Análisis de Sentimiento
- Detecta frustración del usuario
- Identifica urgencia de consultas
- Permite priorización automática

## Configuración

### Paso 1: Obtener API Key de Anthropic

1. Ir a https://console.anthropic.com/
2. Crear cuenta o iniciar sesión
3. Ir a **Settings** → **API Keys**
4. Crear nueva API Key
5. Copiar la clave (empieza con `sk-ant-...`)

### Paso 2: Configurar en .env

Editar archivo `.env` en `chatbox-server/`:

```env
# Claude AI (Anthropic)
ANTHROPIC_API_KEY=sk-ant-api03-TU_CLAVE_AQUI
```

### Paso 3: Reiniciar Servidor

```bash
cd chatbox-server
node server.js
```

Deberías ver:
```
🤖 Claude AI: ✅ ACTIVADO
```

## Uso

### Endpoints Disponibles

#### 1. Verificar Estado
```http
GET /api/ai/status
```

Respuesta:
```json
{
  "enabled": true,
  "message": "Claude AI disponible"
}
```

#### 2. Generar Respuesta con IA
```http
POST /api/ai/generate-response
Content-Type: application/json

{
  "query": "¿Cómo crear un medidor?",
  "confluenceResults": [...],
  "excelResults": [...]
}
```

#### 3. Resumir Texto
```http
POST /api/ai/summarize
Content-Type: application/json

{
  "text": "Texto largo a resumir...",
  "maxLength": 200
}
```

#### 4. Traducir
```http
POST /api/ai/translate
Content-Type: application/json

{
  "text": "¿Cómo crear un dispositivo?",
  "targetLang": "en"
}
```

#### 5. Analizar Sentimiento
```http
POST /api/ai/analyze-sentiment
Content-Type: application/json

{
  "message": "URGENTE: El sistema no funciona!!"
}
```

Respuesta:
```json
{
  "sentiment": "frustrated",
  "urgency": "high"
}
```

## Costos Estimados

**Modelo:** Claude 3.5 Sonnet

| Operación | Tokens aprox. | Costo por llamada |
|-----------|---------------|-------------------|
| Respuesta mejorada | 1000 | $0.003 USD |
| Resumen | 300 | $0.001 USD |
| Traducción | 500 | $0.0015 USD |
| Análisis sentimiento | 100 | $0.0003 USD |

**Costo mensual estimado** (1000 consultas): ~$3-5 USD

## Sin API Key

Si no configuras `ANTHROPIC_API_KEY`, el chatbot funciona normalmente pero **sin** estas funcionalidades:
- ✅ Búsquedas en Confluence: **FUNCIONAN**
- ✅ Búsquedas en Excel: **FUNCIONAN**
- ✅ Creación de tickets: **FUNCIONA**
- ❌ Respuestas mejoradas con IA: **NO DISPONIBLE**
- ❌ Resumen automático: **USA TRUNCADO SIMPLE**
- ❌ Traducción: **NO DISPONIBLE**
- ❌ Análisis sentimiento: **NO DISPONIBLE**

## Arquitectura

```
Usuario → Chatbot → Búsqueda (Confluence + Excel)
                          ↓
                    Claude AI (opcional)
                          ↓
                   Respuesta Mejorada → Usuario
```

## Troubleshooting

### Error: "ANTHROPIC_API_KEY not configured"
**Solución:** Agregar la clave en archivo `.env` y reiniciar servidor

### Error: "Invalid API Key"
**Solución:** Verificar que la clave sea correcta y esté activa en console.anthropic.com

### Error: "Rate limit exceeded"
**Solución:** Plan gratuito tiene límites. Esperar o actualizar plan.

### Claude responde en inglés
**Solución:** Ya configurado para responder en español por defecto

## Próximos Pasos (Opcional)

1. Agregar botón "🤖 Mejorar respuesta con IA" en el frontend
2. Implementar toggle ES/EN para traducción en tiempo real
3. Agregar indicador visual cuando IA está procesando
4. Mostrar badge de "urgente" si sentimiento es crítico

## Soporte

Para preguntas: johan.valles@redclay.com
Documentación Claude: https://docs.anthropic.com/
