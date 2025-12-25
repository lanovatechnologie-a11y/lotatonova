const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// KONFIGIRASYON SÈVIS
// ============================================

// 🚨 TRÈ ENPÒTAN: Ou dwe mete sa yo nan .env!
// nan Render: Al nan Environment Variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERREUR: SUPABASE_URL ou SUPABASE_ANON_KEY pa defini');
    console.error('📝 Nan Render, mete:');
    console.error('   - SUPABASE_URL: https://glutcejzwmynjxarmldq.supabase.co');
    console.error('   - SUPABASE_ANON_KEY: kle_w_la');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://lotato.onrender.com', 'https://*.lotato.onrender.com']
        : '*',
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '.')));

// Middleware pou teste koneksyon
app.use(async (req, res, next) => {
    // Pa teste pou health check
    if (req.path === '/api/health' || req.path === '/api/system/status') {
        return next();
    }
    
    try {
        // Test koneksyon Supabase
        const { error } = await supabase.from('master_users').select('count').limit(1);
        if (error) {
            console.error('❌ Supabase connection error:', error.message);
            if (req.path.startsWith('/api/')) {
                return res.status(503).json({ 
                    success: false, 
                    error: 'Sistèm baz done pa disponib',
                    details: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
        next();
    } catch (error) {
        next(error);
    }
});

// ============================================
// OTOMATIKMAN KREYE TAB SI PA EGZISTE
// ============================================

async function initializeDatabase() {
    console.log('🔍 Verifye estrikti baz done...');
    
    try {
        // Tcheke si tab master_users egziste
        const { error } = await supabase.from('master_users').select('*').limit(1);
        
        if (error && error.code === '42P01') {
            console.log('📦 Kreye estrikti baz done...');
            
            // Kreye tab yo
            const tables = [
                `CREATE TABLE IF NOT EXISTS subsystems (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    subdomain VARCHAR(50) UNIQUE NOT NULL,
                    contact_email VARCHAR(100),
                    contact_phone VARCHAR(20),
                    max_users INTEGER DEFAULT 10,
                    subscription_type VARCHAR(20) DEFAULT 'standard',
                    subscription_expires TIMESTAMP WITH TIME ZONE,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    deactivated_at TIMESTAMP WITH TIME ZONE
                );`,
                
                `CREATE TABLE IF NOT EXISTS master_users (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    full_name VARCHAR(100),
                    email VARCHAR(100),
                    phone VARCHAR(20),
                    is_active BOOLEAN DEFAULT true,
                    permissions JSONB DEFAULT '["full_access"]',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );`,
                
                `CREATE TABLE IF NOT EXISTS subsystem_admins (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    full_name VARCHAR(100),
                    email VARCHAR(100),
                    phone VARCHAR(20),
                    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
                    is_active BOOLEAN DEFAULT true,
                    permissions JSONB DEFAULT '["full_access"]',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(username, subsystem_id)
                );`,
                
                `CREATE TABLE IF NOT EXISTS supervisors (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    full_name VARCHAR(100),
                    email VARCHAR(100),
                    phone VARCHAR(20),
                    level INTEGER DEFAULT 1,
                    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
                    is_active BOOLEAN DEFAULT true,
                    permissions JSONB DEFAULT '[]',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(username, subsystem_id)
                );`,
                
                `CREATE TABLE IF NOT EXISTS agents (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    username VARCHAR(50) NOT NULL,
                    password VARCHAR(100) NOT NULL,
                    full_name VARCHAR(100),
                    email VARCHAR(100),
                    phone VARCHAR(20),
                    commission_rate DECIMAL(5,2) DEFAULT 0.10,
                    ticket_limit INTEGER DEFAULT 100,
                    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(username, subsystem_id)
                );`,
                
                `CREATE TABLE IF NOT EXISTS tickets (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    ticket_number VARCHAR(50) NOT NULL,
                    game_type VARCHAR(50) NOT NULL,
                    amount DECIMAL(10,2) NOT NULL,
                    payout_amount DECIMAL(10,2) DEFAULT 0,
                    numbers TEXT NOT NULL,
                    draw_date DATE NOT NULL,
                    client_name VARCHAR(100),
                    client_phone VARCHAR(20),
                    status VARCHAR(20) DEFAULT 'pending_validation',
                    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
                    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE,
                    validated_by UUID REFERENCES supervisors(id) ON DELETE SET NULL,
                    validated_at TIMESTAMP WITH TIME ZONE,
                    rejection_reason TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    UNIQUE(ticket_number, subsystem_id)
                );`,
                
                `CREATE TABLE IF NOT EXISTS subsystem_stats (
                    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                    subsystem_id UUID REFERENCES subsystems(id) ON DELETE CASCADE UNIQUE,
                    active_users INTEGER DEFAULT 0,
                    today_tickets INTEGER DEFAULT 0,
                    today_sales DECIMAL(15,2) DEFAULT 0,
                    total_tickets INTEGER DEFAULT 0,
                    total_sales DECIMAL(15,2) DEFAULT 0,
                    usage_percentage INTEGER DEFAULT 0,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );`
            ];
            
            // Kreye chak tab
            for (const sql of tables) {
                const { error } = await supabase.rpc('exec_sql', { sql });
                if (error && !error.message.includes('already exists')) {
                    console.error('❌ Erè kreasyon tab:', error.message);
                }
            }
            
            // Inser yon admin default si pa genyen
            const { count } = await supabase.from('master_users').select('*', { count: 'exact' });
            if (count === 0) {
                await supabase.from('master_users').insert({
                    username: 'admin',
                    password: 'admin123',  // 🚨 Chanje sa apre premye koneksyon!
                    full_name: 'Administrateur Principal',
                    email: 'admin@example.com',
                    is_active: true
                });
                console.log('✅ Admin default kreye: admin / admin123');
            }
            
            console.log('✅ Baz done inisyalize avèk siksè');
        } else {
            console.log('✅ Baz done deja egziste');
        }
    } catch (error) {
        console.error('❌ Erè inisyalizasyon baz done:', error.message);
    }
}

// ============================================
## MIDDLEWARE OTOANTIFIKASYON AMELIORE
## ============================================

const authenticateToken = async (req, res, next) => {
    try {
        // Fason 1: Token nan header
        const headerToken = req.headers.authorization?.replace('Bearer ', '');
        
        // Fason 2: Token nan cookie
        const cookieToken = req.cookies?.auth_token;
        
        // Fason 3: Token nan query (pou test sèlman)
        const queryToken = req.query.token;
        
        const token = headerToken || cookieToken || queryToken;
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Aksè refize. Token obligatwa.' 
            });
        }
        
        // Dekode token (senp - pou evite konplike)
        try {
            // Token la dwe gen fòma: userType|userId|subsystemId|expiry
            const parts = token.split('|');
            if (parts.length !== 4) {
                throw new Error('Token mal fòme');
            }
            
            const [userType, userId, subsystemId, expiry] = parts;
            const expiryTime = parseInt(expiry);
            
            // Tcheke si token ekspire
            if (Date.now() > expiryTime) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Token ekspire. Rekonekte w.' 
                });
            }
            
            // Verifye itilizatè a egziste toujou
            let tableName;
            switch(userType) {
                case 'master': tableName = 'master_users'; break;
                case 'agent': tableName = 'agents'; break;
                case 'supervisor': tableName = 'supervisors'; break;
                case 'subsystem_admin': tableName = 'subsystem_admins'; break;
                default: throw new Error('Kalite itilizatè envalid');
            }
            
            const { data: user, error: userError } = await supabase
                .from(tableName)
                .select('is_active')
                .eq('id', userId)
                .single();
                
            if (userError || !user?.is_active) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Kont itilizatè a pa aktif' 
                });
            }
            
            // Mete enfòmasyon nan request la
            req.user = {
                sub: userId,
                role: userType,
                subsystem_id: subsystemId !== 'null' ? subsystemId : null
            };
            
            next();
            
        } catch (decodeError) {
            return res.status(401).json({ 
                success: false, 
                error: 'Token envalid' 
            });
        }
        
    } catch (error) {
        console.error('❌ Erè otantifikasyon:', error.message);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sistèm otantifikasyon' 
        });
    }
};

const requireRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).json({ 
                success: false, 
                error: `Aksè rezève pou ${role} sèlman` 
            });
        }
        next();
    };
};

const requireSupervisorLevel = (level) => {
    return (req, res, next) => {
        if (req.user.role !== 'supervisor') {
            return res.status(403).json({ 
                success: false, 
                error: 'Aksè rezève pou sipèvize' 
            });
        }
        
        // Récupérer le niveau du superviseur
        supabase.from('supervisors')
            .select('level')
            .eq('id', req.user.sub)
            .single()
            .then(({ data }) => {
                if (!data || data.level !== level) {
                    return res.status(403).json({ 
                        success: false, 
                        error: `Aksè rezève pou sipèvize nivo ${level}` 
                    });
                }
                next();
            })
            .catch(error => {
                res.status(500).json({ 
                    success: false, 
                    error: 'Erè verifye nivo sipèvize' 
                });
            });
    };
};

// ============================================
## ROUTS API
## ============================================

// Health check - san otantifikasyon
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'Nova Lotto API',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development'
    });
});

// Vérifier tout système
app.get('/api/system/status', async (req, res) => {
    try {
        // Test Supabase
        const supabaseTest = await supabase.from('master_users').select('count').limit(1);
        
        // Test fichiers HTML
        const fs = require('fs');
        const htmlFiles = ['login.html', 'index.html', 'master-dashboard.html'];
        const missingFiles = htmlFiles.filter(file => !fs.existsSync(path.join(__dirname, file)));
        
        res.json({
            success: true,
            status: {
                server: 'running',
                supabase: supabaseTest.error ? 'disconnected' : 'connected',
                database: 'available',
                html_files: missingFiles.length === 0 ? 'all_present' : `missing: ${missingFiles.join(', ')}`
            },
            details: {
                supabase_url: supabaseUrl ? 'configured' : 'not_configured',
                node_env: process.env.NODE_ENV,
                uptime: process.uptime()
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erè teste sistèm',
            details: error.message
        });
    }
});

// ============================================
## OTOANTIFIKASYON
## ============================================

// Fonksyon pou kreye token
function createAuthToken(userType, userId, subsystemId = null) {
    const expiry = Date.now() + (24 * 60 * 60 * 1000); // 24 èdtan
    return `${userType}|${userId}|${subsystemId}|${expiry}`;
}

// Koneksyon Master
app.post('/api/master/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Non itilizatè ak modpas obligatwa' 
            });
        }
        
        const { data, error } = await supabase
            .from('master_users')
            .select('*')
            .eq('username', username)
            .eq('is_active', true)
            .single();
            
        if (error || !data) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non itilizatè oswa modpas pa kòrèk' 
            });
        }
        
        // Verifye modpas (san chifreman konplike)
        if (data.password !== password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Modpas pa kòrèk' 
            });
        }
        
        // Kreye token
        const token = createAuthToken('master', data.id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: data.id,
                username: data.username,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                role: 'master'
            }
        });
        
    } catch (error) {
        console.error('❌ Erè koneksyon master:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sèvè entèn' 
        });
    }
});

