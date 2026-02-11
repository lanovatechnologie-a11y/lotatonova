// Variables globales
let currentDraw = null;
let currentDrawTime = null;
let activeBets = [];
let ticketNumber = 100001; // Valeur initiale
let savedTickets = [];
let currentAdmin = null;
let pendingSyncTickets = [];
let isOnline = navigator.onLine;
let companyLogo = "logo-borlette.jpg";
let currentBetCategory = null;
let restrictedBalls = [];
let gameRestrictions = {};
let selectedMultiDraws = new Set();
let selectedMultiGame = 'borlette';
let selectedBalls = []; // Stocke les boules sélectionnées pour les jeux automatiques

// Variables pour les fiches multi-tirages
let currentMultiDrawTicket = {
    id: Date.now().toString(),
    bets: [], // Liste des paris multi-tirages
    totalAmount: 0,
    draws: new Set(), // Tirages sélectionnés
    createdAt: new Date().toISOString()
};

let multiDrawTickets = []; // Liste des fiches multi-tirages sauvegardées

// Informations de l'entreprise
let companyInfo = {
    name: "Nova Lotto",
    phone: "+509 32 53 49 58",
    address: "Cap Haïtien",
    reportTitle: "Nova Lotto",
    reportPhone: "40104585"
};

// Tickets gagnants
let winningTickets = [];

// Gestion du token
let authToken = null;
let currentUser = null; // Stocker les infos de l'utilisateur connecté