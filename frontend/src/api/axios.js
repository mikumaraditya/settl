import axios from "axios";

const instance = axios.create({
  baseURL: "http://localhost:5000/api",
});

// automatically attach token to every request
instance.interceptors.request.use((config) => {
  const user = JSON.parse(localStorage.getItem("settl_user"));
  if (user?.token) {
    config.headers.Authorization = `Bearer ${user.token}`;
  }
  return config;
});

export default instance;