// Koneksyon Ajan
app.post('/api/agent/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Non itilizatè ak modpas obligatwa' 
            });
        }
        
        const { data, error } = await supabase
            .from('agents')
            .select('*, subsystems(name, subdomain, is_active)')
            .eq('username', username)
            .eq('is_active', true)
            .single();
            
        if (error || !data) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non itilizatè oswa modpas pa kòrèk' 
            });
        }
        
        // Verifye si sous-sistèm la aktif
        if (!data.subsystems?.is_active) {
            return res.status(403).json({ 
                success: false, 
                error: 'Sous-sistèm sa a dezaktive' 
            });
        }
        
        // Verifye modpas
        if (data.password !== password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Modpas pa kòrèk' 
            });
        }
        
        // Kreye token
        const token = createAuthToken('agent', data.id, data.subsystem_id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: data.id,
                username: data.username,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                role: 'agent',
                subsystem_id: data.subsystem_id,
                subsystem_name: data.subsystems?.name,
                subdomain: data.subsystems?.subdomain,
                commission_rate: data.commission_rate,
                ticket_limit: data.ticket_limit
            }
        });
        
    } catch (error) {
        console.error('❌ Erè koneksyon ajan:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sèvè entèn' 
        });
    }
});

// Koneksyon Sipèvize
app.post('/api/supervisor/login', async (req, res) => {
    try {
        const { username, password, level } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Non itilizatè ak modpas obligatwa' 
            });
        }
        
        const { data, error } = await supabase
            .from('supervisors')
            .select('*, subsystems(name, subdomain, is_active)')
            .eq('username', username)
            .eq('is_active', true)
            .single();
            
        if (error || !data) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non itilizatè oswa modpas pa kòrèk' 
            });
        }
        
        // Verifye nivo si bay
        if (level && data.level !== parseInt(level)) {
            return res.status(401).json({ 
                success: false, 
                error: 'Nivo sipèvize pa kòrèk' 
            });
        }
        
        // Verifye si sous-sistèm la aktif
        if (!data.subsystems?.is_active) {
            return res.status(403).json({ 
                success: false, 
                error: 'Sous-sistèm sa a dezaktive' 
            });
        }
        
        // Verifye modpas
        if (data.password !== password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Modpas pa kòrèk' 
            });
        }
        
        // Kreye token
        const token = createAuthToken('supervisor', data.id, data.subsystem_id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: data.id,
                username: data.username,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                role: 'supervisor',
                level: data.level,
                subsystem_id: data.subsystem_id,
                subsystem_name: data.subsystems?.name,
                subdomain: data.subsystems?.subdomain,
                permissions: data.permissions || []
            }
        });
        
    } catch (error) {
        console.error('❌ Erè koneksyon sipèvize:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sèvè entèn' 
        });
    }
});

