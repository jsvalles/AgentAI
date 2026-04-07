(function () {
  const AUTH_STORAGE_KEY = 'chatbox_local_auth_user';
  let sessionClosed = false;

  function getStoredAuth() {
    const stored = sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return null;

    try {
      const parsed = JSON.parse(stored);
      if (!parsed || !parsed.user || !parsed.sessionToken) {
        return null;
      }
      return parsed;
    } catch (err) {
      return null;
    }
  }

  async function closeSession(reason) {
    if (sessionClosed) return;

    const auth = getStoredAuth();
    if (!auth) return;

    sessionClosed = true;
    const payload = JSON.stringify({
      username: auth.user.username,
      sessionToken: auth.sessionToken,
      sessionStartAt: auth.loginAt,
      reason: reason || 'unknown'
    });

    // sendBeacon es ideal al cerrar la pestana porque no bloquea unload
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon('/api/auth/end-session', blob);
      return;
    }

    try {
      await fetch('/api/auth/end-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      });
    } catch (err) {
      // No interrumpir flujo de UI por errores de red al cerrar sesion
    }
  }

  function disableChat() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    if (input) input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
  }

  function enableChat() {
    const input = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    if (input) input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
  }

  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .auth-overlay {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.55);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .auth-card {
        width: 100%;
        max-width: 420px;
        background: #ffffff;
        border-radius: 12px;
        border: 1px solid #dbe2ea;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
        padding: 20px;
        font-family: 'IBM Plex Sans', sans-serif;
      }
      .auth-title {
        margin: 0 0 8px;
        font-size: 20px;
        color: #1f2937;
      }
      .auth-subtitle {
        margin: 0 0 16px;
        font-size: 13px;
        color: #4b5563;
      }
      .auth-label {
        display: block;
        margin-bottom: 6px;
        color: #374151;
        font-size: 13px;
        font-weight: 600;
      }
      .auth-input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 12px;
        font-size: 14px;
      }
      .auth-btn {
        width: 100%;
        border: none;
        border-radius: 8px;
        background: #0f766e;
        color: #ffffff;
        font-weight: 600;
        padding: 10px 12px;
        cursor: pointer;
      }
      .auth-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }
      .auth-error {
        margin-top: 10px;
        color: #b91c1c;
        font-size: 13px;
        min-height: 18px;
      }
      .auth-user-pill {
        margin-right: 10px;
        padding: 4px 8px;
        border-radius: 999px;
        font-size: 12px;
        background: #ecfeff;
        color: #115e59;
        border: 1px solid #99f6e4;
      }
      .auth-logout-btn {
        border: 1px solid #cbd5e1;
        background: #ffffff;
        color: #334155;
        border-radius: 6px;
        font-size: 12px;
        padding: 6px 8px;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function addUserBadge(user) {
    const headerRight = document.querySelector('.chat-header > div');
    if (!headerRight) return;

    const existing = document.getElementById('auth-user-pill');
    if (existing) existing.remove();

    const logoutExisting = document.getElementById('auth-logout-btn');
    if (logoutExisting) logoutExisting.remove();

    const pill = document.createElement('span');
    pill.id = 'auth-user-pill';
    pill.className = 'auth-user-pill';
    pill.textContent = `Usuario: ${user.displayName || user.username}`;

    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'auth-logout-btn';
    logoutBtn.className = 'auth-logout-btn';
    logoutBtn.type = 'button';
    logoutBtn.textContent = 'Cerrar sesion';
    logoutBtn.addEventListener('click', async () => {
      await closeSession('manual_logout');
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      window.location.reload();
    });

    headerRight.prepend(logoutBtn);
    headerRight.prepend(pill);
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'auth-overlay';
    overlay.innerHTML = `
      <div class="auth-card">
        <h2 class="auth-title">Acceso requerido</h2>
        <p class="auth-subtitle">Inicia sesion para usar la aplicacion y registrar tus accesos.</p>
        <label class="auth-label" for="auth-username">Usuario</label>
        <input id="auth-username" class="auth-input" type="text" autocomplete="username" />
        <label class="auth-label" for="auth-password">Contrasena</label>
        <input id="auth-password" class="auth-input" type="password" autocomplete="current-password" />
        <button id="auth-login-btn" class="auth-btn" type="button">Ingresar</button>
        <div id="auth-error" class="auth-error"></div>
      </div>
    `;

    return overlay;
  }

  async function loginRequest(username, password) {
    const response = await fetch('/api/auth/login-local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'No fue posible iniciar sesion');
    }

    return data;
  }

  async function initAuth() {
    injectStyles();

    const storedAuth = getStoredAuth();
    if (storedAuth) {
      addUserBadge(storedAuth.user);
      enableChat();
      return;
    } else if (sessionStorage.getItem(AUTH_STORAGE_KEY)) {
      sessionStorage.removeItem(AUTH_STORAGE_KEY);
      sessionClosed = false;
    }

    disableChat();

    const overlay = buildOverlay();
    document.body.appendChild(overlay);

    const userInput = overlay.querySelector('#auth-username');
    const passInput = overlay.querySelector('#auth-password');
    const loginBtn = overlay.querySelector('#auth-login-btn');
    const errorEl = overlay.querySelector('#auth-error');

    async function runLogin() {
      const username = (userInput.value || '').trim();
      const password = passInput.value || '';

      if (!username || !password) {
        errorEl.textContent = 'Debes ingresar usuario y contrasena.';
        return;
      }

      loginBtn.disabled = true;
      loginBtn.textContent = 'Validando...';
      errorEl.textContent = '';

      try {
        const result = await loginRequest(username, password);
        sessionClosed = false;
        sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          user: result.user,
          sessionToken: result.sessionToken,
          loginAt: result.loginAt || new Date().toISOString()
        }));
        addUserBadge(result.user);
        overlay.remove();
        enableChat();
      } catch (err) {
        errorEl.textContent = err.message;
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Ingresar';
      }
    }

    loginBtn.addEventListener('click', runLogin);
    passInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        runLogin();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  window.addEventListener('beforeunload', () => {
    closeSession('browser_close');
  });
})();
