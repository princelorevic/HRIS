// Change this if your backend runs somewhere other than localhost:5000
// e.g. when deployed: "https://your-api-domain.com/api"
const API_BASE = (window.HRIS_API_BASE) || 'http://localhost:5000/api';
const UPLOADS_BASE = API_BASE.replace(/\/api$/, '');
