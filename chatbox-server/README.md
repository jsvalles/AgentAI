Chatbox Backend Proxy (Jira & Confluence)

Pasos rápidos:

1. Instalar dependencias

```bash
cd "c:\Users\JohanSValles\OneDrive - Red Clay Consulting, Inc\Desktop\Todo\chatbox-server"
npm install
```

2. Crear `.env` a partir de `.env.example` y completar las credenciales de Jira/Confluence.

3. Ejecutar el servidor

```bash
npm start
```

Endpoints de ejemplo:

- Health: `GET /health`
- Crear issue (Jira): `POST /api/jira/create-issue` con JSON { projectKey, summary, description, issueType }
- Buscar issues (Jira): `GET /api/jira/search?jql=...`
- Crear página (Confluence): `POST /api/confluence/create-page` con JSON { spaceKey, title, content }

Ejemplo desde el frontend (fetch):

```javascript
fetch('/api/jira/create-issue', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ projectKey: 'PROY', summary: 'Incidencia desde chat', description: 'Detalles...' })
}).then(r=>r.json()).then(data=>console.log(data));
```

Seguridad:
- Mantén las credenciales en variables de entorno.
- Usa HTTPS en producción y restringe orígenes CORS según tu necesidad.

