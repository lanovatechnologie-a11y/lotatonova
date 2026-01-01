import express from "express";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Charger les variables d'environnement
dotenv.config();

// === __dirname fix ===
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// === MIDDLEWARES ===
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ===== ENV =====
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

console.log("=== CHECK ENV ===");
console.log("SUPABASE_URL :", SUPABASE_URL ? "✓ OK" : "✗ MISSING");
console.log("SERVICE KEY :", SERVICE_KEY ? "✓ OK" : "✗ MISSING");
console.log("================");

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("❌ Supabase non configuré !");
    process.exit(1);
}

// ===== SUPABASE CLIENT =====
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ===== ROUTES API =====

// Health Check
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        supabase: "configured",
        time: new Date(),
        env: {
            hasUrl: !!SUPABASE_URL,
            hasKey: !!SERVICE_KEY
        }
    });
});

// Login Universel (tous les rôles)
app.post("/api/auth/login", async (req, res) => {
    try {
        const { username, password, role } = req.body;

        console.log("🔐 Tentative de connexion:", { username, role: role || 'auto' });

        if (!username || !password) {
            return res.status(400).json({ 
                success: false,
                error: "Identifiant et mot de passe requis" 
            });
        }

        // Configuration des tables et colonnes selon la structure réelle
        const tablesConfig = {
            'masters': {
                tableName: 'masters',
                usernameColumn: 'username',  // ✅ Colonne réelle
                passwordColumn: 'password'    // ✅ Colonne réelle
            },
            'subsystem_admins': {
                tableName: 'subsystem_admins',
                usernameColumn: 'username',
                passwordColumn: 'password'
            },
            'supervisors_level2': {
                tableName: 'supervisors_level2',
                usernameColumn: 'username',
                passwordColumn: 'password'
            },
            'supervisors_level1': {
                tableName: 'supervisors_level1',
                usernameColumn: 'username',
                passwordColumn: 'password'
            },
            'agents': {
                tableName: 'agents',
                usernameColumn: 'username',
                passwordColumn: 'password'
            }
        };

        // Tables à vérifier selon le rôle
        let tablesToCheck = [];
        
        if (role === 'master') {
            tablesToCheck = ['masters'];
        } else if (role === 'subsystem_admin') {
            tablesToCheck = ['subsystem_admins'];
        } else {
            // Auto-détection : vérifier toutes les tables
            tablesToCheck = Object.keys(tablesConfig);
        }

        // Essayer chaque table
        for (const tableKey of tablesToCheck) {
            const config = tablesConfig[tableKey];
            console.log(`   Vérification dans ${config.tableName}...`);
            
            try {
                // Chercher l'utilisateur avec la bonne colonne
                const { data, error } = await supabase
                    .from(config.tableName)
                    .select("*")
                    .eq(config.usernameColumn, username)
                    .single();

                if (error) {
                    console.log(`   ℹ️ Non trouvé dans ${config.tableName}:`, error.message);
                    continue;
                }

                if (!data) {
                    console.log(`   ℹ️ Aucune donnée dans ${config.tableName}`);
                    continue;
                }

                console.log(`   ✓ Utilisateur trouvé dans ${config.tableName}`);

                // Vérifier le mot de passe (comparaison simple)
                // Pour bcrypt, décommentez cette section et installez bcryptjs
                /*
                if (data.password_hash) {
                    const bcrypt = await import('bcryptjs');
                    const match = await bcrypt.compare(password, data.password_hash);
                    if (!match) {
                        console.log(`   ✗ Mot de passe incorrect`);
                        return res.status(401).json({
                            success: false,
                            error: "Identifiants incorrects"
                        });
                    }
                } else */ 
                if (data[config.passwordColumn] !== password) {
                    console.log(`   ✗ Mot de passe incorrect`);
                    return res.status(401).json({
                        success: false,
                        error: "Identifiants incorrects"
                    });
                }

                console.log(`   ✓ Authentification réussie !`);

                // Mettre à jour la dernière connexion
                await supabase
                    .from(config.tableName)
                    .update({ last_login: new Date().toISOString() })
                    .eq("id", data.id);

                // Générer un token simple (utilisez JWT en production)
                const token = Buffer.from(`${data.id}:${tableKey}:${Date.now()}`).toString('base64');

                // Réponse selon le type d'utilisateur
                const response = {
                    success: true,
                    token: token,
                    user: {
                        id: data.id,
                        username: data[config.usernameColumn],
                        role: tableKey,
                        name: data.full_name || data[config.usernameColumn]
                    }
                };

                // Ajouter les infos spécifiques selon le rôle
                if (tableKey === 'subsystem_admins' && data.subsystem_id) {
                    // Récupérer les infos du sous-système
                    const { data: subsystem } = await supabase
                        .from('subsystems')
                        .select('*')
                        .eq('id', data.subsystem_id)
                        .single();
                    
                    if (subsystem) {
                        response.subsystem = subsystem;
                    }
                }

                console.log("✅ Connexion réussie");
                return res.json(response);

            } catch (tableError) {
                console.error(`   ✗ Erreur dans ${config.tableName}:`, tableError.message);
                continue;
            }
        }

        // Aucune table n'a fonctionné
        console.log("❌ Identifiants invalides (aucune correspondance)");
        return res.status(401).json({
            success: false,
            error: "Identifiants incorrects"
        });

    } catch (error) {
        console.error("❌ Erreur serveur:", error);
        return res.status(500).json({
            success: false,
            error: "Erreur serveur: " + error.message
        });
    }
});

// Route de test Supabase
app.get("/api/test-supabase", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('masters')
            .select('username, created_at')
            .limit(5);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message,
                details: error
            });
        }

        res.json({
            success: true,
            message: "Connexion Supabase OK",
            hasData: data && data.length > 0,
            count: data ? data.length : 0,
            users: data ? data.map(u => u.username) : []
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===== SERVE STATIC FILES =====
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("*", (req, res) => {
    // Si c'est une route API non trouvée
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            error: "Route API non trouvée"
        });
    }
    // Sinon, servir index.html (pour le routing côté client)
    res.sendFile(path.join(__dirname, "index.html"));
});

// ===== START SERVER =====
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("=====================================");
    console.log(`🚀 Nova Lotto Server v2.0`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`✅ Supabase: Configuré`);
    console.log("=====================================");
});