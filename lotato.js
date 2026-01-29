const API_BASE_URL = window.location.origin; // Utilise l'origine actuelle
let currentToken = null;
let currentUser = null;
let currentDraw = 'miami';
let currentDrawTime = 'morning';
let activeBets = [];
let currentMultiDrawTicket = {
    bets: [],
    draws: new Set(),
    totalAmount: 0
};
let isMultiDrawMode = false;
let nextTicketNumber = 100001;
let pendingTickets = [];

// Initialisation de l'application
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎰 LOTATO Agent Interface initialisée');
    
    // Vérifier le token d'authentification
    checkAuth();
    
    // Configurer les événements
    setupEventListeners();
    
    // Mettre à jour l'heure
    updateTime();
    setInterval(updateTime, 60000);
    
    // Vérifier la connexion périodiquement
    setInterval(checkConnection, 30000);
});

// Vérifier l'authentification
async function checkAuth() {
    // Récupérer le token de l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    // Vérifier si on a un token dans l'URL ou dans le localStorage
    let token = tokenFromUrl || localStorage.getItem('nova_token');
    
    if (!token) {
        showLoginScreen();
        return;
    }
    
    try {
        // Vérifier le token avec le serveur
        const response = await fetch(`${API_BASE_URL}/api/auth/check`, {
            headers: {
                'x-auth-token': token
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Token valide
            currentToken = token;
            currentUser = data.admin;
            localStorage.setItem('nova_token', token);
            localStorage.setItem('nova_user_data', JSON.stringify(currentUser));
            
            // Cacher l'écran de connexion et afficher l'interface principale
            hideLoginScreen();
            
            // Charger les données initiales
            loadInitialData();
            
            // Afficher l'interface principale
            document.getElementById('main-container').style.display = 'block';
            document.getElementById('bottom-nav').style.display = 'flex';
            
            // Configurer le panneau d'administration
            if (currentUser.role === 'agent') {
                setupAdminPanel();
            }
            
        } else {
            // Token invalide
            localStorage.removeItem('nova_token');
            localStorage.removeItem('nova_user_data');
            showLoginScreen();
        }
    } catch (error) {
        console.error('Erreur vérification token:', error);
        showLoginScreen();
    }
}

// Afficher l'écran de connexion
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'none';
}

// Cacher l'écran de connexion
function hideLoginScreen() {
    document.getElementById('login-screen').style.display = 'none';
}

// Configurer les événements
function setupEventListeners() {
    // Événements de connexion
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            showScreen(screen);
        });
    });
    
    // Sélection des tirages
    document.querySelectorAll('.draw-card').forEach(card => {
        card.addEventListener('click', function() {
            const draw = this.getAttribute('data-draw');
            selectDraw(draw);
        });
    });
    
    // Sélection du moment du tirage
    document.querySelectorAll('.draw-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const time = this.getAttribute('data-time');
            selectDrawTime(time);
        });
    });
    
    // Boutons de navigation
    document.getElementById('back-button').addEventListener('click', function() {
        hideBettingScreen();
    });
    
    document.getElementById('back-from-report').addEventListener('click', function() {
        hideReportScreen();
    });
    
    document.getElementById('back-from-results').addEventListener('click', function() {
        hideResultsCheckScreen();
    });
    
    document.getElementById('back-from-multi-tickets').addEventListener('click', function() {
        hideMultiTicketsScreen();
    });
    
    // Boutons d'action
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('open-results-check').addEventListener('click', showResultsCheckScreen);
    document.getElementById('open-multi-tickets').addEventListener('click', showMultiTicketsScreen);
    document.getElementById('save-print-ticket').addEventListener('click', saveAndPrintTicket);
    document.getElementById('confirm-bet-top').addEventListener('click', confirmBet);
    
    // Multi-tirages
    document.getElementById('multi-draw-toggle').addEventListener('click', toggleMultiDrawPanel);
    document.getElementById('add-to-multi-draw').addEventListener('click', addToMultiDrawTicket);
    document.getElementById('view-current-multi-ticket').addEventListener('click', showCurrentMultiTicket);
    document.getElementById('save-print-multi-ticket').addEventListener('click', saveAndPrintMultiDrawTicket);
    
    // Vérification des gagnants
    document.getElementById('check-winners-btn').addEventListener('click', checkWinners);
    
    // Événements de déconnexion
    document.addEventListener('keydown', function(e) {
        // Ctrl + Alt + L pour déconnexion
        if (e.ctrlKey && e.altKey && e.key === 'l') {
            logout();
        }
    });
}

// Gestion de la connexion
async function handleLogin() {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;
    
    if (!username || !password) {
        showLoginError('Veuillez remplir tous les champs');
        return;
    }
    
    // Afficher l'écran de vérification de connexion
    document.getElementById('connection-check').style.display = 'flex';
    document.getElementById('login-screen').style.display = 'none';
    
    // Vérifier la connexion Internet
    if (!navigator.onLine) {
        updateConnectionStatus('internet', false, 'Pa konekte');
        updateConnectionStatus('server', false, 'Pa konekte');
        updateConnectionStatus('supabase', false, 'Pa konekte');
        document.getElementById('connection-message').textContent = 'Pa gen koneksyon entènèt. Tanpri konekte ou nan entènèt epi eseye ankò.';
        document.getElementById('retry-connection').style.display = 'block';
        return;
    }
    
    updateConnectionStatus('internet', true, 'Konekte');
    
    try {
        // Vérifier la connexion au serveur
        const healthResponse = await fetch(`${API_BASE_URL}/api/health`);
        if (healthResponse.ok) {
            updateConnectionStatus('server', true, 'Konekte');
        } else {
            updateConnectionStatus('server', false, 'Pa konekte');
            throw new Error('Server not responding');
        }
        
        // Connexion à l'API
        const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password,
                role: 'agent'
            })
        });
        
        const data = await loginResponse.json();
        
        if (data.success) {
            // Connexion réussie
            currentToken = data.token;
            currentUser = data.user;
            localStorage.setItem('nova_token', data.token);
            localStorage.setItem('nova_user_data', JSON.stringify(data.user));
            
            // Redirection vers l'interface agent
            window.location.href = data.redirectUrl;
            
        } else {
            // Échec de la connexion
            updateConnectionStatus('server', false, 'Erè otantifikasyon');
            document.getElementById('connection-message').textContent = 'Non itilizatè oswa modpas pa kòrèk.';
            document.getElementById('retry-connection').style.display = 'block';
        }
        
    } catch (error) {
        console.error('Erreur connexion:', error);
        updateConnectionStatus('server', false, 'Erè koneksyon');
        document.getElementById('connection-message').textContent = 'Erè koneksyon sèvè. Tanpri tcheke koneksyon ou epi eseye ankò.';
        document.getElementById('retry-connection').style.display = 'block';
    }
}

