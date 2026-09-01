-- ============================================================
-- NAGRIK SETU - COMPLETE POSTGIS DATABASE SCHEMA
-- ============================================================

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgvector;

-- 2. Enumerated Types
CREATE TYPE user_role AS ENUM ('CITIZEN', 'OFFICIAL_HIGHER', 'OFFICIAL_GROUND', 'ADMIN');
CREATE TYPE ticket_status AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'FORWARDED', 'RESOLVED', 'REJECTED');
CREATE TYPE priority_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- 3. Municipalities / Urban Local Bodies (ULBs)
CREATE TABLE municipalities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    state VARCHAR(100) DEFAULT 'Maharashtra',
    center_location GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Departments
CREATE TABLE departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL UNIQUE,
    sla_hours INT DEFAULT 48,
    escalation_email VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. User Profiles (Citizens, Officials, Admins)
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE,
    phone VARCHAR(20) UNIQUE,
    role user_role NOT NULL DEFAULT 'CITIZEN',
    municipality_id INT REFERENCES municipalities(id) ON DELETE SET NULL,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    ward_zone VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Grievances / Complaints Table
CREATE TABLE complaints (
    id VARCHAR(50) PRIMARY KEY,
    citizen_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    municipality_id INT REFERENCES municipalities(id) ON DELETE RESTRICT,
    department_id INT REFERENCES departments(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    raw_description TEXT NOT NULL,
    ai_summary TEXT,
    priority_score NUMERIC(3,1) DEFAULT 3.0,
    priority priority_level GENERATED ALWAYS AS (
        CASE 
            WHEN priority_score >= 8.0 THEN 'CRITICAL'::priority_level
            WHEN priority_score >= 6.0 THEN 'HIGH'::priority_level
            WHEN priority_score >= 4.0 THEN 'MEDIUM'::priority_level
            ELSE 'LOW'::priority_level
        END
    ) STORED,
    status ticket_status DEFAULT 'SUBMITTED',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location GEOMETRY(Point, 4326),
    embedding VECTOR(384),
    is_duplicate_of VARCHAR(50) REFERENCES complaints(id) ON DELETE SET NULL,
    assigned_to_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    assigned_by_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    photo_url TEXT,
    resolved_proof_url TEXT,
    sla_deadline TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Audit Trail & Ticket Movement History
CREATE TABLE complaint_audit_logs (
    id SERIAL PRIMARY KEY,
    complaint_id VARCHAR(50) REFERENCES complaints(id) ON DELETE CASCADE,
    performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,
    previous_status ticket_status,
    new_status ticket_status,
    previous_department_id INT REFERENCES departments(id),
    new_department_id INT REFERENCES departments(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES & PERFORMANCE OPTIMIZATIONS
-- ============================================================

-- Spatial index for GIS heatmap density and radius queries
CREATE INDEX idx_complaints_geo ON complaints USING GIST(location);

-- Query filtering indexes
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaints_municipality ON complaints(municipality_id);
CREATE INDEX idx_complaints_department ON complaints(department_id);
CREATE INDEX idx_complaints_priority ON complaints(priority_score DESC);

-- NOTE: IVFFlat vector index should be created AFTER inserting seed data.
-- Run this after you have at least a few hundred rows:
-- CREATE INDEX idx_complaints_embedding ON complaints
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================
-- AUTOMATED TRIGGERS
-- ============================================================

-- Trigger to synchronize PostGIS geometry Point from lat/lng
CREATE OR REPLACE FUNCTION sync_complaint_geom()
RETURNS TRIGGER AS $$
BEGIN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_complaint_geom
    BEFORE INSERT OR UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION sync_complaint_geom();

-- ============================================================
-- SEED DATA: Municipalities & Departments
-- ============================================================

INSERT INTO municipalities (name, code) VALUES
    ('Thane Municipal Corporation (TMC)', 'TMC'),
    ('Brihanmumbai Municipal Corp (BMC)', 'BMC'),
    ('Pune Municipal Corporation (PMC)', 'PMC'),
    ('Navi Mumbai Municipal Corp (NMMC)', 'NMMC'),
    ('Kalyan-Dombivli Corp (KDMC)', 'KDMC'),
    ('Nagpur Municipal Corporation (NMC)', 'NMC');

INSERT INTO departments (name, code) VALUES
    ('Roads & Traffic (PWD)', 'PWD'),
    ('Water Supply & Sewage', 'WATER'),
    ('Solid Waste Management', 'SWM'),
    ('Electricity & Streetlights', 'ELEC'),
    ('Public Health & Sanitation', 'HEALTH');

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

ALTER TABLE municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated read access to lookup tables
CREATE POLICY "Public read municipalities" ON municipalities FOR SELECT USING (true);
CREATE POLICY "Public read departments" ON departments FOR SELECT USING (true);

-- Profiles: anyone can read, anyone can insert (for auto-profile creation on login)
CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
CREATE POLICY "Public insert profiles" ON profiles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update profiles" ON profiles FOR UPDATE USING (true);

-- Complaints: full access for the app (tighten per-role later)
CREATE POLICY "Public read complaints" ON complaints FOR SELECT USING (true);
CREATE POLICY "Public insert complaints" ON complaints FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update complaints" ON complaints FOR UPDATE USING (true);

-- Audit logs: readable by all, insertable by app
CREATE POLICY "Public read audit logs" ON complaint_audit_logs FOR SELECT USING (true);
CREATE POLICY "Public insert audit logs" ON complaint_audit_logs FOR INSERT WITH CHECK (true);
