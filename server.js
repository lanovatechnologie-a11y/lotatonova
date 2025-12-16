const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, 'public')));

// Importer les routes d'authentification
const authRoutes = require('./server/routes/auth');
app.use('/api/auth', authRoutes);

// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route pour le login
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Route pour master
app.get('/master', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'master.html'));
});

// Route pour subsystem
app.get('/subsystem', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'subsystem.html'));
});

// Route pour supervisor1
app.get('/supervisor1', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'supervisor1.html'));
});

// Route pour supervisor2
app.get('/supervisor2', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'supervisor2.html'));
});

// Route pour agent
app.get('/agent', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'agent.html'));
});

// Route de test API
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'API Nova Lotto fonctionne!',
        timestamp: new Date().toISOString()
    });
});

// Gestion des erreurs 404
app.use((req, res) => {
    res.status(404).json({ error: 'Route non trouvée' });
});

// Port d'écoute
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur Nova Lotto démarré sur le port ${PORT}`);
    console.log(`📊 Environnement: ${process.env.NODE_ENV || 'development'}`);
});
