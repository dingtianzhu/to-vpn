import axios, { AxiosRequestConfig, AxiosError } from "axios";
import {
  secureGet,
  secureSet,
  SECURE_KEYS,
} from "./secureStorage";

// 使用环境变量
const baseURL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

const service = axios.create({
  baseURL,
  timeout: 10000,
});

// Token 刷新状态
let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

// 内存中缓存的 token（用于同步访问）
let cachedAccessToken = "";

// 添加等待刷新的请求到队列
function subscribeTokenRefresh(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

// Token 刷新成功后，重发队列中的请求
function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((callback) => callback(newToken));
  refreshSubscribers = [];
}

// 保存 Token 到安全存储
async function setToken(
  access_token: string,
  expireAt: number,
  refresh_token: string
) {
  await secureSet(SECURE_KEYS.ACCESS_TOKEN, access_token);
  await secureSet(SECURE_KEYS.REFRESH_TOKEN, refresh_token);
  await secureSet(SECURE_KEYS.TOKEN_EXPIRE_AT, expireAt);
  // 更新内存缓存
  cachedAccessToken = access_token;
}

// 获取 Token（优先从内存缓存，否则从安全存储）
async function getToken(): Promise<string> {
  if (cachedAccessToken) {
    return cachedAccessToken;
  }
  cachedAccessToken = await secureGet(SECURE_KEYS.ACCESS_TOKEN, "");
  return cachedAccessToken;
}

// 更新内存中的 token 缓存（供 auth store 调用）
export function updateCachedToken(token: string) {
  cachedAccessToken = token;
}

// 刷新 Token
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await secureGet(SECURE_KEYS.REFRESH_TOKEN, "");

  if (!refreshToken) {
    return null;
  }

  try {
    const response = await axios.post(`${baseURL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    const res = response.data;

    if (res.code === 0 && res.data) {
      const {
        access_token,
        refresh_token: newRefreshToken,
        expires_in,
      } = res.data;
      const expireAt = Date.now() + expires_in * 1000;
      await setToken(access_token, expireAt, newRefreshToken);

      return access_token;
    }

    return null;
  } catch (error) {
    console.error("Refresh token failed:", error);
    return null;
  }
}
// 请求拦截器（异步获取 token）
service.interceptors.request.use(
  async (config) => {
    const token = await getToken();

    if (token) {
      config.headers = config.headers || {};
      (config.headers as any)["Authorization"] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

async function handleTokenExpired(
  originalRequest: AxiosRequestConfig & { _retry?: boolean }
) {
  // 已经重试过一次，直接失败
  if (originalRequest._retry) {
    return Promise.reject(new Error("Session expired"));
  }
  originalRequest._retry = true;

  // 已经在刷新中：排队等待
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      subscribeTokenRefresh((newToken) => {
        if (!newToken) {
          reject(new Error("Session expired"));
          return;
        }
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
        resolve(service(originalRequest));
      });
    });
  }

  // 第一个触发刷新
  isRefreshing = true;
  const newToken = await refreshAccessToken();
  isRefreshing = false;

  if (newToken) {
    onTokenRefreshed(newToken);
    originalRequest.headers = originalRequest.headers || {};
    originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
    return service(originalRequest);
  } else {
    // 通知等待者刷新失败
    onTokenRefreshed("");
    return Promise.reject(new Error("Session expired"));
  }
}

// 响应拦截器
service.interceptors.response.use(
  (response) => {
    const res = response.data;

    if (res.code !== 0) {
      return Promise.reject(new Error(res.message || "Error"));
    }

    return res.data;
  },
  async (error: AxiosError) => {
    const status = error.response?.status;

    if (status === 401) {
      const originalRequest = error.config as AxiosRequestConfig & {
        _retry?: boolean;
      };
      return handleTokenExpired(originalRequest);
    }

    return Promise.reject(error);
  }
);
export function request<T>(config: AxiosRequestConfig): Promise<T> {
  return service(config) as Promise<T>;
}

export default request;
