import { defineStore } from "pinia";

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    userData: null,
    role: null,
    loading: true,
  }),

  actions: {
    setUser(user) {
      this.user = user;
    },

    setUserData(data) {
      this.userData = data;
    },

    setRole(role) {
      this.role = role;
    },

    setLoading(status) {
      this.loading = status;
    },

    logout() {
      this.user = null;
      this.userData = null;
      this.role = null;
    },
  },
});