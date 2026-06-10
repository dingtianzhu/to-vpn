import type { AxiosRequestConfig } from "axios";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { secureGet, secureSet, SECURE_KEYS } from "./secureStorage";

// 使用环境变量
const baseURL =
  import.meta.env.VITE_API_BASE_URL || "https://api.tovpn-service.com/api/v1";

// 标记是否在 Tauri 环境中运行
const isTauri = typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
const requestFetch = isTauri ? tauriFetch : fetch;

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
    const response = await requestFetch(`${baseURL}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const res = await response.json();

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

// 处理 Token 过期和自动重试
async function handleTokenExpired(
  originalRequest: AxiosRequestConfig & { _retry?: boolean }
): Promise<any> {
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
        resolve(request(originalRequest));
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
    return request(originalRequest);
  } else {
    // 通知等待者刷新失败
    onTokenRefreshed("");
    return Promise.reject(new Error("Session expired"));
  }
}

// 统一的请求函数，使用 Tauri 原生 Fetch 规避 CORS & Mixed Content
export async function request<T>(config: AxiosRequestConfig & { _retry?: boolean }): Promise<T> {
  // 1. 构建完整的 URL (合并 baseURL 与 params)
  let url = config.url || "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `${baseURL}${url}`;
  }

  if (config.params) {
    const searchParams = new URLSearchParams();
    Object.entries(config.params).forEach(([key, val]) => {
      if (val !== undefined && val !== null) {
        searchParams.append(key, String(val));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  // 2. 构建 Headers
  const headers: Record<string, string> = {};
  if (config.headers) {
    Object.entries(config.headers).forEach(([key, val]) => {
      headers[key] = String(val);
    });
  }

  // 注入 Authorization header (若不存在)
  const token = await getToken();
  if (token && !headers["Authorization"]) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // 3. 处理 Body (data)
  let body: any = undefined;
  if (config.data !== undefined) {
    if (config.data instanceof FormData) {
      body = config.data;
      // Fetch 会在发送 FormData 时自动处理 Content-Type 和 boundary，
      // 如果 axios config 传了 multipart/form-data，这里需要删掉以免覆盖 fetch 自动生成的 boundary。
      Object.keys(headers).forEach((key) => {
        if (key.toLowerCase() === "content-type" && headers[key].includes("multipart/form-data")) {
          delete headers[key];
        }
      });
    } else {
      body = JSON.stringify(config.data);
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  // 4. 处理超时
  const controller = new AbortController();
  const timeout = config.timeout ?? 10000;
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  // 5. 执行请求
  const method = (config.method || "GET").toUpperCase();
  try {
    const response = await requestFetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // 6. 处理 401 状态码 (Token 过期)
    if (response.status === 401) {
      return await handleTokenExpired(config);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const res = await response.json();

    // 7. 处理业务错误码 (非 0 表示有错误)
    if (res.code !== 0) {
      throw new Error(res.message || "Error");
    }

    return res.data as T;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("Request timeout");
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(String(error));
  }
}

export default request;
