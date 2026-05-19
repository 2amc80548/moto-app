import { defineStore } from "pinia";

export const useAuthStore = defineStore(
  "auth",
  {
    state: () => ({
      user: null,
      role: null,
      loading: true,
    }),

    actions: {

      setUser(user) {
        this.user = user;
      },

      setRole(role) {
        this.role = role;
      },

      setLoading(status) {
        this.loading = status;
      },

      logout() {
        this.user = null;
        this.role = null;
      },
    },
  }
);