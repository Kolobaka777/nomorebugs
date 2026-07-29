// Single source of truth for the backend API origin. Override via the
// VITE_API_BASE_URL env var (see client/.env.example) for any environment
// other than local dev.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';
