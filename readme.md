# LOTATO System

Système de gestion de loterie pour borlette haïtienne.

## Déploiement Rapide

### 1. Forkez ce dépôt sur GitHub

### 2. Déployez sur Render.com :

1. Créez un nouveau "Web Service"
2. Connectez votre dépôt GitHub
3. Configuration :
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Port**: `10000`
4. Ajoutez la variable d'environnement :
   - `MONGODB_URI` = votre URI MongoDB

### 3. Initialisez la base de données :

Dans la console de Render :
```bash
npm run init-db