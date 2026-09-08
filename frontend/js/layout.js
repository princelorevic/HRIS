const NAV_BY_ROLE = {
  employee: [
    { key: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', href: 'dashboard.html' },
    { key: 'profile', icon: 'ti-user', label: 'My profile', href: 'profile.html' },
    { key: 'attendance', icon: 'ti-clock', label: 'Attendance', href: 'attendance.html' },
    { key: 'leaves', icon: 'ti-calendar-time', label: 'Leave', href: 'leaves.html' },
    { key: 'documents', icon: 'ti-file-text', label: 'Documents', href: 'documents.html' }
  ],
  supervisor: [
    { key: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', href: 'dashboard.html' },
    { key: 'profile', icon: 'ti-user', label: 'My profile', href: 'profile.html' },
    { key: 'employees', icon: 'ti-users', label: 'My team', href: 'employees.html' },
    { key: 'attendance', icon: 'ti-clock', label: 'Attendance', href: 'attendance.html' },
    { key: 'leaves', icon: 'ti-calendar-time', label: 'Leave approvals', href: 'leaves.html' },
    { key: 'documents', icon: 'ti-file-text', label: 'Documents', href: 'documents.html' }
  ],
  hr: [
    { key: 'dashboard', icon: 'ti-layout-dashboard', label: 'Dashboard', href: 'dashboard.html' },
    { key: 'employees', icon: 'ti-users', label: 'Employees', href: 'employees.html' },
    { key: 'organization', icon: 'ti-sitemap', label: 'Organization', href: 'organization.html' },
    { key: 'attendance', icon: 'ti-clock', label: 'Attendance', href: 'attendance.html' },
    { key: 'leaves', icon: 'ti-calendar-time', label: 'Leave management', href: 'leaves.html' },
    { key: 'documents', icon: 'ti-file-text', label: 'Documents', href: 'documents.html' },
    { key: 'reports', icon: 'ti-report', label: 'Reports', href: 'reports.html' },
    { key: 'audit', icon: 'ti-shield-lock', label: 'Activity logs', href: 'audit.html' },
    { key: 'settings', icon: 'ti-settings', label: 'Settings', href: 'settings.html' }
  ]
};

const HrisLayout = {
  user: null,
  settings: null,

  requireAuth() {
    const token = localStorage.getItem('hris_token');
    const userRaw = localStorage.getItem('hris_user');
    if (!token || !userRaw) {
      location.href = 'login.html';
      return null;
    }
    this.user = JSON.parse(userRaw);
    return this.user;
  },

  logout() {
    localStorage.removeItem('hris_token');
    localStorage.removeItem('hris_user');
    location.href = 'login.html';
  },

  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('');
  },

  async loadSettings() {
    try {
      this.settings = await HrisApi.get('/settings');
    } catch (e) {
      this.settings = { company_name: 'HRIS', logo_url: '' };
    }
    return this.settings;
  },

  logoSrc() {
    const url = this.settings && this.settings.logo_url;
    if (!url) return 'assets/logo-default.svg';
    if (url.startsWith('/uploads')) return `${UPLOADS_BASE}${url}`;
    return url;
  },

  async init({ page, title }) {
    const user = this.requireAuth();
    if (!user) return null;
    await this.loadSettings();

    const nav = NAV_BY_ROLE[user.role] || NAV_BY_ROLE.employee;
    const companyName = this.settings.company_name || 'HRIS';

    document.title = `${title || 'Dashboard'} · ${companyName}`;

    const root = document.getElementById('app-root');
    root.innerHTML = `
      <div class="sidebar-overlay" id="sidebar-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand">
          <img src="${this.logoSrc()}" alt="Logo" onerror="this.src='assets/logo-default.svg'" />
          <span>${escapeHtml(companyName)}</span>
        </div>
        <div class="sidebar-role-tag">${user.role === 'hr' ? 'HR / Admin' : user.role}</div>
        <nav class="sidebar-nav">
          ${nav.map((item) => `
            <a class="sidebar-link ${item.key === page ? 'active' : ''}" href="${item.href}">
              <i class="ti ${item.icon}" aria-hidden="true"></i>
              <span>${item.label}</span>
            </a>
          `).join('')}
        </nav>
        <div class="sidebar-foot">
          Signed in as <br /><strong>${escapeHtml(user.name || user.username)}</strong>
        </div>
      </aside>

      <div class="main-area">
        <header class="topbar">
          <div class="flex gap-8" style="align-items:center;">
            <button class="menu-toggle" id="menu-toggle" aria-label="Open menu"><i class="ti ti-menu-2"></i></button>
            <div class="topbar-title">${title || ''}</div>
          </div>
          <div class="topbar-right">
            <button class="icon-btn" id="notif-btn" aria-label="Notifications">
              <i class="ti ti-bell"></i>
              <span class="dot hidden" id="notif-dot"></span>
            </button>
            <div class="user-chip" id="user-chip">
              <div class="avatar">${user.photo_url ? `<img src="${UPLOADS_BASE}${user.photo_url}" />` : this.initials(user.name || user.username)}</div>
              <div>
                <div class="user-chip-name">${escapeHtml(user.name || user.username)}</div>
                <div class="user-chip-role">${user.role}</div>
              </div>
              <i class="ti ti-chevron-down" style="font-size:14px;color:var(--text-muted)"></i>
            </div>
          </div>
        </header>
        <main class="content" id="page-content"></main>
      </div>
    `;

    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('open');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('open');
    });

    document.getElementById('user-chip').addEventListener('click', () => {
      const doLogout = confirm('Log out of your account?');
      if (doLogout) this.logout();
    });

    this.refreshNotifications();
    setInterval(() => this.refreshNotifications(), 60000);

    return user;
  },

  async refreshNotifications() {
    try {
      const { unread_count } = await HrisApi.get('/notifications');
      const dot = document.getElementById('notif-dot');
      if (dot) dot.classList.toggle('hidden', !unread_count);
    } catch (e) { /* silent */ }
  }
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatDate(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(d) {
  if (!d) return '-';
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadgeClass(status) {
  const map = {
    present: 'badge-teal', approved: 'badge-teal', regular: 'badge-teal', active: 'badge-teal',
    late: 'badge-amber', pending: 'badge-amber', probationary: 'badge-amber', supervisor_approved: 'badge-amber',
    absent: 'badge-red', rejected: 'badge-red', terminated: 'badge-red', resigned: 'badge-red',
    'on-leave': 'badge-blue', contractual: 'badge-blue', cancelled: 'badge-gray'
  };
  return map[status] || 'badge-gray';
}
