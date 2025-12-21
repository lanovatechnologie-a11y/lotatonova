// Configuration de l'API
const API_BASE_URL = window.location.origin;
const APP_CONFIG = {
    // Base URLs
    apiBaseUrl: API_BASE_URL,
    
    // API Endpoints
    health: `${API_BASE_URL}/api/health`,
    login: `${API_BASE_URL}/api/auth/login`,
    profile: `${API_BASE_URL}/api/users/profile`,
    agents: `${API_BASE_URL}/api/users/agents`,
    
    // Tickets
    tickets: `${API_BASE_URL}/api/tickets`,
    validateTicket: `${API_BASE_URL}/api/tickets/validate`,
    pendingTickets: `${API_BASE_URL}/api/tickets/pending`,
    createTicket: `${API_BASE_URL}/api/tickets/create`,
    
    // Test
    testSupabase: `${API_BASE_URL}/api/test/supabase`
};

// Exposer la configuration globalement
window.APP_CONFIG = APP_CONFIG;

// Classe API Client simplifiée
class ApiClient {
    constructor() {
        this.baseURL = API_BASE_URL;
        this.token = localStorage.getItem('novaLottoToken');
        this.user = JSON.parse(localStorage.getItem('novaLottoUser') || 'null');
    }
    
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                this.logout();
                return null;
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.message || 'Erreur serveur');
            }
            
            return data;
            
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    async login(userType, credentials) {
        const response = await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ ...credentials, userType })
        });
        
        if (response && response.success && response.token) {
            this.token = response.token;
            this.user = response.user;
            
            localStorage.setItem('novaLottoToken', response.token);
            localStorage.setItem('novaLottoUser', JSON.stringify(response.user));
            
            // Stocker également dans sessionStorage pour compatibilité
            sessionStorage.setItem('auth_token', response.token);
            sessionStorage.setItem('user', JSON.stringify(response.user));
        }
        
        return response;
    }
    
    async getProfile() {
        return this.request('/api/users/profile');
    }
    
    async validateTicket(ticketId) {
        return this.request('/api/tickets/validate', {
            method: 'POST',
            body: JSON.stringify({ ticketId })
        });
    }
    
    async getPendingTickets() {
        return this.request('/api/tickets/pending');
    }
    
    async getAgents() {
        return this.request('/api/users/agents');
    }
    
    async createTicket(ticketData) {
        return this.request('/api/tickets/create', {
            method: 'POST',
            body: JSON.stringify(ticketData)
        });
    }
    
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('novaLottoToken');
        localStorage.removeItem('novaLottoUser');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('user');
        window.location.href = '/index.html';
    }
    
    isAuthenticated() {
        return !!this.token && !!this.user;
    }
    
    getUser() {
        return this.user;
    }
}

// Créer une instance globale
window.apiClient = new ApiClient();