# Nova Lotto - Système de Gestion de Loterie

##  📋 Description
Système multi-niveaux de gestion de loterie avec 5 types d'utilisateurs.

##  🚀 Déploiement Rapide

### 1. Configuration Supabase
1. Créez un projet sur [supabase.com](https://supabase.com)
2. Exécutez le script SQL `supabase-setup.sql`
3. Notez l'URL et la clé anon

### 2. Déploiement Render
1. Poussez ce code sur GitHub
2. Créez un service Web sur [render.com](https://render.com)
3. Configurez les variables d'environnement :
   - `SUPABASE_URL` : Votre URL Supabase
   - `SUPABASE_KEY` : Votre clé anon Supabase
   - `JWT_SECRET` : Une phrase secrète
   - `NODE_ENV` : production

### 3. Accès
- **Application** : https://votre-app.onrender.com
- **Admin Master** : https://votre-app.onrender.com/admin-master.html
- **Connexion** : https://votre-app.onrender.com/index.html

##  👥 Types d'utilisateurs
1. **Master** : Accès total
2. **Admin Sous-Système** : Gère un sous-système
3. **Superviseur Niveau 2** : Supervise les superviseurs niveau 1
4. **Superviseur Niveau 1** : Supervise les agents
5. **Agent** : Vente de tickets

##  🔧 Développement Local
```bash
npm install
cp .env.example .env
# Configurez .env avec vos credentials
npm run dev
