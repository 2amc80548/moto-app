import { defineStore } from "pinia";

export const useDriverStore = defineStore("driver", {
  state: () => ({
    online: false,
    location: null,
  }),

  actions: {
    setOnline(status) {
      this.online = status;
    },

    setLocation(location) {
      this.location = location;
    },
  },
});