require('dotenv').config();
const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const cors = require('cors');

// App config
const app = express();
const PORT = process.env.PORT || 3000;

// Support both variable names: SUPABASE_ANON_KEY OR SUPABASE_KEY
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ ERREUR: SUPABASE_URL ou SUPABASE_ANON_KEY/SUPABASE_KEY pa defini');
    console.error('📝 Dans Render, ajoutez ces variables d\'environnement:');
    console.error('   - SUPABASE_URL: https://<ton-projet>.supabase.co');
    console.error('   - SUPABASE_ANON_KEY (ou SUPABASE_KEY): <votre_anon_key>');
    console.error('   - (optionnel) SUPABASE_SERVICE_ROLE_KEY: <service_role_key> (NE PAS exposer côté client)');
    // Ne pas forcément exit afin que Render puisse afficher les logs ; on renverra 500 aux routes si absent.
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.use(cors({
    origin: '*',
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, '.')));

// Health route
app.get('/api/health', async (req, res) => {
    try {
        if (!supabase) {
            return res.status(500).json({
                success: false,
                message: 'Supabase non configuré (variables d\'environnement manquantes)'
            });
        }
        const { data, error } = await supabase.from('agents').select('*').limit(1);
        res.json({
            success: true,
            message: 'Serveur Nova Lotto fonctionnel',
            timestamp: new Date().toISOString(),
            supabase: error ? `Erreur: ${error.message || JSON.stringify(error)}` : 'Connecté',
            version: '1.0.0'
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

// ... (laisser le reste des routes inchangé)
app.listen(PORT, () => {
    console.log(`Nova Lotto server running on port ${PORT}`);
});