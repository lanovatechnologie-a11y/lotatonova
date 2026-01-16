const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// Base de données en mémoire
let users = [
    {
        id: 1,
        username: 'admin',
        password: 'admin123',
        name: 'Administrateur',
        role: 'admin'
    },
    {
        id: 2,
        username: 'agent',
        password: 'agent123',
        name: 'Agent Lotto',
        role: 'agent'
    }
];

let tickets = [];
let pendingTickets = [];
let winningTickets = [];
let multiDrawTickets = [];
let history = [];
let results = {
    'miami': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '123',
            lot2: '45',
            lot3: '34'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '892',
            lot2: '34',
            lot3: '56'
        }
    },
    'georgia': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '327',
            lot2: '45',
            lot3: '89'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '567',
            lot2: '12',
            lot3: '34'
        }
    },
    'newyork': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '892',
            lot2: '34',
            lot3: '56'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '123',
            lot2: '45',
            lot3: '67'
        }
    },
    'texas': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '567',
            lot2: '89',
            lot3: '01'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '234',
            lot2: '56',
            lot3: '78'
        }
    },
    'tunisia': {
        'morning': {
            date: new Date().toISOString(),
            lot1: '234',
            lot2: '56',
            lot3: '78'
        },
        'evening': {
            date: new Date().toISOString(),
            lot1: '345',
            lot2: '67',
            lot3: '89'
        }
    }
};

let companyInfo = {
    name: "Nova Lotto",
    phone: "+509 32 53 49 58",
    address: "Cap Haïtien",
    reportTitle: "Nova Lotto",
    reportPhone: "40104585"
};

// Middleware d'authentification simple
const authenticate = (req, res, next) => {
    const userId = req.headers['x-user-id'] || req.query.userId;
    
    if (!userId) {
        return res.status(401).json({ error: 'Utilisateur non authentifié' });
    }
    
    const user = users.find(u => u.id == userId);
    if (!user) {
        return res.status(401).json({ error: 'Utilisateur non trouvé' });
    }
    
    req.user = user;
    next();
};

// Routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Connexion simple
app.post('/api/auth/login', (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('Tentative de connexion:', username);
        
        const user = users.find(u => u.username === username && u.password === password);
        
        if (!user) {
            console.log('Échec connexion:', username);
            return res.status(401).json({ error: 'Identifiants incorrects' });
        }

        console.log('Connexion réussie:', user.name);
        
        res.json({
            token: 'simple-token-' + user.id,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Erreur de connexion:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Résultats
app.get('/api/results', (req, res) => {
    res.json({ results });
});

app.post('/api/results', authenticate, (req, res) => {
    const newResults = req.body.results;
    if (newResults) {
        results = { ...results, ...newResults };
        res.json({ message: 'Résultats mis à jour', results });
    } else {
        res.status(400).json({ error: 'Données de résultats invalides' });
    }
});

// Tickets - GET (avec filtrage par agent)
app.get('/api/tickets', authenticate, (req, res) => {
    const userTickets = tickets.filter(t => t.agentId == req.user.id);
    const nextTicketNumber = userTickets.length > 0 ? 
        Math.max(...userTickets.map(t => t.number)) + 1 : 1;
    
    res.json({ 
        tickets: userTickets,
        nextTicketNumber 
    });
});

// Tickets - POST
app.post('/api/tickets', authenticate, (req, res) => {
    try {
        const ticket = req.body;
        
        // Validation basique
        if (!ticket.bets || !Array.isArray(ticket.bets) || ticket.bets.length === 0) {
            return res.status(400).json({ error: 'Ticket invalide: pas de paris' });
        }
        
        // Calcul du total si non fourni
        if (!ticket.total) {
            ticket.total = ticket.bets.reduce((sum, bet) => sum + (bet.amount || 0), 0);
        }
        
        // Assigner les informations manquantes
        ticket.id = ticket.id || Date.now().toString();
        ticket.agentId = req.user.id;
        ticket.agentName = req.user.name;
        ticket.date = ticket.date || new Date().toISOString();
        
        // S'assurer que le numéro de ticket est unique
        const existingNumbers = tickets.map(t => t.number);
        if (existingNumbers.includes(ticket.number)) {
            ticket.number = Math.max(...existingNumbers, 0) + 1;
        }
        
        tickets.push(ticket);
        
        // Ajouter à l'historique
        history.push({
            id: Date.now(),
            date: new Date().toLocaleString(),
            draw: ticket.draw,
            drawTime: ticket.drawTime,
            bets: ticket.bets,
            total: ticket.total,
            agentName: ticket.agentName,
            agentId: ticket.agentId
        });
        
        console.log(`Ticket #${ticket.number} sauvegardé pour ${req.user.name}`);
        
        res.status(201).json({ 
            message: 'Ticket sauvegardé', 
            ticket,
            nextTicketNumber: ticket.number + 1
        });
    } catch (error) {
        console.error('Erreur sauvegarde ticket:', error);
        res.status(500).json({ error: 'Erreur sauvegarde ticket' });
    }
});

// Tickets en attente
app.get('/api/tickets/pending', authenticate, (req, res) => {
    const userPendingTickets = pendingTickets.filter(t => t.agentId == req.user.id);
    res.json({ tickets: userPendingTickets });
});

app.post('/api/tickets/pending', authenticate, (req, res) => {
    try {
        const ticket = req.body;
        ticket.id = ticket.id || Date.now().toString();
        ticket.agentId = req.user.id;
        ticket.agentName = req.user.name;
        ticket.date = ticket.date || new Date().toISOString();
        
        pendingTickets.push(ticket);
        res.status(201).json({ message: 'Ticket en attente sauvegardé', ticket });
    } catch (error) {
        console.error('Erreur sauvegarde ticket en attente:', error);
        res.status(500).json({ error: 'Erreur sauvegarde ticket en attente' });
    }
});

// Tickets gagnants
app.get('/api/tickets/winning', authenticate, (req, res) => {
    const userWinningTickets = winningTickets.filter(t => t.agentId == req.user.id);
    res.json({ tickets: userWinningTickets });
});

app.post('/api/tickets/winning', authenticate, (req, res) => {
    try {
        const ticket = req.body;
        ticket.id = ticket.id || Date.now().toString();
        ticket.agentId = req.user.id;
        ticket.agentName = req.user.name;
        
        winningTickets.push(ticket);
        res.status(201).json({ message: 'Ticket gagnant sauvegardé', ticket });
    } catch (error) {
        console.error('Erreur sauvegarde ticket gagnant:', error);
        res.status(500).json({ error: 'Erreur sauvegarde ticket gagnant' });
    }
});

// Historique
app.get('/api/history', authenticate, (req, res) => {
    const userHistory = history.filter(h => h.agentId == req.user.id);
    res.json({ history: userHistory });
});

app.post('/api/history', authenticate, (req, res) => {
    try {
        const historyRecord = req.body;
        historyRecord.id = historyRecord.id || Date.now();
        historyRecord.date = historyRecord.date || new Date().toLocaleString();
        historyRecord.agentId = req.user.id;
        historyRecord.agentName = req.user.name;
        
        history.push(historyRecord);
        res.status(201).json({ message: 'Historique sauvegardé', historyRecord });
    } catch (error) {
        console.error('Erreur sauvegarde historique:', error);
        res.status(500).json({ error: 'Erreur sauvegarde historique' });
    }
});

// Multi-draw tickets
app.get('/api/tickets/multi-draw', authenticate, (req, res) => {
    const userMultiDrawTickets = multiDrawTickets.filter(t => t.agentId == req.user.id);
    res.json({ tickets: userMultiDrawTickets });
});

app.post('/api/tickets/multi-draw', authenticate, (req, res) => {
    try {
        const ticket = req.body;
        ticket.id = ticket.id || Date.now().toString();
        ticket.agentId = req.user.id;
        ticket.agentName = req.user.name;
        ticket.date = ticket.date || new Date().toISOString();
        
        multiDrawTickets.push(ticket);
        res.status(201).json({ message: 'Ticket multi-tirages sauvegardé', ticket });
    } catch (error) {
        console.error('Erreur sauvegarde ticket multi-tirages:', error);
        res.status(500).json({ error: 'Erreur sauvegarde ticket multi-tirages' });
    }
});

// Vérification des gagnants
app.post('/api/check-winners', authenticate, (req, res) => {
    try {
        const { draw, drawTime } = req.body;
        const result = results[draw]?.[drawTime];
        
        if (!result) {
            return res.status(404).json({ error: 'Résultat non trouvé' });
        }
        
        // Vérifier les tickets gagnants
        const allTickets = [...tickets, ...pendingTickets];
        const winningTicketsFound = [];
        
        allTickets.forEach(ticket => {
            if (ticket.draw === draw && ticket.drawTime === drawTime) {
                const winningBets = [];
                let totalWinnings = 0;
                
                ticket.bets.forEach(bet => {
                    const winAmount = checkBetWin(bet, result);
                    if (winAmount > 0) {
                        winningBets.push({
                            ...bet,
                            winAmount,
                            winType: 'Gagnant'
                        });
                        totalWinnings += winAmount;
                    }
                });
                
                if (winningBets.length > 0) {
                    winningTicketsFound.push({
                        ...ticket,
                        winningBets,
                        totalWinnings,
                        result
                    });
                }
            }
        });
        
        res.json({ 
            winningTickets: winningTicketsFound,
            count: winningTicketsFound.length
        });
    } catch (error) {
        console.error('Erreur vérification gagnants:', error);
        res.status(500).json({ error: 'Erreur vérification gagnants' });
    }
});

// Informations de l'entreprise
app.get('/api/company-info', (req, res) => {
    res.json(companyInfo);
});

app.post('/api/company-info', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    companyInfo = { ...companyInfo, ...req.body };
    res.json({ message: 'Informations mises à jour', companyInfo });
});

// Logo
app.get('/api/logo', (req, res) => {
    // Logo par défaut
    res.json({ 
        logoUrl: '/logo-borlette.jpg'
    });
});

// Route pour obtenir tous les tickets (admin seulement)
app.get('/api/all-tickets', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    res.json({ 
        tickets,
        pendingTickets,
        winningTickets,
        multiDrawTickets,
        history
    });
});

// Route pour ajouter un utilisateur (admin seulement)
app.post('/api/users', authenticate, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès non autorisé' });
    }
    
    const { username, password, name, role } = req.body;
    
    if (!username || !password || !name) {
        return res.status(400).json({ error: 'Données utilisateur incomplètes' });
    }
    
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
        return res.status(400).json({ error: 'Utilisateur déjà existant' });
    }
    
    const newUser = {
        id: users.length + 1,
        username,
        password,
        name,
        role: role || 'agent'
    };
    
    users.push(newUser);
    res.status(201).json({ message: 'Utilisateur créé', user: newUser });
});

