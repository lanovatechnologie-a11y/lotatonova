// server.js pour Lotato
const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');
const cors = require('cors');

const app = express();

// === MIDDLEWARE ===
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Middleware pour parser le JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS pour permettre les requêtes depuis le frontend
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// === DONNÉES EN MÉMOIRE (simplifiées) ===
let users = [
    { id: 1, username: 'admin', password: 'admin', role: 'agent', name: 'Agent Lotato' },
    { id: 2, username: 'supervisor1', password: 'super1', role: 'supervisor', name: 'Superviseur 1' },
    { id: 3, username: 'supervisor2', password: 'super2', role: 'supervisor', name: 'Superviseur 2' },
    { id: 4, username: 'subsystem', password: 'sub123', role: 'subsystem', name: 'Propriétaire' },
    { id: 5, username: 'master', password: 'master123', role: 'master', name: 'Master Admin' }
];

let tickets = [];
let resultsDatabase = {};
let companyInfo = {
    name: "Nova Lotto",
    phone: "+509 32 53 49 58",
    address: "Cap Haïtien",
    reportTitle: "Nova Lotto",
    reportPhone: "40104585"
};

// === MIDDLEWARE D'AUTHENTIFICATION ===
function verifyToken(req, res, next) {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token manquant' 
        });
    }
    
    // Vérification simple du token
    if (token.startsWith('nova_')) {
        const parts = token.split('_');
        if (parts.length >= 5) {
            req.user = {
                id: parts[2],
                role: parts[3],
                level: parts[4] || '1'
            };
            return next();
        }
    }
    
    return res.status(401).json({ 
        success: false, 
        error: 'Token invalide' 
    });
}

// === ROUTES D'AUTHENTIFICATION ===
app.post('/api/auth/login', (req, res) => {
    const { username, password, role } = req.body;
    
    console.log('Tentative de connexion:', { username, role });
    
    // Recherche de l'utilisateur
    const user = users.find(u => 
        u.username === username && 
        u.password === password && 
        u.role === role
    );
    
    if (!user) {
        console.log('Utilisateur non trouvé');
        return res.status(401).json({
            success: false,
            error: 'Identifiants ou rôle incorrect'
        });
    }
    
    console.log('Utilisateur trouvé:', user.username, user.role);
    
    // Génération du token au format attendu par Lotato
    const token = `nova_${Date.now()}_${user.id}_${user.role}_1`;
    
    // Détermination de l'URL de redirection
    let redirectUrl;
    switch (user.role) {
        case 'agent':
            redirectUrl = '/lotato.html';
            break;
        case 'supervisor':
            redirectUrl = '/supervisor-control.html';
            break;
        case 'subsystem':
            redirectUrl = '/subsystem-admin.html';
            break;
        case 'master':
            redirectUrl = '/master-dashboard.html';
            break;
        default:
            redirectUrl = '/';
    }
    
    res.json({
        success: true,
        redirectUrl: redirectUrl,
        token: token,
        user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            level: 1
        }
    });
});

// === ROUTES API POUR LOTATO ===

// Route de santé
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        timestamp: new Date().toISOString(),
        message: 'Lotato API est en ligne'
    });
});

// Route pour vérifier un token
app.get('/api/auth/verify', (req, res) => {
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
        return res.json({
            success: false,
            valid: false
        });
    }
    
    res.json({
        success: true,
        valid: true
    });
});

// === ROUTES PROTÉGÉES PAR TOKEN ===

// Récupérer les résultats
app.get('/api/results', verifyToken, (req, res) => {
    // Données de test pour les résultats
    const mockResults = {
        miami: {
            morning: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            },
            evening: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            }
        },
        georgia: {
            morning: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            },
            evening: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            }
        },
        newyork: {
            morning: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            },
            evening: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            }
        },
        texas: {
            morning: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            },
            evening: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            }
        },
        tunisia: {
            morning: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            },
            evening: {
                date: new Date().toISOString(),
                lot1: Math.floor(Math.random() * 900 + 100).toString(),
                lot2: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0'),
                lot3: Math.floor(Math.random() * 90 + 10).toString().padStart(2, '0')
            }
        }
    };
    
    res.json({
        success: true,
        results: mockResults
    });
});

