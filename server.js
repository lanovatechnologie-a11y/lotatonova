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

        // Tables à vérifier selon le rôle
        let tablesToCheck = [];
        
        if (role === 'master') {
            tablesToCheck = ['masters'];
        } else if (role === 'subsystem_admin') {
            tablesToCheck = ['subsystem_admins'];
        } else {
            // Auto-détection : vérifier toutes les tables
            tablesToCheck = [
                'masters',
                'subsystem_admins', 
                'supervisors_level2',
                'supervisors_level1',
                'agents'
            ];
        }

        // Essayer chaque table
        for (const table of tablesToCheck) {
            console.log(`   Vérification dans ${table}...`);
            
            try {
                // Chercher l'utilisateur
                const { data, error } = await supabase
                    .from(table)
                    .select("*")
                    .eq("nom_d'utilisateur", username)
                    .single();

                if (error) {
                    console.log(`   ℹ️ Non trouvé dans ${table}`);
                    continue;
                }

                if (!data) {
                    continue;
                }

                console.log(`   ✓ Utilisateur trouvé dans ${table}`);

                // Vérifier le mot de passe
                // Si vous utilisez bcrypt, décommentez cette section :
                /*
                const bcrypt = await import('bcryptjs');
                const match = await bcrypt.compare(password, data.mot_de_passe);
                if (!match) {
                    console.log(`   ✗ Mot de passe incorrect`);
                    return res.status(401).json({
                        success: false,
                        error: "Identifiants incorrects"
                    });
                }
                */

                // Comparaison simple (TEMPORAIRE - utilisez bcrypt en production)
                if (data.mot_de_passe !== password) {
                    console.log(`   ✗ Mot de passe incorrect`);
                    return res.status(401).json({
                        success: false,
                        error: "Identifiants incorrects"
                    });
                }

                console.log(`   ✓ Authentification réussie !`);

                // Mettre à jour la dernière connexion
                await supabase
                    .from(table)
                    .update({ last_login: new Date().toISOString() })
                    .eq("id", data.id);

                // Générer un token simple (utilisez JWT en production)
                const token = Buffer.from(`${data.id}:${table}:${Date.now()}`).toString('base64');

                // Réponse selon le type d'utilisateur
                const response = {
                    success: true,
                    token: token,
                    user: {
                        id: data.id,
                        username: data["nom_d'utilisateur"],
                        role: table,
                        name: data.nom || data["nom_d'utilisateur"]
                    }
                };

                // Ajouter les infos spécifiques selon le rôle
                if (table === 'subsystem_admins' && data.subsystem_id) {
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
                console.error(`   ✗ Erreur dans ${table}:`, tableError.message);
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
            .select('nom_d\'utilisateur')
            .limit(1);

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
            hasData: data && data.length > 0
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