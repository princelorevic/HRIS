-- ============================================================
-- HRIS DATABASE SCHEMA
-- Import this file in MySQL Workbench (File > Run SQL Script)
-- or via CLI: mysql -u root -p < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS hris_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hris_db;

-- ------------------------------------------------------------
-- ORGANIZATION STRUCTURE
-- ------------------------------------------------------------
CREATE TABLE departments (
    department_id   INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL UNIQUE,
    description     VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE positions (
    position_id     INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(100) NOT NULL,
    department_id   INT,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- USERS & AUTH  (login accounts, one per employee)
-- ------------------------------------------------------------
CREATE TABLE users (
    user_id         INT AUTO_INCREMENT PRIMARY KEY,
    username        VARCHAR(50) NOT NULL UNIQUE,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            ENUM('employee','supervisor','hr') NOT NULL DEFAULT 'employee',
    is_active       BOOLEAN DEFAULT TRUE,
    last_login      DATETIME NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- EMPLOYEES
-- ------------------------------------------------------------
CREATE TABLE employees (
    employee_id       INT AUTO_INCREMENT PRIMARY KEY,
    employee_code     VARCHAR(20) NOT NULL UNIQUE,          -- e.g. EMP-0001
    user_id           INT UNIQUE,
    first_name        VARCHAR(80) NOT NULL,
    last_name         VARCHAR(80) NOT NULL,
    middle_name       VARCHAR(80),
    photo_url         VARCHAR(255),
    department_id     INT,
    position_id       INT,
    supervisor_id     INT NULL,                             -- self-referencing (their manager)
    employment_status  ENUM('regular','probationary','contractual','part-time','resigned','terminated') DEFAULT 'probationary',
    date_hired        DATE NOT NULL,
    date_separated    DATE NULL,
    contact_number    VARCHAR(20),
    address           VARCHAR(255),
    emergency_contact_name    VARCHAR(120),
    emergency_contact_number  VARCHAR(20),
    emergency_contact_relation VARCHAR(60),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (department_id) REFERENCES departments(department_id) ON DELETE SET NULL,
    FOREIGN KEY (position_id) REFERENCES positions(position_id) ON DELETE SET NULL,
    FOREIGN KEY (supervisor_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- ATTENDANCE
-- ------------------------------------------------------------
CREATE TABLE attendance (
    attendance_id   INT AUTO_INCREMENT PRIMARY KEY,
    employee_id     INT NOT NULL,
    log_date        DATE NOT NULL,
    time_in         TIME NULL,
    time_out        TIME NULL,
    status          ENUM('present','late','absent','half-day','on-leave','holiday') DEFAULT 'present',
    remarks         VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    UNIQUE KEY uq_employee_date (employee_id, log_date)
);

-- ------------------------------------------------------------
-- LEAVE MANAGEMENT
-- ------------------------------------------------------------
CREATE TABLE leave_types (
    leave_type_id   INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(60) NOT NULL UNIQUE,       -- Vacation, Sick, Emergency, etc.
    default_days    INT DEFAULT 0
);

CREATE TABLE leave_balances (
    leave_balance_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id      INT NOT NULL,
    leave_type_id    INT NOT NULL,
    year             INT NOT NULL,
    total_days       DECIMAL(5,2) DEFAULT 0,
    used_days        DECIMAL(5,2) DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id) ON DELETE CASCADE,
    UNIQUE KEY uq_emp_type_year (employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
    leave_request_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id       INT NOT NULL,
    leave_type_id     INT NOT NULL,
    date_from         DATE NOT NULL,
    date_to           DATE NOT NULL,
    total_days        DECIMAL(5,2) NOT NULL,
    reason            VARCHAR(500),
    status            ENUM('pending','supervisor_approved','approved','rejected','cancelled') DEFAULT 'pending',
    supervisor_id     INT NULL,
    supervisor_action_at DATETIME NULL,
    supervisor_remarks   VARCHAR(255),
    hr_id             INT NULL,
    hr_action_at      DATETIME NULL,
    hr_remarks        VARCHAR(255),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (leave_type_id) REFERENCES leave_types(leave_type_id),
    FOREIGN KEY (supervisor_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    FOREIGN KEY (hr_id) REFERENCES employees(employee_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- DOCUMENTS
-- ------------------------------------------------------------
CREATE TABLE documents (
    document_id     INT AUTO_INCREMENT PRIMARY KEY,
    employee_id     INT NOT NULL,
    category        ENUM('contract','certificate','government_id','payslip','other') DEFAULT 'other',
    file_name       VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NOT NULL,
    uploaded_by     INT NULL,
    uploaded_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    title           VARCHAR(150) NOT NULL,
    message         VARCHAR(500),
    is_read         BOOLEAN DEFAULT FALSE,
    link            VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- AUDIT LOGS
-- ------------------------------------------------------------
CREATE TABLE audit_logs (
    audit_id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NULL,
    action          VARCHAR(100) NOT NULL,      -- e.g. LOGIN, CREATE_EMPLOYEE, APPROVE_LEAVE
    entity_type     VARCHAR(50),
    entity_id       INT NULL,
    details         VARCHAR(500),
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- APP SETTINGS (company logo, name, etc. - editable anytime)
-- ------------------------------------------------------------
CREATE TABLE settings (
    setting_key     VARCHAR(50) PRIMARY KEY,
    setting_value   VARCHAR(500)
);

INSERT INTO settings (setting_key, setting_value) VALUES
('company_name', 'Your Company Inc.'),
('logo_url', '/assets/logo-default.svg'),
('primary_color', '#1E7F6E');

-- ------------------------------------------------------------
-- SEED DATA
-- ------------------------------------------------------------
INSERT INTO departments (name, description) VALUES
('Human Resources', 'People operations and HR administration'),
('Information Technology', 'Software, infrastructure and IT support'),
('Finance', 'Accounting, payroll and finance'),
('Operations', 'Day to day business operations');

INSERT INTO positions (title, department_id) VALUES
('HR Manager', 1),
('HR Officer', 1),
('Software Engineer', 2),
('IT Support', 2),
('Accountant', 3),
('Operations Supervisor', 4),
('Operations Staff', 4);

INSERT INTO leave_types (name, default_days) VALUES
('Vacation Leave', 15),
('Sick Leave', 15),
('Emergency Leave', 5),
('Maternity/Paternity Leave', 7),
('Unpaid Leave', 0);

-- NOTE: the first HR admin account is created by running `npm run seed`
-- in /backend (see README). That script properly bcrypt-hashes the
-- password instead of a hard-coded hash here.
