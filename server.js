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

// Fonction pour échapper les noms de colonnes avec espaces
const escapeColumnName = (columnName) => {
    return `"${columnName}"`;
};

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

        // Configuration des tables AVEC LES VRAIS NOMS DE COLONNES
        const tablesConfig = {
            'masters': {
                tableName: 'masters',
                usernameColumn: 'nom d\'utilisateur',  // ✅ Exactement comme dans Supabase
                passwordColumn: 'mot de passe',         // ✅ Exactement comme dans Supabase
                idColumn: 'identifiant'
            },
            'subsystem_admins': {
                tableName: 'subsystem_admins',
                usernameColumn: 'username',
                passwordColumn: 'password',
                idColumn: 'id'
            },
            'supervisors_level2': {
                tableName: 'supervisors_level2',
                usernameColumn: 'username',
                passwordColumn: 'password',
                idColumn: 'id'
            },
            'supervisors_level1': {
                tableName: 'supervisors_level1',
                usernameColumn: 'username',
                passwordColumn: 'password',
                idColumn: 'id'
            },
            'agents': {
                tableName: 'agents',
                usernameColumn: 'username',
                passwordColumn: 'password',
                idColumn: 'id'
            }
        };

        // Tables à vérifier selon le rôle
        let tablesToCheck = [];
        
        if (role === 'master') {
            tablesToCheck = ['masters'];
        } else if (role === 'subsystem_admin') {
            tablesToCheck = ['subsystem_admins'];
        } else if (role === 'supervisor_level2') {
            tablesToCheck = ['supervisors_level2'];
        } else if (role === 'supervisor_level1') {
            tablesToCheck = ['supervisors_level1'];
        } else if (role === 'agent') {
            tablesToCheck = ['agents'];
        } else {
            // Auto-détection : vérifier toutes les tables
            tablesToCheck = Object.keys(tablesConfig);
        }

        console.log(`🔍 Recherche dans les tables: ${tablesToCheck.join(', ')}`);

        // Essayer chaque table
        for (const tableKey of tablesToCheck) {
            const config = tablesConfig[tableKey];
            console.log(`   🔎 Vérification dans ${config.tableName}...`);
            
            try {
                // Chercher l'utilisateur avec les colonnes correctement échappées
                let query = supabase
                    .from(config.tableName)
                    .select("*");

                // Pour les colonnes avec espaces, on utilise un filtre direct
                const { data, error } = await query;

                if (error) {
                    console.log(`   ℹ️ Erreur Supabase: ${error.message}`);
                    continue;
                }

                if (!data || data.length === 0) {
                    console.log(`   ℹ️ Table ${config.tableName} vide`);
                    continue;
                }

                // Filtrer manuellement car Supabase ne gère pas bien les colonnes avec espaces
                const user = data.find(item => {
                    // Gestion spéciale pour la table masters avec colonnes avec espaces
                    if (tableKey === 'masters') {
                        return item["nom d'utilisateur"] === username;
                    } else {
                        return item[config.usernameColumn] === username;
                    }
                });

                if (!user) {
                    console.log(`   ℹ️ Utilisateur ${username} non trouvé dans ${config.tableName}`);
                    continue;
                }

                console.log(`   ✓ Utilisateur trouvé dans ${config.tableName}`);

                // Vérifier le mot de passe
                let passwordMatch = false;
                
                if (tableKey === 'masters') {
                    // Pour masters, colonne avec espace
                    passwordMatch = user["mot de passe"] === password;
                } else {
                    // Pour les autres tables
                    passwordMatch = user[config.passwordColumn] === password;
                }

                if (!passwordMatch) {
                    console.log(`   ✗ Mot de passe incorrect pour ${username}`);
                    return res.status(401).json({
                        success: false,
                        error: "Identifiants incorrects"
                    });
                }

                console.log(`   ✅ Authentification réussie pour ${username} !`);

                // Générer un token simple
                const token = Buffer.from(`${user[config.idColumn]}:${tableKey}:${Date.now()}`).toString('base64');

                // Réponse selon le type d'utilisateur
                const response = {
                    success: true,
                    token: token,
                    user: {
                        id: user[config.idColumn],
                        username: username,
                        role: tableKey,
                        // Extraire le nom complet si disponible
                        name: user.nom_complet || user.full_name || user["nom complet"] || username
                    },
                    table: config.tableName
                };

                // Ajouter les infos spécifiques
                if (tableKey === 'subsystem_admins' && user.subsystem_id) {
                    try {
                        const { data: subsystem } = await supabase
                            .from('subsystems')
                            .select('*')
                            .eq('id', user.subsystem_id)
                            .single();
                        
                        if (subsystem) {
                            response.subsystem = subsystem;
                        }
                    } catch (subsystemError) {
                        console.log("   ℹ️ Pas de sous-système associé");
                    }
                }

                console.log(`✅ Connexion réussie pour ${username} (${tableKey})`);
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

// Route de test Supabase - Version corrigée
app.get("/api/test-supabase", async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('masters')
            .select('*')
            .limit(5);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message,
                details: error
            });
        }

        // Afficher les données brutes pour débogage
        const simplifiedData = data ? data.map(item => ({
            id: item.identifiant,
            username: item["nom d'utilisateur"],
            hasPassword: !!item["mot de passe"]
        })) : [];

        res.json({
            success: true,
            message: "Connexion Supabase OK",
            hasData: data && data.length > 0,
            count: data ? data.length : 0,
            users: simplifiedData,
            rawSample: data && data.length > 0 ? {
                keys: Object.keys(data[0]),
                sample: data[0]
            } : null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route pour voir la structure d'une table
app.get("/api/table-structure/:tableName", async (req, res) => {
    try {
        const { tableName } = req.params;
        
        // Tester en récupérant une ligne
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        if (!data || data.length === 0) {
            return res.json({
                success: true,
                message: "Table vide",
                columns: []
            });
        }

        const columns = Object.keys(data[0]);

        res.json({
            success: true,
            tableName: tableName,
            columns: columns,
            sampleRow: data[0]
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Route pour tester une connexion spécifique
app.post("/api/test-login", async (req, res) => {
    try {
        const { username, password } = req.body;

        console.log("🧪 Test de connexion manuel:", { username });

        // Vérifier dans la table masters d'abord
        const { data, error } = await supabase
            .from('masters')
            .select('*');

        if (error) {
            return res.status(500).json({
                success: false,
                error: error.message
            });
        }

        // Rechercher manuellement
        const user = data.find(item => item["nom d'utilisateur"] === username);

        if (!user) {
            return res.json({
                success: false,
                message: "Utilisateur non trouvé",
                availableUsers: data.map(u => u["nom d'utilisateur"])
            });
        }

        const passwordMatch = user["mot de passe"] === password;

        return res.json({
            success: passwordMatch,
            message: passwordMatch ? "Mot de passe correct" : "Mot de passe incorrect",
            user: {
                username: user["nom d'utilisateur"],
                hasPassword: !!user["mot de passe"],
                passwordLength: user["mot de passe"] ? user["mot de passe"].length : 0
            }
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
    console.log(`🚀 Nova Lotto Server v2.1 (ADAPTÉ)`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`✅ Supabase: Configuré`);
    console.log("=====================================");
    console.log("📊 Endpoints disponibles:");
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/auth/login`);
    console.log(`   GET  /api/test-supabase`);
    console.log(`   GET  /api/table-structure/:tableName`);
    console.log(`   POST /api/test-login`);
    console.log("=====================================");
});