require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Configuration Supabase
const supabaseUrl = 'https://glutcejzwmynjxarmldq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdXRjZWp6d215bmp4YXJtbGRxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU1MTAzNzIsImV4cCI6MjA4MTA4NjM3Mn0.vkQ4ykvO0B1IyVk668kUBfkHduikEFcLJdkzayzyOwA';
const supabase = createClient(supabaseUrl, supabaseKey);

const JWT_SECRET = 'votre-secret-jwt-tres-secure-changez-cela';

const app = express();
const PORT = process.env.PORT || 3000;

// ============ POINTER VERS LA RACINE ============
// __dirname = /opt/render/project/src/server
// Racine = __dirname + '/..'
const ROOT_DIR = path.join(__dirname, '..');  // Racine du projet

console.log('='.repeat(50));
console.log('Dossier serveur:', __dirname);
console.log('Racine du projet:', ROOT_DIR);
console.log('='.repeat(50));

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir les fichiers statiques DEPUIS LA RACINE
app.use(express.static(ROOT_DIR));

// ... (TOUT LE RESTE DE VOTRE CODE EXISTANT - PAS DE CHANGEMENTS) ...

// ============ ROUTE FALLBACK ============
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        // Cherche le fichier à la racine
        const filePath = path.join(ROOT_DIR, req.path === '/' ? 'index.html' : req.path);
        
        // Si le fichier n'existe pas, sert index.html
        res.sendFile(filePath, (err) => {
            if (err) {
                console.log(`Fichier ${req.path} non trouvé, retour à index.html`);
                res.sendFile(path.join(ROOT_DIR, 'index.html'));
            }
        });
    }
});

// Gestion des erreurs
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Erreur serveur interne',
        message: err.message 
    });
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ Serveur Nova Lotto sur le port ${PORT}`);
    console.log(`✅ Fichiers servis depuis: ${ROOT_DIR}`);
    console.log(`✅ URL: https://lotatonova.onrender.com`);
    console.log(`${'='.repeat(50)}\n`);
});