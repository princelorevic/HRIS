const HrisApi = {
  token() {
    return localStorage.getItem('hris_token');
  },

  async request(path, { method = 'GET', body, isForm = false, query } = {}) {
    let url = `${API_BASE}${path}`;
    if (query) {
      const params = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') params.append(k, v);
      });
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers = {};
    const token = this.token();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isForm) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body !== undefined) options.body = isForm ? body : JSON.stringify(body);

    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      throw new Error('Could not reach the server. Check that the backend is running.');
    }

    if (res.status === 401) {
      localStorage.removeItem('hris_token');
      localStorage.removeItem('hris_user');
      if (!location.pathname.endsWith('login.html')) {
        location.href = 'login.html';
      }
      throw new Error('Session expired.');
    }

    // File downloads (excel/pdf) return blobs, not JSON
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (!res.ok) throw new Error('Request failed.');
      return res.blob();
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || 'Something went wrong.');
    }
    return data;
  },

  get(path, query) { return this.request(path, { method: 'GET', query }); },
  post(path, body, opts = {}) { return this.request(path, { method: 'POST', body, ...opts }); },
  put(path, body, opts = {}) { return this.request(path, { method: 'PUT', body, ...opts }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },

  async downloadFile(path, query, filename) {
    const blob = await this.request(path, { method: 'GET', query });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'report';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};
