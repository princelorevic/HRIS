# HRIS — Human Resource Information System

A full-stack HRIS built with **HTML + CSS + Vanilla JS** (frontend), **Express.js / Node.js** (backend API), and **MySQL** (database).

## What's included

| Module | Description |
|---|---|
| Employee Management | Profiles, employee ID, department, position, status, date hired, emergency contact, search/filter, pagination |
| Attendance | Time in/out, history, late/absent tracking, monthly report, team view for supervisors |
| Leave Management | Apply for leave, leave balances, two-step approval (supervisor → HR), leave history |
| Documents | Upload/store contracts, certificates, government IDs, payslips per employee |
| Organization | Departments, positions, supervisors, employee hierarchy |
| Dashboard | HR sees company-wide stats (total/active employees, on-leave today, pending approvals, etc). Employees/supervisors see a personal summary |
| Reports | Excel export (employees, attendance) and PDF export (leave report) |
| Security | JWT authentication, bcrypt password hashing, role-based access control (Employee / Supervisor / HR) |
| Other | Activity/audit logs, notifications, responsive design (desktop + mobile), swappable logo/branding anytime |

Roles: **Employee** (self-service), **Supervisor** (team view + leave approvals), **HR/Admin** (full control).

---

## 1. Set up the database (MySQL Workbench)

1. Open **MySQL Workbench** and connect to your local MySQL server.
2. Go to **File → Open SQL Script** and open `database/schema.sql` from this project.
3. Click the lightning bolt (⚡ Execute) to run the whole script. This creates the `hris_db` database, all tables, and seed data (departments, positions, leave types).

> If you'd rather use the command line:
> ```bash
> mysql -u root -p < database/schema.sql
> ```

---

## 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in your MySQL credentials:

```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=roxas032920
DB_NAME=hris_db
JWT_SECRET=replace_with_a_long_random_string
```

Create the first HR admin account (bcrypt-hashes the password properly):

```bash
npm run seed
```

This prints the username/password to log in with (defaults: `admin` / `Admin@12345` — **change this password after your first login**, or set `SEED_ADMIN_*` in `.env` before running the seed).

Start the API server:

```bash
npm run dev      # with auto-restart (nodemon)
# or
npm start        # plain node
```

The API runs on `http://localhost:5000` by default. Visit `http://localhost:5000/api/health` to confirm it's up.

---

## 3. Set up the frontend

The frontend is plain HTML/CSS/JS — no build step required.

1. Open `frontend/js/config.js` and confirm `API_BASE` points to your backend:
   ```js
   const API_BASE = 'http://localhost:5000/api';
   ```
2. Serve the `frontend` folder with any static server, for example:
   ```bash
   cd frontend
   npx serve .
   # or: python3 -m http.server 5500
   ```
3. Open the printed URL (e.g. `http://localhost:5500`) in your browser. You'll land on the login page.
4. Log in with the HR admin account you created in step 2.

> Opening the HTML files directly via `file://` will NOT work correctly for file uploads/CORS — always serve them through a local server as shown above.

---

## 4. Changing the logo and company name anytime

Log in as HR → **Settings** → upload a new logo (PNG/JPG/SVG/WEBP, max 3MB) and/or change the company name. It updates immediately across the login page and sidebar — no code changes or redeployment needed.

---

## 5. How the roles work

| Action | Employee | Supervisor | HR/Admin |
|---|---|---|---|
| View/edit own profile | ✅ view only | ✅ view only | ✅ full |
| Time in/out | ✅ | ✅ | ✅ |
| Apply for leave | ✅ | ✅ | ✅ |
| Approve leave (1st step) | ❌ | ✅ (own team) | — |
| Approve leave (2nd/final step) | ❌ | ❌ | ✅ |
| View team attendance | ❌ | ✅ (own team) | ✅ (all) |
| Add/edit/deactivate employees | ❌ | ❌ | ✅ |
| Manage departments/positions | ❌ | ❌ | ✅ |
| Export reports | ❌ | partial (attendance) | ✅ |
| View activity logs | ❌ | ❌ | ✅ |
| Change branding/logo | ❌ | ❌ | ✅ |

