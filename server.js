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
// MIDDLEWARE AMELIORE
// ============================================

// Configuration CORS améliorée
// NOTE: allowedOrigins ici stocke HOSTS (san protocol) ou pattern ak '*.' pou wildcard subdomains
const allowedOrigins = [
    'lotatonova-fv0b.onrender.com',
    'lotato.onrender.com',
    '*.lotato.onrender.com',
    'localhost',
    '127.0.0.1'
];

app.use(cors({
    origin: function (origin, callback) {
        // Autoriser les requêtes sans origine (curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        let originHost;
        try {
            originHost = new URL(origin).hostname; // extrait host san protocol ni port
        } catch (e) {
            console.warn(`⚠️ Origine mal formée: ${origin}`);
            return callback(new Error('Origine mal formée'), false);
        }

        const isAllowed = allowedOrigins.some(allowed => {
            // wildcard pattern: *.domain.tld
            if (allowed.startsWith('*.')) {
                const domain = allowed.slice(2); // retire '*.'
                return originHost === domain || originHost.endsWith(`.${domain}`);
            }
            // direct match (localhost may come with port, on compare hostnames)
            return originHost === allowed;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`⚠️ CORS bloqué pour origine: ${origin} (hostname=${originHost})`);
            callback(new Error('Origine non autorisée par CORS'), false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Origin']
}));

// Middleware pour logger les requêtes
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log('  Origin:', req.headers.origin || 'none');
    next();
});

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
        // Test koneksyon Supabase (senp)
        const { error } = await supabase.from('master_users').select('*').limit(1);
        if (error) {
            console.error('❌ Supabase connection error:', error.message || error);
            if (req.path.startsWith('/api/')) {
                return res.status(503).json({ 
                    success: false, 
                    error: 'Sistèm baz done pa disponib',
                    details: process.env.NODE_ENV === 'development' ? (error.message || error) : undefined
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
        console.error('❌ Erè inisyalizasyon baz done:', error.message || error);
    }
}

// ============================================
// MIDDLEWARE OTOANTIFIKASYON AMELIORE
// (reste inchangé)
// ============================================

const authenticateToken = async (req, res, next) => {
    try {
        const headerToken = req.headers.authorization?.replace('Bearer ', '');
        const cookieToken = req.cookies?.auth_token;
        const queryToken = req.query.token;
        const token = headerToken || cookieToken || queryToken;
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                error: 'Aksè refize. Token obligatwa.' 
            });
        }
        
        try {
            const parts = token.split('|');
            if (parts.length !== 4) {
                throw new Error('Token mal fòme');
            }
            
            const [userType, userId, subsystemId, expiry] = parts;
            const expiryTime = parseInt(expiry);
            
            if (Date.now() > expiryTime) {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Token ekspire. Rekonekte w.' 
                });
            }
            
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
        console.error('❌ Erè otantifikasyon:', error.message || error);
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
// ROUTS API
// (reste inchangé)
// ============================================

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
        const supabaseTest = await supabase.from('master_users').select('*').limit(1);
        
        const fs = require('fs');
        const htmlFiles = ['login.html', 'index.html', 'master-dashboard.html', 'control-level1.html', 'control-level2.html', 'subsystem-admin.html'];
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

// (le reste du fichier reste inchangé — routes de login, init, utilitaires, erreurs, démarrage)

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});
/* ... toutes les autres routes inchangées ... */

app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route non trouvée',
        path: req.path,
        available_routes: [
            'GET  /',
            'GET  /master',
            'GET  /agent',
            'GET  /supervisor-level1',
            'GET  /supervisor-level2',
            'GET  /subsystem-admin',
            'GET  /api/health',
            'GET  /api/system/status',
            'GET  /api/first-run',
            'POST /api/master/login',
            'POST /api/agent/login',
            'POST /api/supervisor/login',
            'POST /api/subsystem/login',
            'POST /api/master/init'
        ]
    });
});

app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur serveur interne',
        message: process.env.NODE_ENV === 'development' ? (err.message || err) : undefined
    });
});

app.listen(PORT, async () => {
    console.log(`🚀 Sèvè Nova Lotto ap kouri sou pò ${PORT}`);
    console.log(`📊 Supabase: ${supabaseUrl ? 'Konfigure' : 'Pa konfigure'}`);
    console.log(`🌐 URLs ki disponib:`);
    console.log(`   • Akèy: http://localhost:${PORT}/`);
    console.log(`   • API Health: http://localhost:${PORT}/api/health`);
    console.log(`   • API Status: http://localhost:${PORT}/api/system/status`);
    console.log(`   • Test API: http://localhost:${PORT}/api/test`);
    
    // Inisyalize baz done
    await initializeDatabase();
});
