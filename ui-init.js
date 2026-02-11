// ==========================================
// Afficher une notification
// ==========================================
function showNotification(message, type = 'info') {
    console.log("Notification:", type, message);
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    let icon = 'fas fa-info-circle';
    if (type === 'success') icon = 'fas fa-check-circle';
    if (type === 'warning') icon = 'fas fa-exclamation-triangle';
    if (type === 'error') icon = 'fas fa-times-circle';
    
    notification.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 20px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// ==========================================
// Afficher un écran spécifique
// ==========================================
function showScreen(screenId) {
    console.log("Afficher écran:", screenId);
    
    // Cacher tous les écrans
    document.querySelectorAll('.screen, .betting-screen, .container, .report-screen, .results-check-screen, .multi-tickets-screen').forEach(screen => {
        screen.style.display = 'none';
    });
    
    // Mettre à jour la navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-screen') === screenId) {
            item.classList.add('active');
        }
    });
    
    if (screenId === 'home') {
        document.querySelector('.container').style.display = 'block';
    } else {
        const screen = document.getElementById(screenId + '-screen');
        if (screen) {
            screen.style.display = 'block';
            
            // Mettre à jour le contenu de l'écran si nécessaire
            if (screenId === 'ticket-management') {
                updateTicketManagementScreen();
            } else if (screenId === 'history') {
                updateHistoryScreen();
            } else if (screenId === 'winning-tickets') {
                updateWinningTicketsScreen();
            }
        }
    }
}

// ==========================================
// Mettre à jour l'heure actuelle
// ==========================================
function updateCurrentTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    const dateString = now.toLocaleDateString('fr-FR', options);
    const timeString = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    document.getElementById('current-time').textContent = `${dateString} - ${timeString}`;
    document.getElementById('ticket-date').textContent = `${dateString} - ${timeString}`;
}

// ==========================================
// Mettre à jour le badge des fiches en attente
// ==========================================
function updatePendingBadge() {
    const pendingCount = pendingSyncTickets.length;
    console.log("Mise à jour badge:", pendingCount);
    // Cette fonction peut être étendue pour afficher un badge visuel
}

