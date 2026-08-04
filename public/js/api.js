const API = {
  token: localStorage.getItem('qc_token') || '',
  user: null,

  setToken(token) {
    this.token = token || '';
    if (token) localStorage.setItem('qc_token', token);
    else localStorage.removeItem('qc_token');
  },

  async request(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(`/api${path}`, { ...options, headers });
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '请求失败');
      return data;
    }
    if (!res.ok) throw new Error('请求失败');
    return res;
  },

  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body }); },
  put(path, body) { return this.request(path, { method: 'PUT', body }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },

  async upload(path, formData) {
    return this.request(path, { method: 'POST', body: formData });
  }
};

window.API = API;