// Koneksyon Admin Sous-sistèm
app.post('/api/subsystem/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                error: 'Non itilizatè ak modpas obligatwa' 
            });
        }
        
        const { data, error } = await supabase
            .from('subsystem_admins')
            .select('*, subsystems(*, stats:subsystem_stats(*))')
            .eq('username', username)
            .eq('is_active', true)
            .single();
            
        if (error || !data) {
            return res.status(401).json({ 
                success: false, 
                error: 'Non itilizatè oswa modpas pa kòrèk' 
            });
        }
        
        // Verifye si sous-sistèm la aktif
        if (!data.subsystems?.is_active) {
            return res.status(403).json({ 
                success: false, 
                error: 'Sous-sistèm sa a dezaktive' 
            });
        }
        
        // Verifye modpas
        if (data.password !== password) {
            return res.status(401).json({ 
                success: false, 
                error: 'Modpas pa kòrèk' 
            });
        }
        
        // Kreye token
        const token = createAuthToken('subsystem_admin', data.id, data.subsystem_id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: data.id,
                username: data.username,
                full_name: data.full_name,
                email: data.email,
                phone: data.phone,
                role: 'subsystem_admin',
                subsystem_id: data.subsystem_id,
                permissions: data.permissions || []
            },
            subsystem: {
                id: data.subsystems.id,
                name: data.subsystems.name,
                subdomain: data.subsystems.subdomain,
                contact_email: data.subsystems.contact_email,
                contact_phone: data.subsystems.contact_phone,
                max_users: data.subsystems.max_users,
                subscription_type: data.subsystems.subscription_type,
                subscription_expires: data.subsystems.subscription_expires,
                is_active: data.subsystems.is_active,
                stats: data.subsystems.stats
            }
        });
        
    } catch (error) {
        console.error('❌ Erè koneksyon admin:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sèvè entèn' 
        });
    }
});

// Premye inisyalizasyon Master
app.post('/api/master/init', async (req, res) => {
    try {
        const { masterUsername, masterPassword, companyName, masterEmail } = req.body;
        
        if (!masterUsername || !masterPassword) {
            return res.status(400).json({ 
                success: false, 
                error: 'Non itilizatè ak modpas obligatwa' 
            });
        }
        
        // Verifye si gen master deja
        const { count } = await supabase
            .from('master_users')
            .select('*', { count: 'exact' });
            
        if (count > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Sistèm nan deja inisyalize' 
            });
        }
        
        // Kreye premye master
        const { data, error } = await supabase
            .from('master_users')
            .insert({
                username: masterUsername,
                password: masterPassword,
                full_name: companyName || 'Administrateur Master',
                email: masterEmail,
                is_active: true,
                permissions: JSON.stringify(['full_access'])
            })
            .select()
            .single();
            
        if (error) {
            throw error;
        }
        
        const token = createAuthToken('master', data.id);
        
        res.json({
            success: true,
            token: token,
            user: {
                id: data.id,
                username: data.username,
                full_name: data.full_name,
                email: data.email,
                role: 'master'
            }
        });
        
    } catch (error) {
        console.error('❌ Erè inisyalizasyon:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erè sèvè entèn: ' + error.message 
        });
    }
});

