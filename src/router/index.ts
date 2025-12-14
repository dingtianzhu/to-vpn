import { createRouter, createWebHashHistory } from "vue-router";
import { ref } from "vue";
import HomeView from "@/views/HomeView.vue";
import { useAuthStore } from "@/stores/auth";

// 路由加载状态（可在组件中使用）
export const isRouteLoading = ref(false);
export const routeError = ref<string | null>(null);

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView,
    },
    {
      path: "/servers",
      name: "servers",
      component: () => import("@/views/ServersView.vue"),
    },
    {
      path: "/logs",
      name: "logs",
      component: () => import("@/views/LogsView.vue"),
    },
    {
      path: "/settings",
      name: "settings",
      component: () => import("@/views/SettingsView.vue"),
    },
    {
      path: "/stats",
      name: "stats",
      component: () => import("@/views/StatsView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/profile",
      name: "profile",
      component: () => import("@/views/ProfileView.vue"),
      meta: { requiresAuth: true },
    },
    {
      path: "/login",
      name: "login",
      component: () => import("@/views/auth/LoginView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    {
      path: "/register",
      name: "register",
      component: () => import("@/views/auth/RegisterView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    {
      path: "/forget",
      name: "forget",
      component: () => import("@/views/auth/ForgotPasswordView.vue"),
      meta: { hideSidebar: true, guestOnly: true },
    },
    {
      path: "/tray",
      name: "tray",
      component: () => import("@/views/TrayView.vue"),
      meta: { hideSidebar: true, isTray: true },
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/",
    },
  ],
});

// 路由守卫
router.beforeEach(async (to, _from, next) => {
  // 开始加载
  isRouteLoading.value = true;
  routeError.value = null;

  try {
    const authStore = useAuthStore();

    // 等待 token 初始化完成（如果尚未完成）
    if (!authStore.isTokensLoaded) {
      await authStore.initializeTokens();
    }

    // 检查 Token 有效性
    if (authStore.accessToken && !authStore.isTokenValid) {
      const refreshed = await authStore.checkAndRefreshToken();
      if (!refreshed && to.meta.requiresAuth) {
        // Token 刷新失败且需要认证，跳转登录
        return next({
          path: "/login",
          query: { redirect: to.fullPath },
        });
      }
    }

    // 需要登录但未登录 -> 跳转登录页并记录目标
    if (to.meta.requiresAuth && !authStore.isAuthenticated) {
      return next({
        path: "/login",
        query: { redirect: to.fullPath },
      });
    }

    // 已登录但访问登录页 -> 跳转到首页或 redirect 目标
    if (to.meta.guestOnly && authStore.isAuthenticated) {
      const redirect = to.query.redirect as string;
      if (redirect && redirect.startsWith("/") && !redirect.startsWith("//")) {
        return next(redirect);
      }
      return next("/");
    }

    next();
  } catch (error) {
    console.error("Router guard error:", error);
    routeError.value =
      error instanceof Error ? error.message : "Navigation error";

    // 发生错误时，如果是需要认证的页面，跳转到登录
    if (to.meta.requiresAuth) {
      return next({
        path: "/login",
        query: { redirect: to.fullPath },
      });
    }

    // 其他情况继续导航
    next();
  }
});

// 路由加载完成
router.afterEach(() => {
  isRouteLoading.value = false;
});

// 路由错误处理
router.onError((error) => {
  console.error("Router error:", error);
  isRouteLoading.value = false;
  routeError.value = error.message || "Failed to load page";
});

export default router;
