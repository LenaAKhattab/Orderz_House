import axios from "axios";

export const TOKEN_KEY = "orderz_auth_token";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api",
  timeout: 10000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getHealthStatus = async () => {
  const response = await api.get("/health");
  return response.data;
};

export const loginRequest = async (email, password) => {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
};

export const registerRequest = async (body) => {
  const { data } = await api.post("/auth/register", body);
  return data;
};

export const meRequest = async () => {
  const { data } = await api.get("/auth/me");
  return data;
};

export const getCategoriesRequest = async () => {
  const { data } = await api.get("/categories");
  return data;
};

export default api;