The leave approval workflow is: **employee applies → supervisor approves/rejects → HR gives final approval/rejection**. Only after HR's final approval are leave balances deducted and attendance marked "on-leave" for those dates.

---

## 6. Project structure

```
hris/
├── database/
│   └── schema.sql              MySQL schema + seed data (run in Workbench)
├── backend/
│   ├── config/db.js            MySQL connection pool
│   ├── middleware/
│   │   ├── auth.js             JWT auth + role-based access control
│   │   └── upload.js           Multer config (documents + logo)
│   ├── routes/                 One file per module (auth, employees, attendance, leaves, ...)
│   ├── utils/
│   │   ├── auditLog.js         Writes to audit_logs table
│   │   └── seed.js             Creates the first HR admin (npm run seed)
│   ├── uploads/                Uploaded documents + logo (created automatically)
│   ├── server.js                Express app entry point
│   └── .env.example
└── frontend/
    ├── css/style.css           Design system (tokens, layout, components)
    ├── js/
    │   ├── config.js           API_BASE — change this when deploying
    │   ├── api.js              fetch wrapper (adds JWT, handles errors)
    │   ├── layout.js           Role-based sidebar/topbar + auth guard
    │   └── toast.js            Toast notifications
    ├── assets/logo-default.svg
    ├── login.html
    ├── dashboard.html
    ├── employees.html          Employee CRUD (HR) / team view (supervisor)
    ├── attendance.html
    ├── leaves.html
    ├── documents.html
    ├── organization.html       Departments, positions, hierarchy (HR only)
    ├── reports.html            Excel/PDF exports (HR only)
    ├── audit.html              Activity logs (HR only)
    ├── settings.html           Branding + change password
    └── profile.html
```

---

## 7. Deploying (making it "ready to deploy")

**Backend** — deploy `backend/` to any Node host that supports MySQL connections:
- Render, Railway, Fly.io, a VPS (with PM2 + nginx), or similar.
- Set the same environment variables from `.env` in your host's dashboard.
- Point `DB_HOST` etc. to your production MySQL instance (e.g. a managed MySQL on Railway/PlanetScale-compatible service, or your own MySQL server).
- Make sure the `uploads/` folder persists across deploys (use a persistent disk/volume — on most PaaS this needs to be explicitly configured, otherwise uploaded files are lost on redeploy).

**Frontend** — deploy `frontend/` to any static host:
- Netlify, Vercel (static), GitHub Pages, or the same VPS via nginx.
- Before deploying, update `frontend/js/config.js`:
  ```js
  const API_BASE = 'https://your-backend-domain.com/api';
  ```
- Update `CLIENT_URL` in the backend's `.env` to your deployed frontend URL (used for CORS).

**Security checklist before going live:**
- Set a strong, random `JWT_SECRET`.
- Change the default HR admin password immediately after first login.
- Serve both frontend and backend over HTTPS.
- Consider lowering `JWT_EXPIRES_IN` and adding refresh-token rotation for production use.
- Review the `LATE_CUTOFF` time in `backend/routes/attendance.js` to match your company's grace period.

---

## 8. Common issues

- **"Could not reach the server"** on the login page → the backend isn't running, or `API_BASE` in `config.js` is wrong.
- **DB connection failed** in the backend console → double-check `.env` values and that you ran `database/schema.sql` first.
- **CORS errors in the browser console** → set `CLIENT_URL` in the backend `.env` to match the exact URL you're opening the frontend from.
- **Login works but pages redirect back to login** → the JWT may have expired (`JWT_EXPIRES_IN`); just log in again.

## 9. How to Run and Test
- You need to add terminal and run cd backend (`"npm run dev  or npm run start "`)
- You need to add terminal and run cd frontend (`"npx serve ."`)
