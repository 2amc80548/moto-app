import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/authStore";

const routes = [
  {
    path: "/",
    name: "login",
    component: () => import("../modules/auth/LoginView.vue"),
    meta: { requiresGuest: true }
  },
  {
    path: "/admin",
    name: "admin",
    component: () => import("../modules/admin/AdminView.vue"),
    meta: { requiresAuth: true, role: "admin" }
  },
  {
    path: "/driver",
    name: "driver",
    component: () => import("../modules/driver/DriverView.vue"),
    meta: { requiresAuth: true, role: "driver" }
  },
  {
    path: "/client",
    name: "client",
    component: () => import("../modules/client/ClientView.vue"),
    meta: { requiresAuth: true, role: "client" }
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// Guardián de navegación global
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // Esperar a que Firebase inicialice el estado si sigue cargando
  if (authStore.loading) {
    // Implementación simple: damos un pequeño margen para que initAuth resuelva
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const isAuthenticated = !!authStore.user;
  const userRole = authStore.role;

  // Si la ruta requiere autenticación y no está logueado
  if (to.meta.requiresAuth && !isAuthenticated) {
    return next({ name: "login" });
  }

  // Si la ruta exige un rol específico y el usuario tiene otro
  if (to.meta.role && to.meta.role !== userRole) {
    // Redirigir a su panel correspondiente según su rol real
    if (userRole === "admin") return next({ name: "admin" });
    if (userRole === "driver") return next({ name: "driver" });
    if (userRole === "client") return next({ name: "client" });
    return next({ name: "login" });
  }

  // Si está logueado e intenta ir al Login, mandarlo a su panel
  if (to.meta.requiresGuest && isAuthenticated) {
    return next({ name: userRole || "client" });
  }

  next();
});

export default router;