// Vérifier les tickets gagnants
app.post('/api/check-winners', verifyToken, (req, res) => {
    const { draw, drawTime, results } = req.body;
    
    // Simulation de vérification des gagnants
    const winningTickets = tickets.filter(ticket => {
        return ticket.draw === draw && 
               ticket.drawTime === drawTime &&
               ticket.status === 'active';
    }).map(ticket => ({
        ...ticket,
        isWinner: Math.random() > 0.7, // 30% de chance de gagner
        winAmount: Math.floor(Math.random() * 10000) + 1000
    }));
    
    res.json({
        success: true,
        winningTickets: winningTickets.filter(t => t.isWinner),
        totalWinnings: winningTickets.reduce((sum, t) => sum + (t.winAmount || 0), 0)
    });
});

// Gestion des tickets
app.get('/api/tickets', verifyToken, (req, res) => {
    res.json({
        success: true,
        tickets: tickets.filter(t => t.status !== 'pending'),
        nextTicketNumber: tickets.length + 1
    });
});

// Tickets en attente
app.get('/api/tickets/pending', verifyToken, (req, res) => {
    res.json({
        success: true,
        tickets: tickets.filter(t => t.status === 'pending')
    });
});

// Tickets gagnants
app.get('/api/tickets/winning', verifyToken, (req, res) => {
    res.json({
        success: true,
        tickets: tickets.filter(t => t.isWinner)
    });
});

// Sauvegarder un ticket
app.post('/api/tickets', verifyToken, (req, res) => {
    const ticket = req.body;
    
    // Assigner un numéro si non fourni
    if (!ticket.number) {
        ticket.number = tickets.length + 1;
    }
    
    // Ajouter la date si non présente
    if (!ticket.date) {
        ticket.date = new Date().toISOString();
    }
    
    // Ajouter le statut
    ticket.status = 'active';
    ticket.createdAt = new Date().toISOString();
    
    // Sauvegarder le ticket
    tickets.push(ticket);
    
    res.json({
        success: true,
        ticket: ticket,
        message: 'Ticket sauvegardé avec succès'
    });
});

// Sauvegarder un ticket en attente
app.post('/api/tickets/pending', verifyToken, (req, res) => {
    const ticket = req.body;
    
    // Assigner un numéro si non fourni
    if (!ticket.number) {
        ticket.number = tickets.length + 1;
    }
    
    // Ajouter la date si non présente
    if (!ticket.date) {
        ticket.date = new Date().toISOString();
    }
    
    // Ajouter le statut
    ticket.status = 'pending';
    ticket.createdAt = new Date().toISOString();
    
    // Sauvegarder le ticket
    tickets.push(ticket);
    
    res.json({
        success: true,
        ticket: ticket,
        message: 'Ticket en attente sauvegardé'
    });
});

// Historique
app.get('/api/history', verifyToken, (req, res) => {
    const historyTickets = tickets
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 50); // Limiter à 50 derniers
    
    res.json({
        success: true,
        history: historyTickets
    });
});

// Sauvegarder l'historique
app.post('/api/history', verifyToken, (req, res) => {
    const historyRecord = req.body;
    
    // Ici, on pourrait stocker l'historique séparément
    // Pour simplifier, on utilise le même tableau tickets
    historyRecord.id = Date.now();
    historyRecord.type = 'history';
    
    tickets.push(historyRecord);
    
    res.json({
        success: true,
        message: 'Historique sauvegardé'
    });
});

// Tickets multi-tirages
app.get('/api/tickets/multi-draw', verifyToken, (req, res) => {
    const multiDrawTickets = tickets.filter(t => t.isMultiDraw);
    
    res.json({
        success: true,
        tickets: multiDrawTickets
    });
});

// Sauvegarder un ticket multi-tirages
app.post('/api/tickets/multi-draw', verifyToken, (req, res) => {
    const ticket = req.body;
    
    // Marquer comme multi-tirage
    ticket.isMultiDraw = true;
    
    // Assigner un numéro si non fourni
    if (!ticket.number) {
        ticket.number = tickets.length + 1;
    }
    
    // Ajouter la date si non présente
    if (!ticket.date) {
        ticket.date = new Date().toISOString();
    }
    
    // Ajouter le statut
    ticket.status = 'active';
    ticket.createdAt = new Date().toISOString();
    
    // Sauvegarder le ticket
    tickets.push(ticket);
    
    res.json({
        success: true,
        ticket: ticket,
        message: 'Ticket multi-tirages sauvegardé'
    });
});

