const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = 3001; // Port de ce sous-système
const MAIN_SYSTEM_URL = 'http://localhost:3000'; // URL du Grand Système (à adapter)

// Middleware
app.use(cors());
app.use(express.json());

// --- CONFIGURATION DU SOUS-SYSTÈME ---
const subsystemConfig = {
    name: "Subsystem Gestion", // Nom de votre sous-système
    type: "Gestion",
    port: PORT,
    address: `http://localhost:${PORT}`
};

// --- LISTE DES UTILISATEURS A ENREGISTRER ---
// Note: On ne met pas encore le subsystemId, on l'ajoutera dynamiquement
const usersToRegister = [
    { username: "Superviseur1", role: "superviseur", email: "sup1@test.com", password: "123" },
    { username: "Superviseur2", role: "superviseur", email: "sup2@test.com", password: "123" },
    { username: "Agent1", role: "agent", email: "agent1@test.com", password: "123" }
];

// --- FONCTION D'INITIALISATION ---
async function initializeSystem() {
    console.log("⏳ Démarrage de l'enregistrement du système...");

    try {
        // ÉTAPE 1 : Enregistrer le sous-système lui-même
        console.log(`-> Tentative de connexion au Grand Système sur ${MAIN_SYSTEM_URL}...`);
        
        const subResponse = await axios.post(`${MAIN_SYSTEM_URL}/api/subsystems`, subsystemConfig);

        // On récupère l'ID ou le Token renvoyé par le Grand Système
        // Adaptez 'subResponse.data._id' selon ce que votre Grand Système renvoie vraiment (ex: .id, .token, .data._id)
        const subsystemId = subResponse.data._id || subResponse.data.id;

        if (!subsystemId) {
            throw new Error("Le Grand Système n'a pas renvoyé d'ID pour ce sous-système.");
        }

        console.log(`✅ Sous-système enregistré avec succès ! ID reçu : ${subsystemId}`);

        // ÉTAPE 2 : Enregistrer les utilisateurs MAINTENANT que nous avons l'ID
        console.log(`-> Début de l'enregistrement des ${usersToRegister.length} utilisateurs...`);

        // On utilise une boucle for...of pour gérer l'async/await proprement
        for (const user of usersToRegister) {
            try {
                // On injecte l'ID du sous-système dans les données de l'utilisateur
                const userData = {
                    ...user,
                    subsystemId: subsystemId // C'est ici que la magie opère : on lie l'user au sous-système
                };

                await axios.post(`${MAIN_SYSTEM_URL}/api/users`, userData);
                console.log(`   ✅ Utilisateur enregistré : ${user.username} (${user.role})`);
            } catch (userError) {
                console.error(`   ❌ Échec pour ${user.username} :`, userError.response?.data || userError.message);
            }
        }

        console.log("🎉 Initialisation complète terminée.");

    } catch (error) {
        console.error("❌ ERREUR CRITIQUE lors de l'initialisation :");
        if (error.code === 'ECONNREFUSED') {
            console.error("   Impossible de joindre le Grand Système. Vérifiez qu'il est allumé.");
        } else {
            console.error("   ", error.response?.data || error.message);
        }
    }
}

// --- ROUTES DU SOUS-SYSTÈME (Optionnel, pour recevoir des ordres) ---
app.get('/status', (req, res) => {
    res.json({ status: "Online", config: subsystemConfig });
});

// --- LANCEMENT DU SERVEUR ---
app.listen(PORT, () => {
    console.log(`🚀 Serveur du Sous-système lancé sur le port ${PORT}`);
    
    // On lance l'initialisation APRES que le serveur soit prêt
    // Petit délai pour être sûr que tout est stable
    setTimeout(initializeSystem, 2000); 
});