// Route pour réinitialiser les données (développement uniquement)
app.post('/api/reset', (req, res) => {
    tickets = [];
    pendingTickets = [];
    winningTickets = [];
    multiDrawTickets = [];
    history = [];
    
    res.json({ message: 'Données réinitialisées' });
});

// Fonction utilitaire pour vérifier les gains
function checkBetWin(bet, result) {
    const lot1 = result.lot1;
    const lot2 = result.lot2;
    const lot3 = result.lot3;
    const lot1Last2 = lot1.substring(1);
    
    switch(bet.type) {
        case 'borlette':
            if (bet.number === lot1Last2) return bet.amount * 60;
            if (bet.number === lot2) return bet.amount * 20;
            if (bet.number === lot3) return bet.amount * 10;
            break;
        case 'boulpe':
            if (bet.number === lot1Last2) return bet.amount * 60;
            if (bet.number === lot2) return bet.amount * 20;
            if (bet.number === lot3) return bet.amount * 10;
            break;
        case 'lotto3':
            if (bet.number === lot1) return bet.amount * 500;
            break;
        case 'lotto4':
            // Logique Lotto 4 simplifiée
            if (bet.options?.option1 && bet.number === (lot2 + lot3)) return bet.perOptionAmount * 5000;
            if (bet.options?.option2 && bet.number === (lot1Last2 + lot2)) return bet.perOptionAmount * 5000;
            // Option 3: arrangement quelconque
            if (bet.options?.option3) {
                const betDigits = bet.number.split('');
                const lot2Digits = lot2.split('');
                const lot3Digits = lot3.split('');
                
                const tempDigits = [...betDigits];
                let containsLot2 = true;
                let containsLot3 = true;
                
                for (const digit of lot2Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot2 = false;
                        break;
                    }
                    tempDigits.splice(index, 1);
                }
                
                for (const digit of lot3Digits) {
                    const index = tempDigits.indexOf(digit);
                    if (index === -1) {
                        containsLot3 = false;
                        break;
                    }
                    tempDigits.splice(index, 1);
                }
                
                if (containsLot2 && containsLot3) {
                    return bet.perOptionAmount * 5000;
                }
            }
            break;
        case 'lotto5':
            // Logique Lotto 5 simplifiée
            if (bet.options?.option1 && bet.number === (lot1 + lot2)) return bet.perOptionAmount * 25000;
            if (bet.options?.option2 && bet.number === (lot1 + lot3)) return bet.perOptionAmount * 25000;
            // Option 3: arrangement quelconque
            if (bet.options?.option3) {
                const allResultDigits = (lot1 + lot2 + lot3).split('');
                const betDigits = bet.number.split('');
                
                let allFound = true;
                const tempResultDigits = [...allResultDigits];
                
                for (const digit of betDigits) {
                    const index = tempResultDigits.indexOf(digit);
                    if (index === -1) {
                        allFound = false;
                        break;
                    }
                    tempResultDigits.splice(index, 1);
                }
                
                if (allFound) {
                    return bet.perOptionAmount * 25000;
                }
            }
            break;
        case 'marriage':
        case 'auto-marriage':
            const [num1, num2] = bet.number.split('*');
            const numbers = [lot1Last2, lot2, lot3];
            
            if (numbers.includes(num1) && numbers.includes(num2)) {
                return bet.amount * 1000;
            }
            break;
        case 'grap':
            if (lot1[0] === lot1[1] && lot1[1] === lot1[2]) {
                if (bet.number === lot1) {
                    return bet.amount * 500;
                }
            }
            break;
        case 'auto-lotto4':
            const lotto4Digits = bet.number.split('');
            const autoLot2Digits = lot2.split('');
            const autoLot3Digits = lot3.split('');
            
            const autoTempDigits = [...lotto4Digits];
            let autoContainsLot2 = true;
            let autoContainsLot3 = true;
            
            for (const digit of autoLot2Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot2 = false;
                    break;
                }
                autoTempDigits.splice(index, 1);
            }
            
            for (const digit of autoLot3Digits) {
                const index = autoTempDigits.indexOf(digit);
                if (index === -1) {
                    autoContainsLot3 = false;
                    break;
                }
                autoTempDigits.splice(index, 1);
            }
            
            if (autoContainsLot2 && autoContainsLot3) {
                return bet.amount * 5000;
            }
            break;
    }
    
    return 0;
}

// Route pour servir les fichiers statiques
app.get('*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Gestion des erreurs globales
app.use((err, req, res, next) => {
    console.error('Erreur serveur:', err);
    res.status(500).json({ error: 'Erreur interne du serveur' });
});

app.listen(PORT, () => {
    console.log(`Serveur Nova Lotto démarré sur le port ${PORT}`);
    console.log(`URL: http://localhost:${PORT}`);
    console.log('Utilisateurs disponibles:');
    users.forEach(user => {
        console.log(`  - ${user.username} (${user.role}): ${user.password}`);
    });
});