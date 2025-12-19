// Minimal React-like runtime to keep the UI extendable without external bundles
const React = (() => {
  const Fragment = Symbol('Fragment');
  let hooks = [];
  let hookIndex = 0;
  let pendingEffects = [];
  let currentRoot = null;
  let currentVNode = null;

  const createElement = (type, props = {}, ...children) => ({
    type,
    props,
    children: children.flat()
  });

  const render = (vnode, container) => {
    currentRoot = container;
    currentVNode = vnode;
    hookIndex = 0;
    pendingEffects = [];
    const dom = createDom(vnode);
    container.replaceChildren(dom);
    pendingEffects.forEach((fn) => fn());
  };

  const rerender = () => {
    if (currentRoot && currentVNode) {
      render(currentVNode, currentRoot);
    }
  };

  const useState = (initialValue) => {
    const idx = hookIndex++;
    if (hooks[idx] === undefined) {
      hooks[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
    }
    const setState = (value) => {
      hooks[idx] = typeof value === 'function' ? value(hooks[idx]) : value;
      rerender();
    };
    return [hooks[idx], setState];
  };

  const useMemo = (factory, deps) => {
    const idx = hookIndex++;
    const previous = hooks[idx];
    const changed =
      !previous ||
      !deps ||
      deps.length === 0 ||
      deps.some((dep, i) => dep !== previous.deps[i]);

    if (changed) {
      const value = factory();
      hooks[idx] = { value, deps };
      return value;
    }

    return previous.value;
  };

  const useEffect = (effect, deps) => {
    const idx = hookIndex++;
    const previous = hooks[idx];
    const changed =
      !previous ||
      !deps ||
      deps.length === 0 ||
      deps.some((dep, i) => dep !== previous.deps[i]);

    if (changed) {
      pendingEffects.push(() => {
        if (previous && typeof previous.cleanup === 'function') {
          previous.cleanup();
        }
        const cleanup = effect();
        hooks[idx] = { deps, cleanup };
      });
    }
  };

  const setProp = (dom, name, value) => {
    if (name === 'key') {
      return;
    }

    if (name === 'className') {
      dom.setAttribute('class', value);
    } else if (name === 'style' && value && typeof value === 'object') {
      Object.assign(dom.style, value);
    } else if (name.startsWith('on') && typeof value === 'function') {
      const evt = name.substring(2).toLowerCase();
      dom.addEventListener(evt, value);
    } else if (name === 'value' || name === 'checked') {
      dom[name] = value;
    } else if (name !== 'children' && value !== false && value !== undefined) {
      dom.setAttribute(name, value);
    }
  };

  const createDom = (vnode) => {
    if (vnode === null || vnode === undefined || vnode === false) {
      return document.createTextNode('');
    }

    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return document.createTextNode(vnode);
    }

    if (typeof vnode.type === 'function') {
      const component = vnode.type({ ...vnode.props, children: vnode.children });
      return createDom(component);
    }

    const dom = vnode.type === Fragment ? document.createDocumentFragment() : document.createElement(vnode.type);

    Object.entries(vnode.props || {}).forEach(([name, value]) => setProp(dom, name, value));
    vnode.children.forEach((child) => dom.appendChild(createDom(child)));

    return dom;
  };

  return { createElement, useState, useEffect, useMemo, Fragment, render };
})();

const ReactDOM = {
  createRoot: (container) => ({
    render: (node) => React.render(node, container)
  })
};

const h = React.createElement;
const { useEffect, useMemo, useState } = React;

// --- shared hooks ---
function useLocalStorage(key, initialValue) {
  const [stored, setStored] = useState(() => {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      try {
        return JSON.parse(raw);
      } catch (error) {
        console.warn('Failed to parse localStorage value', error);
      }
    }
    return initialValue;
  });

  useEffect(() => {
    if (stored === undefined) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(stored));
  }, [key, stored]);

  return [stored, setStored];
}

function Toast({ tone, message }) {
  if (!message) return null;
  return h('div', { className: `toast ${tone}` }, message);
}

function ResultPanel({ response, onClear }) {
  if (!response) return null;
  const prettyPayload = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
  return h(
    'div',
    { className: 'card' },
    h(
      'div',
      { className: 'res-header' },
      h(
        'div',
        null,
        h('p', { className: 'eyebrow' }, 'Last response'),
        h('h2', null, `${response.method} ${response.path}`),
        h('p', null, 'Status: ', h('span', { className: 'chip' }, response.status))
      ),
      h('button', { className: 'secondary', onClick: onClear }, 'Clear')
    ),
    h('div', { className: 'results' }, h('pre', null, prettyPayload))
  );
}

const QUICK_ACTIONS = [
  { title: 'Providers', path: '/admin/providers', method: 'GET', description: 'List providers and their statuses.' },
  { title: 'Devices', path: '/admin/devices', method: 'GET', description: 'Fetch registered devices.' },
  { title: 'Workspaces', path: '/admin/workspaces', method: 'GET', description: 'Workspaces visible to the session.' },
  { title: 'User Info', path: '/user-info', method: 'GET', description: 'Inspect current user scopes.' },
  { title: 'Health', path: '/health', method: 'GET', description: 'Readiness check for the hub.' }
];

