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
  const isApproved = authStore.userData?.isApproved !== false;

  // Si la ruta requiere autenticación y no está logueado
  if (to.meta.requiresAuth && !isAuthenticated) {
    return next({ name: "login" });
  }

  // Si la ruta exige un rol específico y el usuario tiene otro o no está aprobado
  if (to.meta.role && to.meta.role !== userRole) {
    if (userRole === "admin") return next({ name: "admin" });
    if (userRole === "driver") {
      if (!isApproved) return next({ name: "login" });
      return next({ name: "driver" });
    }
    if (userRole === "client") return next({ name: "client" });
    return next({ name: "login" });
  }

  // Si es un chofer no aprobado intentando entrar a su panel
  if (to.name === "driver" && userRole === "driver" && !isApproved) {
    return next({ name: "login" });
  }

  // Si está logueado e intenta ir al Login, mandarlo a su panel
  if (to.meta.requiresGuest && isAuthenticated) {
    if (userRole === "driver" && !isApproved) {
      // Chofer no aprobado se queda en login para ver la pantalla de WhatsApp
      return next();
    }
    return next({ name: userRole || "client" });
  }

  next();
});

export default router;