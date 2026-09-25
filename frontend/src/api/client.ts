import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
});

// Request interceptor: aggiunge il JWT ad ogni richiesta
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('saltacode_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: gestisce token rinnovato e 401
apiClient.interceptors.response.use(
  (response) => {
    // Se il server ha rinnovato il token, salvalo
    const renewedToken = response.headers['x-renewed-token'] as string | undefined;
    if (renewedToken) {
      localStorage.setItem('saltacode_token', renewedToken);
    }
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const url = error.config?.url ?? '';
      // Redirect al login SOLO se la sessione era attiva (token presente)
      // e NON durante login/select-role/switch-role (che generano 401 legittimi)
      const isAuthRoute = url.includes('/auth/login') ||
                          url.includes('/auth/select-role') ||
                          url.includes('/auth/switch-role') ||
                          url.includes('/utenti/change-password') ||
                          url.includes('/utenti/me');
      const hasToken = !!localStorage.getItem('saltacode_token');

      if (hasToken && !isAuthRoute) {
        // Token scaduto o non valido → pulisce e reindirizza
        localStorage.removeItem('saltacode_token');
        localStorage.removeItem('saltacode_user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