// Mettre à jour le statut de connexion
function updateConnectionStatus(type, connected, text) {
    const statusElement = document.getElementById(`${type}-status`);
    const textElement = document.getElementById(`${type}-text`);
    
    if (connected) {
        statusElement.className = 'status-indicator connected';
        textElement.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${text}`;
    } else {
        statusElement.className = 'status-indicator disconnected';
        textElement.textContent = `${type.charAt(0).toUpperCase() + type.slice(1)}: ${text}`;
    }
}

// Afficher l'erreur de connexion
function showLoginError(message) {
    const errorElement = document.getElementById('login-error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
        errorElement.style.display = 'none';
    }, 3000);
}

// Mettre à jour l'heure
function updateTime() {
    const now = new Date();
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    
    const dayName = days[now.getDay()];
    const day = now.getDate();
    const month = months[now.getMonth()];
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    
    document.getElementById('current-time').textContent = `${dayName}, ${day} ${month} - ${hours}:${minutes}`;
}

// Vérifier la connexion
async function checkConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (response.ok) {
            updateSyncStatus('connected', 'Konekte');
        } else {
            updateSyncStatus('disconnected', 'Pa konekte');
        }
    } catch (error) {
        updateSyncStatus('disconnected', 'Pa konekte');
    }
}

// Mettre à jour le statut de synchronisation
function updateSyncStatus(status, text) {
    const syncElement = document.getElementById('sync-status');
    const textElement = document.getElementById('sync-text');
    
    syncElement.style.display = 'flex';
    syncElement.className = `sync-status sync-${status}`;
    textElement.textContent = text;
}

// Configurer le panneau d'administration
function setupAdminPanel() {
    const adminPanel = document.getElementById('admin-panel');
    const adminMenuBtn = document.getElementById('admin-menu-btn');
    
    if (currentUser.role === 'agent') {
        adminPanel.style.display = 'block';
        
        adminMenuBtn.addEventListener('click', function() {
            showAdminMenu();
        });
    }
}

// Afficher le menu d'administration
function showAdminMenu() {
    // Créer un menu contextuel
    const menu = document.createElement('div');
    menu.className = 'admin-context-menu';
    menu.innerHTML = `
        <div class="admin-menu-item" onclick="showScreen('history')">
            <i class="fas fa-history"></i> Istorik
        </div>
        <div class="admin-menu-item" onclick="showScreen('ticket-management')">
            <i class="fas fa-file-invoice"></i> Jere fich yo
        </div>
        <div class="admin-menu-item" onclick="showScreen('winning-tickets')">
            <i class="fas fa-trophy"></i> Fich ki genyen
        </div>
        <div class="admin-menu-item" onclick="syncPendingTickets()">
            <i class="fas fa-sync-alt"></i> Senkronize fich
        </div>
        <div class="admin-menu-item" onclick="logout()">
            <i class="fas fa-sign-out-alt"></i> Dekonekte
        </div>
    `;
    
    // Positionner le menu
    const rect = document.getElementById('admin-menu-btn').getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.top - 200}px`;
    menu.style.right = '10px';
    menu.style.zIndex = '2000';
    
    // Ajouter au document
    document.body.appendChild(menu);
    
    // Fermer le menu en cliquant ailleurs
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target) && e.target !== document.getElementById('admin-menu-btn')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 100);
}

// Afficher un écran
function showScreen(screenId) {
    // Cacher tous les écrans
    const screens = ['home', 'winning-tickets', 'history', 'ticket-management'];
    screens.forEach(screen => {
        const element = document.getElementById(`${screen}-screen`);
        if (element) {
            element.style.display = 'none';
        }
    });
    
    // Cacher l'écran principal si nécessaire
    if (screenId !== 'home') {
        document.getElementById('main-container').style.display = 'none';
    } else {
        document.getElementById('main-container').style.display = 'block';
    }
    
    // Afficher l'écran demandé
    const screenElement = document.getElementById(`${screenId}-screen`);
    if (screenElement) {
        screenElement.style.display = 'block';
    }
    
    // Mettre à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        if (item.getAttribute('data-screen') === screenId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Charger les données spécifiques à l'écran
    switch(screenId) {
        case 'history':
            loadHistory();
            break;
        case 'ticket-management':
            loadTicketManagement();
            break;
        case 'winning-tickets':
            loadWinningTickets();
            break;
    }
}

// Charger les données initiales
async function loadInitialData() {
    try {
        // Charger les tickets
        const ticketsResponse = await fetch(`${API_BASE_URL}/api/tickets`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const ticketsData = await ticketsResponse.json();
        
        if (ticketsData.success) {
            nextTicketNumber = ticketsData.nextTicketNumber;
            pendingTickets = ticketsData.tickets.filter(ticket => !ticket.is_synced);
            
            // Mettre à jour le badge de tickets en attente
            updatePendingBadge();
        }
        
        // Charger les résultats
        await loadResults();
        
        // Charger les informations de l'entreprise
        await loadCompanyInfo();
        
        // Vérifier la connexion
        checkConnection();
        
    } catch (error) {
        console.error('Erreur chargement données initiales:', error);
    }
}

// Charger les résultats
async function loadResults() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/results`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateResultsDisplay(data.results);
        }
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
    }
}

// Mettre à jour l'affichage des résultats
function updateResultsDisplay(results) {
    const resultsGrid = document.querySelector('.results-grid');
    if (!resultsGrid) return;
    
    // Mettre à jour chaque carte de résultat
    document.querySelectorAll('.result-card').forEach(card => {
        const drawName = card.querySelector('h4').textContent.toLowerCase();
        const resultNumber = card.querySelector('.result-number');
        
        if (results[drawName] && results[drawName]['morning']) {
            const morningResult = results[drawName]['morning'];
            resultNumber.textContent = morningResult.lot1 || '---';
        } else {
            resultNumber.textContent = '---';
        }
    });
}

// Charger les informations de l'entreprise
async function loadCompanyInfo() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/company-info`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Mettre à jour le logo si nécessaire
            const logoResponse = await fetch(`${API_BASE_URL}/api/logo`, {
                headers: {
                    'x-auth-token': currentToken
                }
            });
            
            const logoData = await logoResponse.json();
            
            if (logoData.success) {
                document.getElementById('company-logo').src = logoData.logoUrl;
                document.getElementById('ticket-logo').src = logoData.logoUrl;
            }
        }
    } catch (error) {
        console.error('Erreur chargement info entreprise:', error);
    }
}

// Sélectionner un tirage
function selectDraw(draw) {
    currentDraw = draw;
    
    // Mettre à jour l'interface
    document.querySelectorAll('.draw-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    document.querySelector(`.draw-card[data-draw="${draw}"]`).classList.add('selected');
    
    // Afficher l'écran des paris
    showBettingScreen();
}

// Sélectionner le moment du tirage
function selectDrawTime(time) {
    currentDrawTime = time;
    
    // Mettre à jour l'interface
    document.querySelectorAll('.draw-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.querySelectorAll(`.draw-btn[data-time="${time}"]`).forEach(btn => {
        btn.classList.add('active');
    });
}

// Afficher l'écran des paris
function showBettingScreen() {
    document.getElementById('betting-screen').style.display = 'block';
    document.getElementById('main-container').style.display = 'none';
    
    // Mettre à jour le titre
    const drawNames = {
        'miami': 'Miami',
        'georgia': 'Georgia',
        'newyork': 'New York',
        'texas': 'Texas',
        'tunisia': 'Tunisie'
    };
    
    document.getElementById('betting-title').textContent = 
        `${drawNames[currentDraw]} - ${currentDrawTime === 'morning' ? 'Matin' : 'Soir'}`;
    
    // Charger les jeux disponibles
    loadGames();
}

