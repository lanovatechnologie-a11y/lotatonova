// Vérifier si l'utilisateur est connecté
function checkAuth() {
    const token = sessionStorage.getItem('auth_token');
    
    // Pages publiques
    const publicPages = ['/login.html', '/login', '/'];
    const currentPath = window.location.pathname;
    
    if (publicPages.some(page => currentPath.includes(page))) {
        return true;
    }
    
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    
    return true;
}

// Déconnexion
function logout() {
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Récupérer l'utilisateur actuel
function getCurrentUser() {
    try {
        const user = sessionStorage.getItem('user');
        return user ? JSON.parse(user) : null;
    } catch (e) {
        console.error('Error parsing user:', e);
        return null;
    }
}

// Vérification automatique au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAuth);
} else {
    checkAuth();
}