// ==========================================
// 5. Initialisation corrigée
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log("Document chargé, initialisation...");
    
    // Vérifier l'authentification
    if (!await checkAuth()) {
        return;
    }
    
    // Mettre à jour l'heure
    updateCurrentTime();
    
    // Charger les données depuis l'API
    await loadDataFromAPI();
    
    // Configurer la détection de connexion
    setupConnectionDetection();
    
    // Mettre à jour l'affichage du logo
    updateLogoDisplay();
    
    // Charger les résultats depuis la base de données
    loadResultsFromDatabase();
    
    // Ajouter les écouteurs d'événements pour les tirages
    document.querySelectorAll('.draw-card').forEach(card => {
        card.addEventListener('click', function() {
            console.log("Carte de tiraj cliquée:", this.getAttribute('data-draw'));
            const drawId = this.getAttribute('data-draw');
            
            // Vérifier si le tirage du matin est bloqué
            if (!checkDrawBeforeOpening(drawId, 'morning')) {
                return;
            }
            
            openBettingScreen(drawId, 'morning');
        });
    });
    
    // Ajouter les écouteurs d'événements pour les boutons de tirage
    document.querySelectorAll('.draw-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.draw-card');
            const drawId = card.getAttribute('data-draw');
            const time = this.getAttribute('data-time');
            
            console.log("Bouton tiraj cliqué:", drawId, time);
            
            // Vérifier si le tirage est bloqué
            if (!checkDrawBeforeOpening(drawId, time)) {
                return;
            }
            
            card.querySelectorAll('.draw-btn').forEach(b => {
                b.classList.remove('active');
            });
            this.classList.add('active');
            
            openBettingScreen(drawId, time);
        });
    });
    
    // Bouton de retour
    document.getElementById('back-button').addEventListener('click', closeBettingScreen);
    
    // Bouton de confirmation en haut
    document.getElementById('confirm-bet-top').addEventListener('click', submitBets);
    
    // Boutons de fiche
    document.getElementById('save-print-ticket').addEventListener('click', function() {
        console.log("Sauvegarder et imprimer cliqué");
        saveAndPrintTicket();
    });
    
    document.getElementById('save-ticket-only').addEventListener('click', function() {
        console.log("Sauvegarder seulement cliqué");
        saveTicket();
    });
    
    document.getElementById('print-ticket-only').addEventListener('click', function() {
        console.log("Imprimer seulement cliqué");
        printTicket();
    });
    
    // Bouton pour sauvegarder et imprimer la fiche multi-tirages
    document.getElementById('save-print-multi-ticket').addEventListener('click', function() {
        console.log("Sauvegarder et imprimer fiche multi-tirages");
        saveAndPrintMultiDrawTicket();
    });
    
    // Bouton pour voir la fiche multi-tirages actuelle
    document.getElementById('view-current-multi-ticket').addEventListener('click', function() {
        console.log("Voir fiche multi-tirages actuelle");
        viewCurrentMultiDrawTicket();
    });
    
    // Bouton pour ouvrir l'écran des fiches multi-tirages
    document.getElementById('open-multi-tickets').addEventListener('click', function() {
        console.log("Ouvrir écran fiches multi-tirages");
        openMultiTicketsScreen();
    });
    
    // Bouton de retour de l'écran multi-tirages
    document.getElementById('back-from-multi-tickets').addEventListener('click', function() {
        console.log("Retour de l'écran multi-tirages");
        document.getElementById('multi-tickets-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen');
            console.log("Navigation cliquée:", screen);
            showScreen(screen);
        });
    });
    
    // Boutons de retour
    document.querySelectorAll('.back-button').forEach(btn => {
        btn.addEventListener('click', function() {
            const screen = this.getAttribute('data-screen') || 'home';
            console.log("Bouton retour cliqué vers:", screen);
            showScreen(screen);
        });
    });
    
    // Bouton retour du rapport
    document.getElementById('back-from-report').addEventListener('click', function() {
        console.log("Retour du rapport");
        document.getElementById('report-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Bouton retour de vérification des résultats
    document.getElementById('back-from-results').addEventListener('click', function() {
        console.log("Retour de vérification des résultats");
        document.getElementById('results-check-screen').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    });
    
    // Boutons de connexion
    document.getElementById('retry-connection').addEventListener('click', function() {
        console.log("Réessayer connexion");
        retryConnectionCheck();
    });
    
    document.getElementById('cancel-print').addEventListener('click', function() {
        console.log("Annuler impression");
        cancelPrint();
    });
    
    // Bouton pour générer le rapport
    document.getElementById('generate-report-btn').addEventListener('click', function() {
        console.log("Générer rapport");
        generateEndOfDrawReport();
    });
    
    // Bouton pour ouvrir l'écran de vérification des résultats
    document.getElementById('open-results-check').addEventListener('click', function() {
        console.log("Ouvrir vérification des résultats");
        openResultsCheckScreen();
    });
    
    // Bouton pour vérifier les fiches gagnantes
    document.getElementById('check-winners-btn').addEventListener('click', function() {
        console.log("Vérifier fiches gagnantes");
        checkWinningTickets();
    });
    
    // Multi-tirages
    document.getElementById('multi-draw-toggle').addEventListener('click', function() {
        console.log("Toggle multi-tirages");
        toggleMultiDrawPanel();
    });
    
    // Changement du bouton pour ajouter à la fiche multi-tirages
    document.getElementById('add-to-multi-draw').addEventListener('click', function() {
        console.log("Ajouter à la fiche multi-tirages");
        addToMultiDrawTicket();
    });
    
    // Initialiser le panneau multi-tirages
    initMultiDrawPanel();
    
    // Gestion des fiches - Écouteurs d'événements ajoutés
    document.getElementById('search-ticket-btn').addEventListener('click', function() {
        console.log("Rechercher fiche");
        searchTicket();
    });
    
    document.getElementById('show-all-tickets').addEventListener('click', function() {
        console.log("Afficher toutes les fiches");
        showAllTickets();
    });
    
    // Recherche historique
    document.getElementById('search-history-btn').addEventListener('click', function() {
        console.log("Rechercher historique");
        searchHistory();
    });
    
    document.getElementById('search-winning-btn').addEventListener('click', function() {
        console.log("Rechercher fiches gagnantes");
        searchWinningTickets();
    });
    
    // Actualiser périodiquement
    setInterval(updateCurrentTime, 60000);
    setInterval(updatePendingBadge, 30000);
    // Vérifier périodiquement les résultats
    setInterval(checkForNewResults, 300000); // Toutes les 5 minutes
    
    console.log("✅ Initialisation terminée");
});