// Cacher l'écran des paris
function hideBettingScreen() {
    document.getElementById('betting-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
}

// Charger les jeux
function loadGames() {
    // Pour l'instant, nous utilisons l'interface statique
    // Dans une version complète, on chargerait les jeux depuis l'API
    
    // Configurer les événements pour les jeux
    document.querySelectorAll('.game-item').forEach(game => {
        game.addEventListener('click', function() {
            const gameType = this.getAttribute('data-game');
            selectGame(gameType);
        });
    });
}

// Sélectionner un jeu
function selectGame(gameType) {
    // Afficher le formulaire approprié
    loadBetForm(gameType);
}

// Charger le formulaire de pari
function loadBetForm(gameType) {
    const formContainer = document.getElementById('bet-form');
    
    // Nettoyer le formulaire précédent
    formContainer.innerHTML = '';
    
    // Créer le formulaire selon le type de jeu
    let formHTML = '';
    
    switch(gameType) {
        case 'borlette':
        case 'boulpe':
            formHTML = createBorletteForm(gameType);
            break;
        case 'lotto3':
            formHTML = createLotto3Form();
            break;
        case 'lotto4':
            formHTML = createLotto4Form();
            break;
        case 'lotto5':
            formHTML = createLotto5Form();
            break;
        case 'grap':
            formHTML = createGrapForm();
            break;
        case 'marriage':
        case 'auto-marriage':
            formHTML = createMarriageForm(gameType);
            break;
        case 'auto-lotto4':
            formHTML = createAutoLotto4Form();
            break;
    }
    
    formContainer.innerHTML = formHTML;
    
    // Configurer les événements du formulaire
    setupBetFormEvents(gameType);
}

// Créer le formulaire Borlette
function createBorletteForm(gameType) {
    return `
        <h3>${gameType === 'borlette' ? 'BORLETTE' : 'BOUL PE'}</h3>
        <div class="form-group">
            <label for="borlette-number">Nimewo (2 chif)</label>
            <input type="text" id="borlette-number" placeholder="00 a 99" maxlength="2" pattern="[0-9]{2}">
        </div>
        <div class="form-group">
            <label for="borlette-amount">Kantite (HTG)</label>
            <input type="number" id="borlette-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-borlette-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Lotto 3
function createLotto3Form() {
    return `
        <h3>LOTO 3</h3>
        <div class="form-group">
            <label for="lotto3-number">Nimewo (3 chif)</label>
            <input type="text" id="lotto3-number" placeholder="000 a 999" maxlength="3" pattern="[0-9]{3}">
        </div>
        <div class="form-group">
            <label for="lotto3-amount">Kantite (HTG)</label>
            <input type="number" id="lotto3-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-lotto3-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Lotto 4
function createLotto4Form() {
    return `
        <h3>LOTO 4</h3>
        <div class="form-group">
            <label for="lotto4-number">Nimewo (4 chif)</label>
            <input type="text" id="lotto4-number" placeholder="0000 a 9999" maxlength="4" pattern="[0-9]{4}">
        </div>
        <div class="form-group">
            <label for="lotto4-amount">Kantite (HTG)</label>
            <input type="number" id="lotto4-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="options-container">
            <h4>Opsyon</h4>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto4-option1" value="option1">
                <label for="lotto4-option1">Opsyon 1 (×5000)</label>
                <span class="option-multiplier">×5000</span>
            </div>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto4-option2" value="option2">
                <label for="lotto4-option2">Opsyon 2 (×2500)</label>
                <span class="option-multiplier">×2500</span>
            </div>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto4-option3" value="option3">
                <label for="lotto4-option3">Opsyon 3 (×1000)</label>
                <span class="option-multiplier">×1000</span>
            </div>
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-lotto4-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Lotto 5
function createLotto5Form() {
    return `
        <h3>LOTO 5</h3>
        <div class="form-group">
            <label for="lotto5-number">Nimewo (5 chif)</label>
            <input type="text" id="lotto5-number" placeholder="00000 a 99999" maxlength="5" pattern="[0-9]{5}">
        </div>
        <div class="form-group">
            <label for="lotto5-amount">Kantite (HTG)</label>
            <input type="number" id="lotto5-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="options-container">
            <h4>Opsyon</h4>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto5-option1" value="option1">
                <label for="lotto5-option1">Opsyon 1 (×25000)</label>
                <span class="option-multiplier">×25000</span>
            </div>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto5-option2" value="option2">
                <label for="lotto5-option2">Opsyon 2 (×12500)</label>
                <span class="option-multiplier">×12500</span>
            </div>
            <div class="option-checkbox">
                <input type="checkbox" id="lotto5-option3" value="option3">
                <label for="lotto5-option3">Opsyon 3 (×5000)</label>
                <span class="option-multiplier">×5000</span>
            </div>
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-lotto5-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Grap
function createGrapForm() {
    return `
        <h3>GRAP</h3>
        <div class="form-group">
            <label for="grap-number">Nimewo (3 chif menm)</label>
            <input type="text" id="grap-number" placeholder="111, 222, ..." maxlength="3" pattern="[0-9]{3}">
        </div>
        <div class="form-group">
            <label for="grap-amount">Kantite (HTG)</label>
            <input type="number" id="grap-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-grap-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Marriage
function createMarriageForm(gameType) {
    const isAuto = gameType === 'auto-marriage';
    
    return `
        <h3>${isAuto ? 'MARYAJ OTOMATIK' : 'MARYAJ'}</h3>
        <div class="form-group">
            <label for="marriage-numbers">Nimewo (2 chif separe pa *)</label>
            <input type="text" id="marriage-numbers" placeholder="${isAuto ? 'Chwazi otomatikman' : '12*34'}" ${isAuto ? 'readonly' : ''}>
        </div>
        <div class="form-group">
            <label for="marriage-amount">Kantite (HTG)</label>
            <input type="number" id="marriage-amount" placeholder="Kantite" min="1" value="1">
        </div>
        ${isAuto ? `
            <div class="auto-buttons">
                <button type="button" class="auto-btn" id="generate-auto-marriage">Jenere Maryaj Otomatik</button>
            </div>
        ` : ''}
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-marriage-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Créer le formulaire Lotto 4 Automatique
function createAutoLotto4Form() {
    return `
        <h3>LOTO 4 OTOMATIK</h3>
        <div class="form-group">
            <label for="auto-lotto4-count">Kantite nimewo jenere</label>
            <input type="number" id="auto-lotto4-count" placeholder="Kantite nimewo" min="1" max="10" value="3">
        </div>
        <div class="form-group">
            <label for="auto-lotto4-amount">Kantite pa nimewo (HTG)</label>
            <input type="number" id="auto-lotto4-amount" placeholder="Kantite" min="1" value="1">
        </div>
        <div class="auto-buttons">
            <button type="button" class="auto-btn" id="generate-auto-lotto4">Jenere Nimewo Otomatik</button>
            <button type="button" class="auto-btn reverse" id="reverse-auto-lotto4">Jenere Nimewo Renvèse</button>
        </div>
        <div class="bet-actions">
            <button type="button" class="btn-primary" id="add-auto-lotto4-bet">Ajoute Parye</button>
            <button type="button" class="btn-secondary" id="clear-form">Netwaye</button>
        </div>
    `;
}

// Configurer les événements du formulaire
function setupBetFormEvents(gameType) {
    // Bouton d'ajout de pari
    const addButton = document.querySelector('#bet-form button.btn-primary');
    if (addButton) {
        addButton.addEventListener('click', function() {
            addBet(gameType);
        });
    }
    
    // Bouton de nettoyage
    const clearButton = document.querySelector('#bet-form button.btn-secondary');
    if (clearButton) {
        clearButton.addEventListener('click', function() {
            document.getElementById('bet-form').innerHTML = '';
        });
    }
    
    // Boutons automatiques
    if (gameType === 'auto-marriage') {
        document.getElementById('generate-auto-marriage')?.addEventListener('click', generateAutoMarriage);
    }
    
    if (gameType === 'auto-lotto4') {
        document.getElementById('generate-auto-lotto4')?.addEventListener('click', generateAutoLotto4);
        document.getElementById('reverse-auto-lotto4')?.addEventListener('click', generateReverseLotto4);
    }
}

// Ajouter un pari
function addBet(gameType) {
    let betData = null;
    
    switch(gameType) {
        case 'borlette':
        case 'boulpe':
            betData = getBorletteBetData(gameType);
            break;
        case 'lotto3':
            betData = getLotto3BetData();
            break;
        case 'lotto4':
            betData = getLotto4BetData();
            break;
        case 'lotto5':
            betData = getLotto5BetData();
            break;
        case 'grap':
            betData = getGrapBetData();
            break;
        case 'marriage':
        case 'auto-marriage':
            betData = getMarriageBetData(gameType);
            break;
        case 'auto-lotto4':
            betData = getAutoLotto4BetData();
            break;
    }
    
    if (betData) {
        activeBets.push(betData);
        updateActiveBetsDisplay();
        showTotalNotification();
        
        // Nettoyer le formulaire
        document.getElementById('bet-form').innerHTML = '';
    }
}

// Obtenir les données du pari Borlette
function getBorletteBetData(gameType) {
    const number = document.getElementById('borlette-number').value;
    const amount = parseInt(document.getElementById('borlette-amount').value) || 1;
    
    if (!number || number.length !== 2 || !/^\d{2}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 2 chif (00 a 99)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    const multiplier = gameType === 'borlette' ? 60 : 60; // Boul Pe a le même multiplicateur
    
    return {
        type: gameType,
        name: gameType === 'borlette' ? 'Borlette' : 'Boul Pe',
        number: number,
        amount: amount,
        multiplier: multiplier,
        options: {},
        isLotto4: false,
        isLotto5: false,
        isAuto: false,
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Lotto 3
function getLotto3BetData() {
    const number = document.getElementById('lotto3-number').value;
    const amount = parseInt(document.getElementById('lotto3-amount').value) || 1;
    
    if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 3 chif (000 a 999)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        type: 'lotto3',
        name: 'Loto 3',
        number: number,
        amount: amount,
        multiplier: 500,
        options: {},
        isLotto4: false,
        isLotto5: false,
        isAuto: false,
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Lotto 4
function getLotto4BetData() {
    const number = document.getElementById('lotto4-number').value;
    const amount = parseInt(document.getElementById('lotto4-amount').value) || 1;
    
    if (!number || number.length !== 4 || !/^\d{4}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 4 chif (0000 a 9999)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    // Récupérer les options sélectionnées
    const options = [];
    if (document.getElementById('lotto4-option1')?.checked) options.push('option1');
    if (document.getElementById('lotto4-option2')?.checked) options.push('option2');
    if (document.getElementById('lotto4-option3')?.checked) options.push('option3');
    
    if (options.length === 0) {
        alert('Tanpri chwazi omwen yon opsyon');
        return null;
    }
    
    // Calculer le multiplicateur selon les options
    let multiplier = 0;
    if (options.includes('option1')) multiplier += 5000;
    if (options.includes('option2')) multiplier += 2500;
    if (options.includes('option3')) multiplier += 1000;
    
    return {
        type: 'lotto4',
        name: 'Loto 4',
        number: number,
        amount: amount,
        multiplier: multiplier,
        options: { selectedOptions: options },
        isLotto4: true,
        isLotto5: false,
        isAuto: false,
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Lotto 5
function getLotto5BetData() {
    const number = document.getElementById('lotto5-number').value;
    const amount = parseInt(document.getElementById('lotto5-amount').value) || 1;
    
    if (!number || number.length !== 5 || !/^\d{5}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 5 chif (00000 a 99999)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    // Récupérer les options sélectionnées
    const options = [];
    if (document.getElementById('lotto5-option1')?.checked) options.push('option1');
    if (document.getElementById('lotto5-option2')?.checked) options.push('option2');
    if (document.getElementById('lotto5-option3')?.checked) options.push('option3');
    
    if (options.length === 0) {
        alert('Tanpri chwazi omwen yon opsyon');
        return null;
    }
    
    // Calculer le multiplicateur selon les options
    let multiplier = 0;
    if (options.includes('option1')) multiplier += 25000;
    if (options.includes('option2')) multiplier += 12500;
    if (options.includes('option3')) multiplier += 5000;
    
    return {
        type: 'lotto5',
        name: 'Loto 5',
        number: number,
        amount: amount,
        multiplier: multiplier,
        options: { selectedOptions: options },
        isLotto4: false,
        isLotto5: true,
        isAuto: false,
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Grap
function getGrapBetData() {
    const number = document.getElementById('grap-number').value;
    const amount = parseInt(document.getElementById('grap-amount').value) || 1;
    
    if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 3 chif (000 a 999)');
        return null;
    }
    
    // Vérifier que c'est un grap (tous les chiffres identiques)
    if (number[0] !== number[1] || number[1] !== number[2]) {
        alert('Yon grap dwe gen 3 chif menm (111, 222, ...)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        type: 'grap',
        name: 'Grap',
        number: number,
        amount: amount,
        multiplier: 500,
        options: {},
        isLotto4: false,
        isLotto5: false,
        isAuto: false,
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Marriage
function getMarriageBetData(gameType) {
    let numbers = document.getElementById('marriage-numbers').value;
    const amount = parseInt(document.getElementById('marriage-amount').value) || 1;
    
    if (gameType === 'auto-marriage' && (!numbers || numbers === '')) {
        alert('Tanpri jenere nimewo yo anvan');
        return null;
    }
    
    if (!numbers || !numbers.includes('*')) {
        alert('Tanpri antre 2 nimewo separe pa * (egzanp: 12*34)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        type: 'marriage',
        name: gameType === 'auto-marriage' ? 'Maryaj Otomatik' : 'Maryaj',
        number: numbers,
        amount: amount,
        multiplier: 1000,
        options: {},
        isLotto4: false,
        isLotto5: false,
        isAuto: gameType === 'auto-marriage',
        isGroup: false,
        details: {}
    };
}

// Obtenir les données du pari Lotto 4 Automatique
function getAutoLotto4BetData() {
    const count = parseInt(document.getElementById('auto-lotto4-count').value) || 3;
    const amount = parseInt(document.getElementById('auto-lotto4-amount').value) || 1;
    
    if (count <= 0 || count > 10) {
        alert('Kantite nimewo a dwe ant 1 ak 10');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    // Générer les nombres automatiquement
    const numbers = generateAutoLotto4Numbers(count);
    
    return {
        type: 'lotto4',
        name: 'Loto 4 Otomatik',
        number: numbers.join(','),
        amount: amount,
        multiplier: 5000,
        options: { autoGenerated: true, count: count },
        isLotto4: true,
        isLotto5: false,
        isAuto: true,
        isGroup: true,
        details: { numbers: numbers }
    };
}

// Générer un marriage automatique
function generateAutoMarriage() {
    // Générer 2 nombres aléatoires différents entre 0 et 99
    const num1 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    let num2;
    do {
        num2 = Math.floor(Math.random() * 100).toString().padStart(2, '0');
    } while (num2 === num1);
    
    document.getElementById('marriage-numbers').value = `${num1}*${num2}`;
}

// Générer des numéros Lotto 4 automatiques
function generateAutoLotto4Numbers(count) {
    const numbers = [];
    for (let i = 0; i < count; i++) {
        const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        numbers.push(num);
    }
    return numbers;
}

// Générer des numéros Lotto 4 automatiques
function generateAutoLotto4() {
    const count = parseInt(document.getElementById('auto-lotto4-count').value) || 3;
    const numbers = generateAutoLotto4Numbers(count);
    
    // Afficher les nombres générés
    alert(`Nimewo jenere otomatikman:\n${numbers.join('\n')}`);
    
    // Les nombres seront utilisés lors de l'ajout du pari
}

// Générer des numéros Lotto 4 renversés
function generateReverseLotto4() {
    const count = parseInt(document.getElementById('auto-lotto4-count').value) || 3;
    const numbers = [];
    
    for (let i = 0; i < count; i++) {
        const num = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const reversed = num.split('').reverse().join('');
        numbers.push(`${num}/${reversed}`);
    }
    
    // Afficher les nombres générés
    alert(`Nimewo renvèse jenere otomatikman:\n${numbers.join('\n')}`);
}

// Mettre à jour l'affichage des paris actifs
function updateActiveBetsDisplay() {
    const betsList = document.getElementById('bets-list');
    const betTotal = document.getElementById('bet-total');
    
    if (!betsList || !betTotal) return;
    
    // Vider la liste
    betsList.innerHTML = '';
    
    // Calculer le total
    let total = 0;
    
    // Ajouter chaque pari
    activeBets.forEach((bet, index) => {
        const betElement = document.createElement('div');
        betElement.className = 'bet-item';
        betElement.innerHTML = `
            <div class="bet-details">
                <strong>${bet.name}</strong>
                <div>${bet.number}</div>
                <small>×${bet.multiplier} | ${bet.amount} HTG</small>
            </div>
            <div class="bet-amount">
                ${bet.amount} HTG
            </div>
            <div class="bet-remove" onclick="removeBet(${index})">
                <i class="fas fa-times"></i>
            </div>
        `;
        
        betsList.appendChild(betElement);
        total += bet.amount;
    });
    
    // Mettre à jour le total
    betTotal.textContent = `${total} HTG`;
    
    // Mettre à jour le total dans la notification
    showTotalNotification(total);
}

// Supprimer un pari
function removeBet(index) {
    if (index >= 0 && index < activeBets.length) {
        activeBets.splice(index, 1);
        updateActiveBetsDisplay();
    }
}

// Afficher la notification du total
function showTotalNotification(total = null) {
    if (!total) {
        total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    }
    
    const container = document.getElementById('total-notification-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="total-notification">
            <i class="fas fa-coins"></i>
            <span>Total Aktuèl:</span>
            <span class="total-amount">${total} HTG</span>
        </div>
    `;
}

// Confirmer le pari (pour le bouton en haut)
function confirmBet() {
    // Pour l'instant, on ne fait qu'ajouter une notification
    // Dans une version complète, on pourrait valider le ticket
    if (activeBets.length === 0) {
        alert('Pa gen parye pou konfime. Tanpri ajoute omwen yon parye.');
        return;
    }
    
    const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
    alert(`✅ ${activeBets.length} parye konfime pou yon total de ${total} HTG`);
}

// Basculer le panneau multi-tirages
function toggleMultiDrawPanel() {
    const content = document.getElementById('multi-draw-content');
    const toggleBtn = document.getElementById('multi-draw-toggle');
    
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
    } else {
        content.classList.add('expanded');
        toggleBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
        
        // Charger les options de multi-tirages
        loadMultiDrawOptions();
    }
}

// Charger les options de multi-tirages
function loadMultiDrawOptions() {
    const optionsContainer = document.getElementById('multi-draw-options');
    if (!optionsContainer) return;
    
    // Options de tirage
    const draws = [
        { id: 'miami', name: 'Miami', color: 'var(--miami-color)' },
        { id: 'georgia', name: 'Georgia', color: 'var(--georgia-color)' },
        { id: 'newyork', name: 'New York', color: 'var(--newyork-color)' },
        { id: 'texas', name: 'Texas', color: 'var(--texas-color)' },
        { id: 'tunisia', name: 'Tunisie', color: 'var(--tunisia-color)' }
    ];
    
    optionsContainer.innerHTML = '';
    
    draws.forEach(draw => {
        const option = document.createElement('div');
        option.className = 'multi-draw-option';
        option.innerHTML = draw.name;
        option.style.borderLeftColor = draw.color;
        
        option.addEventListener('click', function() {
            this.classList.toggle('selected');
            updateMultiDrawSelection();
        });
        
        optionsContainer.appendChild(option);
    });
    
    // Charger les jeux pour multi-tirages
    loadMultiDrawGames();
}

// Mettre à jour la sélection des multi-tirages
function updateMultiDrawSelection() {
    const selectedOptions = document.querySelectorAll('.multi-draw-option.selected');
    currentMultiDrawTicket.draws = new Set();
    
    selectedOptions.forEach(option => {
        const drawName = option.textContent.toLowerCase();
        currentMultiDrawTicket.draws.add(drawName);
    });
}

// Charger les jeux pour multi-tirages
function loadMultiDrawGames() {
    const gamesContainer = document.getElementById('multi-game-select');
    if (!gamesContainer) return;
    
    const games = [
        { id: 'borlette', name: 'Borlette', icon: 'fas fa-hashtag' },
        { id: 'lotto3', name: 'Loto 3', icon: 'fas fa-dice-three' },
        { id: 'lotto4', name: 'Loto 4', icon: 'fas fa-dice-four' },
        { id: 'marriage', name: 'Maryaj', icon: 'fas fa-heart' }
    ];
    
    gamesContainer.innerHTML = '';
    
    games.forEach(game => {
        const option = document.createElement('div');
        option.className = 'multi-game-option';
        option.innerHTML = `
            <i class="${game.icon}"></i>
            <div>${game.name}</div>
        `;
        
        option.addEventListener('click', function() {
            this.classList.toggle('selected');
            loadMultiDrawGameForm(game.id);
        });
        
        gamesContainer.appendChild(option);
    });
}

// Charger le formulaire de jeu pour multi-tirages
function loadMultiDrawGameForm(gameId) {
    const formContainer = document.getElementById('multi-number-inputs');
    if (!formContainer) return;
    
    let formHTML = '';
    
    switch(gameId) {
        case 'borlette':
            formHTML = `
                <div class="form-group">
                    <label for="multi-borlette-number">Nimewo (2 chif)</label>
                    <input type="text" id="multi-borlette-number" placeholder="00 a 99" maxlength="2">
                </div>
                <div class="form-group">
                    <label for="multi-borlette-amount">Kantite pa tiraj</label>
                    <input type="number" id="multi-borlette-amount" placeholder="Kantite" min="1" value="1">
                </div>
            `;
            break;
        case 'lotto3':
            formHTML = `
                <div class="form-group">
                    <label for="multi-lotto3-number">Nimewo (3 chif)</label>
                    <input type="text" id="multi-lotto3-number" placeholder="000 a 999" maxlength="3">
                </div>
                <div class="form-group">
                    <label for="multi-lotto3-amount">Kantite pa tiraj</label>
                    <input type="number" id="multi-lotto3-amount" placeholder="Kantite" min="1" value="1">
                </div>
            `;
            break;
        case 'lotto4':
            formHTML = `
                <div class="form-group">
                    <label for="multi-lotto4-number">Nimewo (4 chif)</label>
                    <input type="text" id="multi-lotto4-number" placeholder="0000 a 9999" maxlength="4">
                </div>
                <div class="form-group">
                    <label for="multi-lotto4-amount">Kantite pa tiraj</label>
                    <input type="number" id="multi-lotto4-amount" placeholder="Kantite" min="1" value="1">
                </div>
            `;
            break;
        case 'marriage':
            formHTML = `
                <div class="form-group">
                    <label for="multi-marriage-numbers">Nimewo (2 chif separe pa *)</label>
                    <input type="text" id="multi-marriage-numbers" placeholder="12*34">
                </div>
                <div class="form-group">
                    <label for="multi-marriage-amount">Kantite pa tiraj</label>
                    <input type="number" id="multi-marriage-amount" placeholder="Kantite" min="1" value="1">
                </div>
            `;
            break;
    }
    
    formContainer.innerHTML = formHTML;
}

// Ajouter au ticket multi-tirages
function addToMultiDrawTicket() {
    const selectedGame = document.querySelector('.multi-game-option.selected');
    if (!selectedGame) {
        alert('Tanpri chwazi yon jwet anvan');
        return;
    }
    
    const gameName = selectedGame.querySelector('div').textContent;
    const gameId = gameName.toLowerCase().replace(' ', '');
    
    let betData = null;
    
    switch(gameId) {
        case 'borlette':
            betData = getMultiBorletteBetData();
            break;
        case 'lotto3':
            betData = getMultiLotto3BetData();
            break;
        case 'lotto4':
            betData = getMultiLotto4BetData();
            break;
        case 'maryaj':
            betData = getMultiMarriageBetData();
            break;
    }
    
    if (betData) {
        // Ajouter les tirages sélectionnés
        const selectedDraws = Array.from(currentMultiDrawTicket.draws);
        if (selectedDraws.length === 0) {
            alert('Tanpri chwazi omwen yon tiraj');
            return;
        }
        
        betData.draws = selectedDraws;
        
        // Ajouter au ticket
        currentMultiDrawTicket.bets.push(betData);
        currentMultiDrawTicket.totalAmount += betData.amount * selectedDraws.length;
        
        // Mettre à jour l'affichage
        updateCurrentMultiTicketDisplay();
        
        // Afficher la notification
        alert(`✅ Parye ajoute nan fiche multi-tirages`);
    }
}

// Obtenir les données du pari Borlette pour multi-tirages
function getMultiBorletteBetData() {
    const number = document.getElementById('multi-borlette-number').value;
    const amount = parseInt(document.getElementById('multi-borlette-amount').value) || 1;
    
    if (!number || number.length !== 2 || !/^\d{2}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 2 chif (00 a 99)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        gameType: 'borlette',
        name: 'Borlette',
        number: number,
        amount: amount,
        multiplier: 60,
        draws: [],
        options: {}
    };
}

// Obtenir les données du pari Lotto 3 pour multi-tirages
function getMultiLotto3BetData() {
    const number = document.getElementById('multi-lotto3-number').value;
    const amount = parseInt(document.getElementById('multi-lotto3-amount').value) || 1;
    
    if (!number || number.length !== 3 || !/^\d{3}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 3 chif (000 a 999)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        gameType: 'lotto3',
        name: 'Loto 3',
        number: number,
        amount: amount,
        multiplier: 500,
        draws: [],
        options: {}
    };
}

// Obtenir les données du pari Lotto 4 pour multi-tirages
function getMultiLotto4BetData() {
    const number = document.getElementById('multi-lotto4-number').value;
    const amount = parseInt(document.getElementById('multi-lotto4-amount').value) || 1;
    
    if (!number || number.length !== 4 || !/^\d{4}$/.test(number)) {
        alert('Tanpri antre yon nimewo valab 4 chif (0000 a 9999)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        gameType: 'lotto4',
        name: 'Loto 4',
        number: number,
        amount: amount,
        multiplier: 5000,
        draws: [],
        options: {}
    };
}

// Obtenir les données du pari Marriage pour multi-tirages
function getMultiMarriageBetData() {
    const numbers = document.getElementById('multi-marriage-numbers').value;
    const amount = parseInt(document.getElementById('multi-marriage-amount').value) || 1;
    
    if (!numbers || !numbers.includes('*')) {
        alert('Tanpri antre 2 nimewo separe pa * (egzanp: 12*34)');
        return null;
    }
    
    if (amount <= 0) {
        alert('Kantite a dwe pi gran pase 0');
        return null;
    }
    
    return {
        gameType: 'marriage',
        name: 'Maryaj',
        number: numbers,
        amount: amount,
        multiplier: 1000,
        draws: [],
        options: {}
    };
}

// Mettre à jour l'affichage du ticket multi-tirages actuel
function updateCurrentMultiTicketDisplay() {
    const infoContainer = document.getElementById('current-multi-ticket-info');
    const summaryContainer = document.getElementById('multi-ticket-summary');
    
    if (currentMultiDrawTicket.bets.length === 0) {
        infoContainer.style.display = 'none';
        return;
    }
    
    infoContainer.style.display = 'block';
    
    let summaryHTML = `
        <div style="margin-bottom: 10px;">
            <strong>${currentMultiDrawTicket.bets.length} parye</strong>
            <div>Tirages: ${Array.from(currentMultiDrawTicket.draws).join(', ')}</div>
        </div>
        <div style="max-height: 150px; overflow-y: auto;">
    `;
    
    currentMultiDrawTicket.bets.forEach((bet, index) => {
        summaryHTML += `
            <div style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9rem;">
                <div>${bet.name}: ${bet.number}</div>
                <div style="color: #666;">${bet.amount} HTG × ${bet.draws.length} tiraj = ${bet.amount * bet.draws.length} HTG</div>
            </div>
        `;
    });
    
    summaryHTML += `
        </div>
        <div style="margin-top: 10px; font-weight: bold; border-top: 2px solid var(--primary-color); padding-top: 5px;">
            Total: ${currentMultiDrawTicket.totalAmount} HTG
        </div>
    `;
    
    summaryContainer.innerHTML = summaryHTML;
}

// Afficher le ticket multi-tirages actuel
function showCurrentMultiTicket() {
    if (currentMultiDrawTicket.bets.length === 0) {
        alert('Pa gen parye nan fiche multi-tirages aktuel la');
        return;
    }
    
    // Pour l'instant, on affiche juste une alerte
    // Dans une version complète, on ouvrirait un modal
    let message = `FICHE MULTI-TIRAGES\n`;
    message += `Tirages: ${Array.from(currentMultiDrawTicket.draws).join(', ')}\n\n`;
    
    currentMultiDrawTicket.bets.forEach(bet => {
        message += `${bet.name}: ${bet.number}\n`;
        message += `${bet.amount} HTG × ${bet.draws.length} tiraj = ${bet.amount * bet.draws.length} HTG\n\n`;
    });
    
    message += `TOTAL: ${currentMultiDrawTicket.totalAmount} HTG`;
    
    alert(message);
}

// Sauvegarder et imprimer le ticket multi-tirages
async function saveAndPrintMultiDrawTicket() {
    if (currentMultiDrawTicket.bets.length === 0) {
        alert('Pa gen parye nan fiche multi-tirages la');
        return;
    }
    
    try {
        // Préparer les données
        const ticketData = {
            ticket: {
                bets: currentMultiDrawTicket.bets,
                draws: Array.from(currentMultiDrawTicket.draws),
                totalAmount: currentMultiDrawTicket.totalAmount
            }
        };
        
        // Envoyer au serveur
        const response = await fetch(`${API_BASE_URL}/api/tickets/multi-draw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': currentToken
            },
            body: JSON.stringify(ticketData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Réinitialiser le ticket
            currentMultiDrawTicket = {
                bets: [],
                draws: new Set(),
                totalAmount: 0
            };
            
            updateCurrentMultiTicketDisplay();
            
            // Afficher le succès
            alert(`✅ Fiche multi-tirages #${data.ticket.number} anrejistre ak enprime!`);
            
            // Recharger les données
            loadInitialData();
            
        } else {
            alert(`❌ Erè: ${data.error}`);
        }
        
    } catch (error) {
        console.error('Erreur sauvegarde fiche multi-tirages:', error);
        alert('❌ Erè koneksyon sèvè');
    }
}

// Sauvegarder et imprimer le ticket
async function saveAndPrintTicket() {
    if (activeBets.length === 0) {
        alert('Pa gen parye pou anrejistre. Tanpri ajoute omwen yon parye.');
        return;
    }
    
    try {
        const total = activeBets.reduce((sum, bet) => sum + bet.amount, 0);
        
        // Préparer les données
        const ticketData = {
            number: nextTicketNumber,
            draw: currentDraw,
            draw_time: currentDrawTime,
            bets: activeBets,
            total: total,
            agent_id: currentUser.id,
            agent_name: currentUser.name,
            subsystem_id: currentUser.subsystem_id,
            date: new Date()
        };
        
        // Envoyer au serveur
        const response = await fetch(`${API_BASE_URL}/api/tickets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': currentToken
            },
            body: JSON.stringify(ticketData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Réinitialiser les paris
            activeBets = [];
            updateActiveBetsDisplay();
            
            // Incrémenter le numéro de ticket
            nextTicketNumber++;
            
            // Afficher le succès
            alert(`✅ Fiche #${data.ticket.number} anrejistre ak enprime!`);
            
            // Cacher l'écran des paris
            hideBettingScreen();
            
            // Recharger les données
            loadInitialData();
            
        } else {
            alert(`❌ Erè: ${data.error}`);
        }
        
    } catch (error) {
        console.error('Erreur sauvegarde fiche:', error);
        alert('❌ Erè koneksyon sèvè');
    }
}

// Générer un rapport
async function generateReport() {
    try {
        // Récupérer les tickets d'aujourd'hui
        const response = await fetch(`${API_BASE_URL}/api/tickets?period=today`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const tickets = data.tickets || [];
            const totalSales = tickets.reduce((sum, ticket) => sum + ticket.total, 0);
            
            // Afficher l'écran de rapport
            showReportScreen(tickets, totalSales);
        }
    } catch (error) {
        console.error('Erreur génération rapport:', error);
        alert('❌ Erè jenere rapò');
    }
}

// Afficher l'écran de rapport
function showReportScreen(tickets, totalSales) {
    document.getElementById('report-screen').style.display = 'block';
    document.getElementById('main-container').style.display = 'none';
    
    const reportContent = document.getElementById('report-content');
    
    let reportHTML = `
        <div class="report-header">
            <h3>Rapò Fin Tiraj</h3>
            <p>${new Date().toLocaleDateString('fr-FR')}</p>
        </div>
        <div class="report-details">
            <div class="report-row">
                <span>Total Fich:</span>
                <span>${tickets.length}</span>
            </div>
            <div class="report-row">
                <span>Total Vant:</span>
                <span>${totalSales} HTG</span>
            </div>
    `;
    
    // Regrouper par tirage
    const draws = {};
    tickets.forEach(ticket => {
        const key = `${ticket.draw}_${ticket.draw_time}`;
        if (!draws[key]) {
            draws[key] = {
                count: 0,
                total: 0,
                draw: ticket.draw,
                time: ticket.draw_time
            };
        }
        draws[key].count++;
        draws[key].total += ticket.total;
    });
    
    // Ajouter les détails par tirage
    for (const key in draws) {
        const draw = draws[key];
        reportHTML += `
            <div class="report-row">
                <span>${draw.draw} (${draw.time}):</span>
                <span>${draw.count} fich - ${draw.total} HTG</span>
            </div>
        `;
    }
    
    reportHTML += `
            <div class="report-row total">
                <span>TOTAL JENERAL:</span>
                <span class="report-profit">${totalSales} HTG</span>
            </div>
        </div>
        <div style="margin-top: 20px; text-align: center;">
            <button class="btn-primary" onclick="printReport()">
                <i class="fas fa-print"></i> Enprime Rapò
            </button>
        </div>
    `;
    
    reportContent.innerHTML = reportHTML;
}

// Cacher l'écran de rapport
function hideReportScreen() {
    document.getElementById('report-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
}

// Imprimer le rapport
function printReport() {
    window.print();
}

// Afficher l'écran de vérification des résultats
function showResultsCheckScreen() {
    document.getElementById('results-check-screen').style.display = 'block';
    document.getElementById('main-container').style.display = 'none';
    
    // Charger les résultats
    loadResultsForCheck();
}

// Cacher l'écran de vérification des résultats
function hideResultsCheckScreen() {
    document.getElementById('results-check-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
}

// Charger les résultats pour vérification
async function loadResultsForCheck() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/results?limit=5`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            updateLatestResultsDisplay(data.results);
        }
    } catch (error) {
        console.error('Erreur chargement résultats:', error);
    }
}

// Mettre à jour l'affichage des derniers résultats
function updateLatestResultsDisplay(results) {
    const container = document.getElementById('latest-results');
    if (!container) return;
    
    let html = '';
    
    for (const draw in results) {
        for (const time in results[draw]) {
            const result = results[draw][time];
            const timeName = time === 'morning' ? 'Matin' : 'Soir';
            
            html += `
                <div class="lot-result">
                    <div>
                        <strong>${draw} (${timeName})</strong>
                        <div style="font-size: 0.9rem; color: #666;">
                            ${new Date(result.date).toLocaleDateString('fr-FR')}
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div class="lot-number">${result.lot1}</div>
                        <div style="font-size: 0.9rem;">
                            ${result.lot2 || '--'} | ${result.lot3 || '--'}
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    container.innerHTML = html || '<p>Pa gen rezilta ki disponib</p>';
}

// Vérifier les gagnants
async function checkWinners() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/check-winners`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': currentToken
            },
            body: JSON.stringify({
                draw: currentDraw,
                draw_time: currentDrawTime
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayWinningTickets(data.winningTickets);
        } else {
            alert(`❌ Erè: ${data.message || 'Erè tcheke fich ki genyen'}`);
        }
    } catch (error) {
        console.error('Erreur vérification gagnants:', error);
        alert('❌ Erè koneksyon sèvè');
    }
}

// Afficher les fiches gagnantes
function displayWinningTickets(winningTickets) {
    const container = document.getElementById('winning-tickets-container');
    const summaryContainer = document.getElementById('winning-summary');
    
    if (!container || !summaryContainer) return;
    
    if (winningTickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Pa gen fich ki genyen pou tiraj sa a</p>';
        summaryContainer.innerHTML = '';
        return;
    }
    
    // Calculer le total des gains
    const totalWinnings = winningTickets.reduce((sum, ticket) => sum + ticket.totalWinnings, 0);
    
    // Afficher le résumé
    summaryContainer.innerHTML = `
        <div style="background-color: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="margin: 0 0 10px 0; color: #155724;">
                <i class="fas fa-trophy"></i> Rezime Gan yo
            </h4>
            <div style="display: flex; justify-content: space-between;">
                <span>Total Fich ki genyen:</span>
                <strong>${winningTickets.length}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 5px;">
                <span>Total Gan:</span>
                <strong class="winning-amount">${totalWinnings} HTG</strong>
            </div>
        </div>
    `;
    
    // Afficher les fiches gagnantes
    container.innerHTML = '';
    
    winningTickets.forEach(ticket => {
        const ticketElement = document.createElement('div');
        ticketElement.className = 'winning-ticket';
        ticketElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h4 style="margin: 0;">Fich #${ticket.number}</h4>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${ticket.draw} (${ticket.draw_time}) - 
                        ${new Date(ticket.date).toLocaleDateString('fr-FR')}
                    </div>
                </div>
                <div class="winning-amount">${ticket.totalWinnings} HTG</div>
            </div>
            <div style="margin-top: 10px;">
                <strong>Rezilta tiraj:</strong>
                <div style="display: flex; gap: 10px; margin: 5px 0;">
                    <span>1er: ${ticket.result.lot1}</span>
                    <span>2e: ${ticket.result.lot2 || '--'}</span>
                    <span>3e: ${ticket.result.lot3 || '--'}</span>
                </div>
            </div>
            <div style="margin-top: 10px;">
                <strong>Gan yo:</strong>
        `;
        
        ticket.winningBets.forEach(bet => {
            ticketElement.innerHTML += `
                <div style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9rem;">
                    <div>${bet.name}: ${bet.number}</div>
                    <div style="color: #28a745;">
                        ${bet.win_type} - ${bet.win_amount} HTG
                    </div>
                </div>
            `;
        });
        
        ticketElement.innerHTML += `</div>`;
        container.appendChild(ticketElement);
    });
}

// Afficher l'écran des fiches multi-tirages
function showMultiTicketsScreen() {
    document.getElementById('multi-tickets-screen').style.display = 'block';
    document.getElementById('main-container').style.display = 'none';
    
    // Charger les fiches multi-tirages
    loadMultiTickets();
}

// Cacher l'écran des fiches multi-tirages
function hideMultiTicketsScreen() {
    document.getElementById('multi-tickets-screen').style.display = 'none';
    document.getElementById('main-container').style.display = 'block';
}

// Charger les fiches multi-tirages
async function loadMultiTickets() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tickets/multi-draw`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayMultiTickets(data.tickets);
        }
    } catch (error) {
        console.error('Erreur chargement fiches multi-tirages:', error);
    }
}

// Afficher les fiches multi-tirages
function displayMultiTickets(tickets) {
    const container = document.getElementById('multi-tickets-list');
    if (!container) return;
    
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Pa gen fich multi-tiraj</p>';
        return;
    }
    
    container.innerHTML = '';
    
    tickets.forEach(ticket => {
        const ticketElement = document.createElement('div');
        ticketElement.className = 'multi-ticket-item';
        ticketElement.innerHTML = `
            <div class="multi-draw-ticket-header">
                <div>
                    <h4 style="margin: 0;">Fich #${ticket.number}</h4>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${new Date(ticket.date).toLocaleDateString('fr-FR')}
                    </div>
                </div>
                <div style="font-weight: bold; color: var(--warning-color);">
                    ${ticket.total} HTG
                </div>
            </div>
            <div style="margin: 10px 0;">
                <strong>Tirages:</strong> ${ticket.draws.join(', ')}
            </div>
            <div class="multi-draw-bets-list">
        `;
        
        ticket.bets.forEach(bet => {
            ticketElement.innerHTML += `
                <div class="multi-draw-bet-item">
                    <div>
                        <div>${bet.name}</div>
                        <div style="font-size: 0.9rem; color: #666;">${bet.number}</div>
                    </div>
                    <div>
                        ${bet.amount} HTG × ${bet.draws.length}
                    </div>
                </div>
            `;
        });
        
        ticketElement.innerHTML += `
            </div>
            <div style="text-align: right; margin-top: 10px;">
                <button class="btn-primary" style="padding: 5px 10px; font-size: 0.9rem;" 
                        onclick="printMultiDrawTicket('${ticket.id}')">
                    <i class="fas fa-print"></i> Enprime
                </button>
            </div>
        `;
        
        container.appendChild(ticketElement);
    });
}

// Imprimer une fiche multi-tirages
function printMultiDrawTicket(ticketId) {
    // Dans une version complète, on ouvrirait une fenêtre d'impression
    alert(`Enprime fiche multi-tirages #${ticketId}`);
}

// Charger l'historique
async function loadHistory() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/history?limit=20`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayHistory(data.history);
        }
    } catch (error) {
        console.error('Erreur chargement historique:', error);
    }
}

// Afficher l'historique
function displayHistory(history) {
    const container = document.getElementById('history-list');
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Pa gen istorik</p>';
        return;
    }
    
    container.innerHTML = '';
    
    history.forEach(record => {
        const recordElement = document.createElement('div');
        recordElement.className = 'history-item';
        recordElement.innerHTML = `
            <div class="history-header">
                <div class="history-draw">${record.draw} (${record.draw_time})</div>
                <div class="history-date">${new Date(record.date).toLocaleString('fr-FR')}</div>
            </div>
            <div class="history-bets">
        `;
        
        record.bets.forEach(bet => {
            recordElement.innerHTML += `
                <div class="history-bet">
                    <div>${bet.name}: ${bet.number}</div>
                    <div>${bet.amount} HTG</div>
                </div>
            `;
        });
        
        recordElement.innerHTML += `
            </div>
            <div class="history-total">
                <span>Total:</span>
                <span>${record.total} HTG</span>
            </div>
        `;
        
        container.appendChild(recordElement);
    });
}

// Charger la gestion des tickets
async function loadTicketManagement() {
    try {
        // Charger tous les tickets
        const response = await fetch(`${API_BASE_URL}/api/tickets`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayTicketManagement(data.tickets);
        }
    } catch (error) {
        console.error('Erreur chargement gestion tickets:', error);
    }
}

// Afficher la gestion des tickets
function displayTicketManagement(tickets) {
    const container = document.getElementById('ticket-management-list');
    if (!container) return;
    
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Pa gen fich</p>';
        return;
    }
    
    container.innerHTML = '';
    
    tickets.forEach(ticket => {
        const ticketElement = document.createElement('div');
        ticketElement.className = 'ticket-management';
        ticketElement.innerHTML = `
            <div class="ticket-management-header">
                <div>
                    <h4 style="margin: 0;">Fich #${ticket.number}</h4>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${ticket.draw} (${ticket.draw_time}) - 
                        ${new Date(ticket.date).toLocaleDateString('fr-FR')}
                    </div>
                </div>
                <div style="font-weight: bold; color: ${ticket.is_synced ? '#28a745' : '#dc3545'};">
                    ${ticket.total} HTG
                </div>
            </div>
            <div style="margin: 10px 0;">
                <strong>Agent:</strong> ${ticket.agent_name}
            </div>
            <div class="ticket-actions-buttons">
                <button class="btn-primary" style="padding: 5px 10px; font-size: 0.9rem;" 
                        onclick="viewTicketDetails('${ticket.id}')">
                    <i class="fas fa-eye"></i> Detay
                </button>
                <button class="btn-success" style="padding: 5px 10px; font-size: 0.9rem;" 
                        onclick="printTicket('${ticket.number}')">
                    <i class="fas fa-print"></i> Enprime
                </button>
                ${!ticket.is_synced ? `
                    <button class="btn-warning" style="padding: 5px 10px; font-size: 0.9rem;" 
                            onclick="syncTicket('${ticket.id}')">
                        <i class="fas fa-sync-alt"></i> Senkronize
                    </button>
                ` : ''}
            </div>
        `;
        
        container.appendChild(ticketElement);
    });
}

// Charger les tickets gagnants
async function loadWinningTickets() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/tickets/winning`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            displayWinningTicketsList(data.tickets);
        }
    } catch (error) {
        console.error('Erreur chargement tickets gagnants:', error);
    }
}

// Afficher la liste des tickets gagnants
function displayWinningTicketsList(tickets) {
    const container = document.getElementById('winning-tickets-list');
    if (!container) return;
    
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">Pa gen fich ki genyen</p>';
        return;
    }
    
    container.innerHTML = '';
    
    tickets.forEach(ticket => {
        const ticketElement = document.createElement('div');
        ticketElement.className = 'winning-ticket';
        ticketElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <div>
                    <h4 style="margin: 0;">Fich #${ticket.ticket_number}</h4>
                    <div style="font-size: 0.9rem; color: #666;">
                        ${ticket.draw} (${ticket.draw_time}) - 
                        ${new Date(ticket.date).toLocaleDateString('fr-FR')}
                    </div>
                </div>
                <div class="winning-amount">${ticket.total_winnings} HTG</div>
            </div>
            <div style="margin-top: 10px;">
                <strong>Gan yo:</strong>
        `;
        
        ticket.winning_bets.forEach(bet => {
            ticketElement.innerHTML += `
                <div style="padding: 5px; border-bottom: 1px solid #eee; font-size: 0.9rem;">
                    <div>${bet.name}: ${bet.number}</div>
                    <div style="color: #28a745;">
                        ${bet.win_type} - ${bet.win_amount} HTG
                    </div>
                </div>
            `;
        });
        
        ticketElement.innerHTML += `
            </div>
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Statut:</span>
                    <span style="color: ${ticket.paid ? '#28a745' : '#dc3545'}; font-weight: bold;">
                        ${ticket.paid ? 'PEYE' : 'PA PEYE'}
                    </span>
                </div>
            </div>
        `;
        
        container.appendChild(ticketElement);
    });
}

// Voir les détails d'un ticket
function viewTicketDetails(ticketId) {
    // Dans une version complète, on ouvrirait un modal avec les détails
    alert(`Detay fich #${ticketId}`);
}

// Imprimer un ticket
function printTicket(ticketNumber) {
    // Dans une version complète, on ouvrirait une fenêtre d'impression
    alert(`Enprime fich #${ticketNumber}`);
}

// Synchroniser un ticket
async function syncTicket(ticketId) {
    try {
        // Cette route n'existe pas encore dans server.js
        // On utiliserait: PUT /api/tickets/:id/sync
        alert(`Fich #${ticketId} senkronize`);
        
        // Mettre à jour la liste
        loadTicketManagement();
        
    } catch (error) {
        console.error('Erreur synchronisation:', error);
        alert('❌ Erè senkronizasyon');
    }
}

// Synchroniser les tickets en attente
async function syncPendingTickets() {
    try {
        // Récupérer les tickets en attente
        const response = await fetch(`${API_BASE_URL}/api/tickets/pending`, {
            headers: {
                'x-auth-token': currentToken
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const tickets = data.tickets || [];
            
            if (tickets.length === 0) {
                alert('Pa gen fich poko ale nan santral');
                return;
            }
            
            // Synchroniser chaque ticket
            for (const ticket of tickets) {
                // Simuler la synchronisation
                console.log(`Synchronisation ticket #${ticket.number}`);
            }
            
            alert(`✅ ${tickets.length} fich senkronize`);
            
            // Mettre à jour le badge
            pendingTickets = pendingTickets.filter(t => 
                !tickets.some(pending => pending.id === t.id)
            );
            updatePendingBadge();
            
        }
    } catch (error) {
        console.error('Erreur synchronisation tickets:', error);
        alert('❌ Erè senkronizasyon');
    }
}

// Mettre à jour le badge de tickets en attente
function updatePendingBadge() {
    const pendingCount = pendingTickets.length;
    const badge = document.querySelector('.pending-badge');
    
    if (!badge && pendingCount > 0) {
        // Créer le badge
        const newBadge = document.createElement('div');
        newBadge.className = 'pending-badge';
        newBadge.textContent = pendingCount;
        newBadge.id = 'pending-badge';
        
        const adminBtn = document.getElementById('admin-menu-btn');
        if (adminBtn) {
            adminBtn.style.position = 'relative';
            adminBtn.appendChild(newBadge);
        }
    } else if (badge) {
        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Déconnexion
function logout() {
    if (confirm('Èske ou sèten ou vle dekonekte?')) {
        localStorage.removeItem('nova_token');
        localStorage.removeItem('nova_user_data');
        window.location.href = '/';
    }
}

// Exporter les fonctions globales
window.removeBet = removeBet;
window.viewTicketDetails = viewTicketDetails;
window.printTicket = printTicket;
window.syncTicket = syncTicket;
window.printMultiDrawTicket = printMultiDrawTicket;
window.printReport = printReport;
window.showAdminMenu = showAdminMenu;
window.syncPendingTickets = syncPendingTickets;
window.logout = logout;