// Informations de l'entreprise
app.get('/api/company-info', verifyToken, (req, res) => {
    res.json({
        success: true,
        ...companyInfo
    });
});

// Logo
app.get('/api/logo', verifyToken, (req, res) => {
    res.json({
        success: true,
        logoUrl: '/logo-borlette.jpg',
        message: 'URL du logo'
    });
});

// === ROUTES STATIQUES ===

// Servir les fichiers statiques
app.use(express.static(__dirname, {
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

// Route racine (page de connexion)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route Lotato
app.get('/lotato.html', (req, res) => {
    // Vérification basique du token depuis l'URL
    const token = req.query.token;
    
    if (!token || !token.startsWith('nova_')) {
        // Rediriger vers la page de connexion si pas de token valide
        return res.redirect('/');
    }
    
    res.sendFile(path.join(__dirname, 'lotato.html'));
});

// Route pour les autres pages HTML
app.get('/*.html', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    
    // Vérifier si le fichier existe
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).send('Page non trouvée');
        }
        
        res.sendFile(filePath);
    });
});

// Route pour le service worker
app.get('/service-worker.js', (req, res) => {
    const serviceWorkerPath = path.join(__dirname, 'service-worker.js');
    
    fs.access(serviceWorkerPath, fs.constants.F_OK, (err) => {
        if (err) {
            // Créer un service worker basique s'il n'existe pas
            const basicSW = `
                self.addEventListener('install', event => {
                    console.log('Service Worker installé');
                });
                
                self.addEventListener('fetch', event => {
                    event.respondWith(fetch(event.request));
                });
            `;
            
            return res.type('application/javascript').send(basicSW);
        }
        
        res.sendFile(serviceWorkerPath);
    });
});

// Route pour les images (logo)
app.get('/logo-borlette.jpg', (req, res) => {
    const logoPath = path.join(__dirname, 'logo-borlette.jpg');
    
    fs.access(logoPath, fs.constants.F_OK, (err) => {
        if (err) {
            // Retourner une image par défaut si le logo n'existe pas
            return res.redirect('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YzOWMxMiIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Qk9STEVUVEU8L3RleHQ+PC9zdmc+');
        }
        
        res.sendFile(logoPath);
    });
});

// Route pour le manifest
app.get('/manifest.json', (req, res) => {
    const manifest = {
        "name": "Lotato",
        "short_name": "Lotato",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "icons": [
            {
                "src": "/logo-borlette.jpg",
                "sizes": "192x192",
                "type": "image/jpeg"
            }
        ]
    };
    
    res.json(manifest);
});

// === GESTION D'ERREURS ===

// Middleware 404 pour les routes API non trouvées
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route API non trouvée'
    });
});

// Middleware 404 général
app.use((req, res) => {
    res.status(404).send('Page non trouvée');
});

// Middleware d'erreur
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    
    if (req.path.startsWith('/api/')) {
        return res.status(500).json({
            success: false,
            error: 'Erreur serveur interne'
        });
    }
    
    res.status(500).send('Erreur serveur interne');
});

// === DÉMARRAGE DU SERVEUR ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Lotato démarré sur le port ${PORT}`);
    console.log(`📁 Compression GZIP activée`);
    console.log(`🏠 Page de connexion: http://localhost:${PORT}/`);
    console.log(`🎰 Application Lotato: http://localhost:${PORT}/lotato.html`);
    console.log('');
    console.log('✅ Serveur Lotato prêt !');
    console.log('');
    console.log('📋 Routes API disponibles:');
    console.log('  POST /api/auth/login');
    console.log('  GET  /api/health');
    console.log('  GET  /api/results');
    console.log('  POST /api/check-winners');
    console.log('  GET  /api/tickets');
    console.log('  POST /api/tickets');
    console.log('  GET  /api/tickets/pending');
    console.log('  POST /api/tickets/pending');
    console.log('  GET  /api/tickets/winning');
    console.log('  GET  /api/tickets/multi-draw');
    console.log('  POST /api/tickets/multi-draw');
    console.log('  GET  /api/history');
    console.log('  POST /api/history');
    console.log('  GET  /api/company-info');
    console.log('  GET  /api/logo');
});