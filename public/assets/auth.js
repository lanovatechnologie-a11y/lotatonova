// Vérifier si l'utilisateur est connecté
function checkAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        window.location.href = '/login.html';
        return false;
    }
    return true;
}

// Déconnexion
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// Vérification automatique au chargement (sauf sur login)
if (!window.location.pathname.includes('login.html')) {
    document.addEventListener('DOMContentLoaded', checkAuth);
}

export { checkAuth, logout };
