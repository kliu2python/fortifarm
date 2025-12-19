import { useMemo, useState } from 'react';
import './styles.css';
import { useLocalStorage } from './useLocalStorage';

const QUICK_ACTIONS = [
  {
    title: 'Providers',
    path: '/admin/providers',
    method: 'GET',
    description: 'List all configured providers and their statuses.'
  },
  {
    title: 'Devices',
    path: '/admin/devices',
    method: 'GET',
    description: 'Fetch registered devices from the hub.'
  },
  {
    title: 'Workspaces',
    path: '/admin/workspaces',
    method: 'GET',
    description: 'Retrieve workspaces available to the current user.'
  },
  {
    title: 'User Info',
    path: '/user-info',
    method: 'GET',
    description: 'Inspect the authenticated session and scopes.'
  },
  {
    title: 'Health',
    path: '/health',
    method: 'GET',
    description: 'Quick readiness check for the hub service.'
  }
];

function buildUrl(baseUrl, path) {
  if (!path.startsWith('/')) {
    return `${baseUrl.replace(/\/$/, '')}/${path}`;
  }
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function ResultPanel({ response, onClear }) {
  if (!response) {
    return null;
  }

  const prettyPayload = typeof response.data === 'string'
    ? response.data
    : JSON.stringify(response.data, null, 2);

  return (
    <div className="card">
      <div className="res-header">
        <div>
          <p className="eyebrow">Last response</p>
          <h2>{response.method} {response.path}</h2>
          <p>Status: <span className="chip">{response.status}</span></p>
        </div>
        <button className="secondary" onClick={onClear}>Clear</button>
      </div>
      <div className="results">
        <pre>{prettyPayload}</pre>
      </div>
    </div>
  );
}

function Toast({ tone, message }) {
  if (!message) return null;
  return <div className={`toast ${tone}`}>{message}</div>;
}

export default function App() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const [baseUrl, setBaseUrl] = useLocalStorage('hub.baseUrl', origin);
  const [token, setToken] = useLocalStorage('hub.token', '');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [toast, setToast] = useState({ tone: 'success', message: '' });
  const [customPath, setCustomPath] = useState('/admin/providers');
  const [customMethod, setCustomMethod] = useState('GET');
  const [customBody, setCustomBody] = useState('');

  const resolvedBaseUrl = useMemo(() => baseUrl || origin, [baseUrl, origin]);

  const sendRequest = async ({ path, method = 'GET', body }) => {
    setIsLoading(true);
    setToast({ tone: 'success', message: '' });

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const url = buildUrl(resolvedBaseUrl, path);
      const config = { method, headers };
      if (body && method !== 'GET') {
        config.body = JSON.stringify(body);
      }

      const res = await fetch(url, config);
      const text = await res.text();
      let parsed = text;

      try {
        parsed = JSON.parse(text);
      } catch (error) {
        // keep raw text
      }

      const payload = { method, path, status: res.status, data: parsed };
      setResponse(payload);

      if (!res.ok) {
        setToast({ tone: 'error', message: `${method} ${path} failed (${res.status})` });
      } else {
        setToast({ tone: 'success', message: `${method} ${path} succeeded` });
      }

      return { ok: res.ok, data: parsed };
    } catch (error) {
      setToast({ tone: 'error', message: error.message });
      setResponse({ method, path, status: 'error', data: error.message });
      return { ok: false, data: error };
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    const result = await sendRequest({
      path: '/authenticate',
      method: 'POST',
      body: { username, password }
    });

    if (result.ok && result.data?.access_token) {
      setToken(result.data.access_token);
      setToast({ tone: 'success', message: `Signed in as ${result.data.username}` });
    }
  };

  const handleLogout = async () => {
    await sendRequest({ path: '/logout', method: 'POST' });
    setToken('');
    setToast({ tone: 'success', message: 'Logged out and token cleared' });
  };

  const triggerQuickAction = (action) => sendRequest(action);

  const handleCustom = async () => {
    let parsedBody = undefined;
    if (customBody.trim()) {
      try {
        parsedBody = JSON.parse(customBody);
      } catch (error) {
        setToast({ tone: 'error', message: 'Request body must be valid JSON' });
        return;
      }
    }

    await sendRequest({ path: customPath, method: customMethod, body: parsedBody });
  };

  const clearResponse = () => setResponse(null);

  return (
    <div className="app-shell">
      <header className="header">
        <div className="header__titles">
          <p className="eyebrow">GADS Hub</p>
          <h1>React control surface</h1>
          <p>Configure a hub endpoint, authenticate, and call common APIs from an extendable React workspace.</p>
        </div>
        <div className="status-chip">{token ? 'Authenticated' : 'Guest mode'}</div>
      </header>

      <div className="grid">
        <div className="card">
          <p className="eyebrow">Connection</p>
          <h2>API base URL</h2>
          <p>Use your running hub address. Values persist locally so you can reconnect faster.</p>
          <div className="field">
            <label htmlFor="base">Base URL</label>
            <input
              id="base"
              type="url"
              value={resolvedBaseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:10000"
            />
          </div>
          <div className="button-row">
            <button className="secondary" onClick={() => setBaseUrl(origin)}>Reset to page origin</button>
            <span className="chip">Saved locally</span>
          </div>
        </div>

        <div className="card">
          <p className="eyebrow">Authentication</p>
          <h2>Sign in</h2>
          <p>Obtain a bearer token from the hub. Credentials are not stored locally.</p>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div className="button-row">
            <button onClick={handleLogin} disabled={isLoading}>Request token</button>
            <button className="secondary" onClick={handleLogout} disabled={!token || isLoading}>Log out</button>
          </div>
          {token && (
            <div className="panel">
              <strong>Bearer token</strong>
              <p style={{ wordBreak: 'break-all' }}>{token}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Quick actions</p>
        <h2>Common endpoints</h2>
        <p>Send authenticated hub requests without writing curl scripts. Extend this list with new components as features grow.</p>
        <div className="button-row">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.path}
              onClick={() => triggerQuickAction(action)}
              disabled={isLoading}
            >
              {action.title}
            </button>
          ))}
        </div>
        <div className="panel">
          {QUICK_ACTIONS.map((action) => (
            <div key={action.title} style={{ marginBottom: 8 }}>
              <strong>{action.title}</strong> <span className="badge">{action.method} {action.path}</span>
              <p style={{ marginTop: 4 }}>{action.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="eyebrow">Request lab</p>
        <h2>Custom call</h2>
        <p>Experiment with any hub endpoint. JSON bodies are supported for non-GET methods.</p>
        <div className="grid">
          <div className="field">
            <label htmlFor="method">Method</label>
            <select id="method" value={customMethod} onChange={(e) => setCustomMethod(e.target.value)}>
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="path">Path</label>
            <input id="path" value={customPath} onChange={(e) => setCustomPath(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="body">JSON body (optional)</label>
          <textarea
            id="body"
            value={customBody}
            onChange={(e) => setCustomBody(e.target.value)}
            placeholder='{"key":"value"}'
          />
        </div>
        <div className="button-row">
          <button onClick={handleCustom} disabled={isLoading}>Send request</button>
          <span className="chip">Authorization header auto-applied</span>
        </div>
      </div>

      <Toast tone={toast.tone} message={toast.message} />
      <ResultPanel response={response} onClear={clearResponse} />
    </div>
  );
}