function buildUrl(baseUrl, path) {
  if (!path.startsWith('/')) {
    return `${baseUrl.replace(/\/$/, '')}/${path}`;
  }
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function App() {
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
      if (token) headers.Authorization = `Bearer ${token}`;

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
        // plain text response
      }

      const payload = { method, path, status: res.status, data: parsed };
      setResponse(payload);
      setToast({ tone: res.ok ? 'success' : 'error', message: `${method} ${path} ${res.ok ? 'succeeded' : 'failed'}` });

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
    const result = await sendRequest({ path: '/authenticate', method: 'POST', body: { username, password } });
    if (result.ok && result.data?.access_token) {
      setToken(result.data.access_token);
      setToast({ tone: 'success', message: `Signed in as ${result.data.username || username}` });
    }
  };

  const handleLogout = async () => {
    await sendRequest({ path: '/logout', method: 'POST' });
    setToken('');
    setToast({ tone: 'success', message: 'Logged out and token cleared' });
  };

  const handleCustom = async () => {
    let parsedBody;
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

  return h(
    'div',
    { className: 'app-shell' },
    h(
      'header',
      { className: 'header' },
      h(
        'div',
        { className: 'header__titles' },
        h('p', { className: 'eyebrow' }, 'GADS Hub'),
        h('h1', null, 'React control surface'),
        h('p', null, 'Configure a hub endpoint, authenticate, and call common APIs from an extendable React workspace.')
      ),
      h('div', { className: 'status-chip' }, token ? 'Authenticated' : 'Guest mode')
    ),
    h(
      'div',
      { className: 'grid' },
      h(
        'div',
        { className: 'card' },
        h('p', { className: 'eyebrow' }, 'Connection'),
        h('h2', null, 'API base URL'),
        h('p', null, 'Use your running hub address. Values persist locally so you can reconnect faster.'),
        h(
          'div',
          { className: 'field' },
          h('label', { htmlFor: 'base' }, 'Base URL'),
          h('input', {
            id: 'base',
            type: 'url',
            value: resolvedBaseUrl,
            onInput: (e) => setBaseUrl(e.target.value),
            placeholder: 'http://localhost:10000'
          })
        ),
        h(
          'div',
          { className: 'button-row' },
          h(
            'button',
            { className: 'secondary', onClick: () => setBaseUrl(origin) },
            'Reset to page origin'
          ),
          h('span', { className: 'chip' }, 'Saved locally')
        )
      ),
      h(
        'div',
        { className: 'card' },
        h('p', { className: 'eyebrow' }, 'Authentication'),
        h('h2', null, 'Sign in'),
        h('p', null, 'Obtain a bearer token from the hub. Credentials are not stored locally.'),
        h(
          'div',
          { className: 'field' },
          h('label', { htmlFor: 'username' }, 'Username'),
          h('input', {
            id: 'username',
            value: username,
            onInput: (e) => setUsername(e.target.value),
            autoComplete: 'username'
          })
        ),
        h(
          'div',
          { className: 'field' },
          h('label', { htmlFor: 'password' }, 'Password'),
          h('input', {
            id: 'password',
            type: 'password',
            value: password,
            onInput: (e) => setPassword(e.target.value),
            autoComplete: 'current-password'
          })
        ),
        h(
          'div',
          { className: 'button-row' },
          h('button', { onClick: handleLogin, disabled: isLoading }, 'Request token'),
          h(
            'button',
            { className: 'secondary', onClick: handleLogout, disabled: !token || isLoading },
            'Log out'
          )
        ),
        token
          ? h(
              'div',
              { className: 'panel' },
              h('strong', null, 'Bearer token'),
              h(
                'p',
                { style: 'word-break: break-all' },
                token
              )
            )
          : null
      )
    ),
    h(
      'div',
      { className: 'card' },
      h('p', { className: 'eyebrow' }, 'Quick actions'),
      h('h2', null, 'Common endpoints'),
      h(
        'p',
        null,
        'Send authenticated hub requests without writing curl scripts. Extend this list with new components as features grow.'
      ),
      h(
        'div',
        { className: 'button-row' },
        ...QUICK_ACTIONS.map((action) =>
          h(
            'button',
            { key: action.path, disabled: isLoading, onClick: () => sendRequest(action) },
            action.title
          )
        )
      ),
      h(
        'div',
        { className: 'panel' },
        ...QUICK_ACTIONS.map((action) =>
          h(
            'div',
            { key: action.title, style: 'margin-bottom: 8px' },
            h('strong', null, action.title),
            ' ',
            h('span', { className: 'badge' }, `${action.method} ${action.path}`),
            h('p', { style: 'margin-top: 4px' }, action.description)
          )
        )
      )
    ),
    h(
      'div',
      { className: 'card' },
      h('p', { className: 'eyebrow' }, 'Request lab'),
      h('h2', null, 'Custom call'),
      h('p', null, 'Experiment with any hub endpoint. JSON bodies are supported for non-GET methods.'),
      h(
        'div',
        { className: 'grid' },
        h(
          'div',
          { className: 'field' },
          h('label', { htmlFor: 'method' }, 'Method'),
          h(
            'select',
            { id: 'method', value: customMethod, onInput: (e) => setCustomMethod(e.target.value) },
            h('option', null, 'GET'),
            h('option', null, 'POST'),
            h('option', null, 'PUT'),
            h('option', null, 'DELETE')
          )
        ),
        h(
          'div',
          { className: 'field' },
          h('label', { htmlFor: 'path' }, 'Path'),
          h('input', { id: 'path', value: customPath, onInput: (e) => setCustomPath(e.target.value) })
        )
      ),
      h(
        'div',
        { className: 'field' },
        h('label', { htmlFor: 'body' }, 'JSON body (optional)'),
        h('textarea', {
          id: 'body',
          value: customBody,
          onInput: (e) => setCustomBody(e.target.value),
          placeholder: '{"key":"value"}'
        })
      ),
      h(
        'div',
        { className: 'button-row' },
        h('button', { onClick: handleCustom, disabled: isLoading }, 'Send request'),
        h('span', { className: 'chip' }, 'Authorization header auto-applied')
      )
    ),
    h(Toast, { tone: toast.tone, message: toast.message }),
    h(ResultPanel, { response, onClear: clearResponse })
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(h(App));