// ============================================
## FONKSYON UTILITÈ
## ============================================

function generateRandomPassword(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

function calculatePayout(gameType, amount) {
    const multipliers = {
        'borlette': 70,
        'lotto-3': 500,
        'lotto-4': 5000,
        'lotto-5': 75000,
        'grap': 7,
        'marriage': 35
    };
    
    const multiplier = multipliers[gameType] || 1;
    return parseFloat(amount) * multiplier;
}

async function updateSubsystemStats(subsystemId, amount = 0, userChange = 0) {
    try {
        const today = new Date().toISOString().split('T')[0];
        
        const { data: stats, error: statsError } = await supabase
            .from('subsystem_stats')
            .select('*')
            .eq('subsystem_id', subsystemId)
            .single();
            
        if (statsError && statsError.code === 'PGRST116') {
            // Premye fwa
            await supabase
                .from('subsystem_stats')
                .insert({
                    subsystem_id: subsystemId,
                    active_users: Math.max(userChange, 0),
                    today_tickets: amount > 0 ? 1 : 0,
                    today_sales: amount,
                    total_tickets: amount > 0 ? 1 : 0,
                    total_sales: amount,
                    usage_percentage: 0,
                    updated_at: new Date().toISOString()
                });
            return;
        }
        
        if (statsError) throw statsError;
        
        const updates = {
            updated_at: new Date().toISOString()
        };
        
        // Reset stats chak jou
        const lastUpdated = new Date(stats.updated_at);
        const todayDate = new Date();
        
        if (lastUpdated.toISOString().split('T')[0] !== today) {
            updates.today_tickets = amount > 0 ? 1 : 0;
            updates.today_sales = amount;
        } else {
            updates.today_tickets = (stats.today_tickets || 0) + (amount > 0 ? 1 : 0);
            updates.today_sales = (stats.today_sales || 0) + amount;
        }
        
        updates.total_tickets = (stats.total_tickets || 0) + (amount > 0 ? 1 : 0);
        updates.total_sales = (stats.total_sales || 0) + amount;
        
        if (userChange !== 0) {
            const newActiveUsers = Math.max((stats.active_users || 0) + userChange, 0);
            updates.active_users = newActiveUsers;
            
            const { data: subsystem } = await supabase
                .from('subsystems')
                .select('max_users')
                .eq('id', subsystemId)
                .single();
                
            if (subsystem) {
                updates.usage_percentage = Math.round((newActiveUsers / subsystem.max_users) * 100);
            }
        }
        
        await supabase
            .from('subsystem_stats')
            .update(updates)
            .eq('subsystem_id', subsystemId);
            
    } catch (error) {
        console.error('❌ Erè mete ajou statistik:', error);
    }
}

// ============================================
## ROUT POU PÈMÈT DOSYE
## ============================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/master', (req, res) => {
    res.sendFile(path.join(__dirname, 'master-dashboard.html'));
});

app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/supervisor-level1', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level1.html'));
});

app.get('/supervisor-level2', (req, res) => {
    res.sendFile(path.join(__dirname, 'control-level2.html'));
});

app.get('/subsystem-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'subsystem-admin.html'));
});

// API premye koneksyon
app.get('/api/first-run', async (req, res) => {
    try {
        const { count } = await supabase
            .from('master_users')
            .select('*', { count: 'exact' });
            
        res.json({
            first_run: count === 0,
            message: count === 0 
                ? 'Premye koneksyon. Ou dwe kreye yon kont Master.'
                : 'Sistèm nan deja konfigure.'
        });
        
    } catch (error) {
        res.status(500).json({ 
            first_run: true,
            error: 'Erè verifye inisyalizasyon' 
        });
    }
});

// ============================================
## DEMARE SÈVÈ
## ============================================

app.listen(PORT, async () => {
    console.log(`🚀 Sèvè Nova Lotto ap kouri sou pò ${PORT}`);
    console.log(`📊 Supabase: ${supabaseUrl ? 'Konfigure' : 'Pa konfigure'}`);
    console.log(`🌐 URLs ki disponib:`);
    console.log(`   • Akèy: http://localhost:${PORT}/`);
    console.log(`   • API Health: http://localhost:${PORT}/api/health`);
    console.log(`   • API Status: http://localhost:${PORT}/api/system/status`);
    
    // Inisyalize baz done
    await initializeDatabase();
});