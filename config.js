// public/config.js
const API_BASE_URL = 'https://lotatonova-fv0b.onrender.com';
const APP_CONFIG = {
    health: `${API_BASE_URL}/health`,
    login: `${API_BASE_URL}/api/auth/login`,
    profile: `${API_BASE_URL}/api/users/profile`,
    agents: `${API_BASE_URL}/api/tickets/agents`,
    tickets: `${API_BASE_URL}/api/tickets`,
    users: `${API_BASE_URL}/api/users`,
    lotteries: `${API_BASE_URL}/api/lotteries`,
    sales: `${API_BASE_URL}/api/sales`,
    statistics: `${API_BASE_URL}/api/statistics`
};
