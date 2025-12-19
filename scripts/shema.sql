-- Désactiver le RLS temporairement pour la création
ALTER TABLE IF EXISTS master_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS subsystem_admins DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supervisors_level2 DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS supervisors_level1 DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activities DISABLE ROW LEVEL SECURITY;

-- Table des sous-systèmes
CREATE TABLE IF NOT EXISTS subsystems (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    domain VARCHAR(100) UNIQUE NOT NULL,
    country VARCHAR(50),
    currency VARCHAR(10) DEFAULT 'XAF',
    is_active BOOLEAN DEFAULT TRUE,
    commission_rate DECIMAL(5,2) DEFAULT 10.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table administrateur master
CREATE TABLE IF NOT EXISTS master_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table administrateurs sous-système
CREATE TABLE IF NOT EXISTS subsystem_admins (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    full_name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table superviseurs niveau 2
CREATE TABLE IF NOT EXISTS supervisors_level2 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    full_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table superviseurs niveau 1
CREATE TABLE IF NOT EXISTS supervisors_level1 (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supervisor2_id UUID REFERENCES supervisors_level2(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    full_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    supervisor1_id UUID REFERENCES supervisors_level1(id) ON DELETE CASCADE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    phone VARCHAR(20) UNIQUE NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table tickets
CREATE TABLE IF NOT EXISTS tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    supervisor1_id UUID REFERENCES supervisors_level1(id),
    supervisor2_id UUID REFERENCES supervisors_level2(id),
    subsystem_id UUID REFERENCES subsystems(id),
    ticket_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    commission DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    validated_by UUID,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table activités
CREATE TABLE IF NOT EXISTS activities (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    action VARCHAR(50) NOT NULL,
    details TEXT,
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertion des données de test

-- Sous-système
INSERT INTO subsystems (name, domain, country, currency, commission_rate) VALUES
('LOTATO Cameroun', 'loto-cm.novalotto.com', 'Cameroun', 'XAF', 15.00),
('LOTATO Sénégal', 'loto-sn.novalotto.com', 'Sénégal', 'XOF', 12.50);

-- Utilisateur master
INSERT INTO master_users (username, password_hash, full_name, email) VALUES
('master', '$2a$10$N9qo8uLOickgx2ZMRZoMye3Z7Y6c1Hp8q5Z5J9z8vW1t2kL9mXn0a', 'Admin Principal', 'master@novalotto.com');

-- Superviseur niveau 2
INSERT INTO supervisors_level2 (subsystem_id, username, password_hash, full_name, email, phone) VALUES
((SELECT id FROM subsystems WHERE domain = 'loto-cm.novalotto.com'),
'$2a$10$N9qo8uLOickgx2ZMRZoMye3Z7Y6c1Hp8q5Z5J9z8vW1t2kL9mXn0a', 'Jean Dupont', 'jean.dupont@novalotto.com', '+237 6XX XXX XXX');

-- Réactiver le RLS après les insertions
ALTER TABLE master_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE subsystem_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors_level2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE supervisors_level1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
