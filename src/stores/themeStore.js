import { defineStore } from "pinia";
import { ref, onMounted } from "vue";

export const useThemeStore = defineStore("theme", () => {
  const isDark = ref(false);

  const applyTheme = () => {
    if (isDark.value) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const toggleTheme = () => {
    isDark.value = !isDark.value;
    localStorage.setItem("theme", isDark.value ? "dark" : "light");
    applyTheme();
  };

  const initTheme = () => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      isDark.value = savedTheme === "dark";
    } else {
      // Por defecto oscuro si el sistema lo prefiere, o claro
      isDark.value = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    applyTheme();
  };

  return { isDark, toggleTheme, initTheme };
});
