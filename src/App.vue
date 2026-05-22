<script setup>
import { onMounted } from 'vue';
import { useThemeStore } from './stores/themeStore';

onMounted(() => {
  const themeStore = useThemeStore();
  themeStore.initTheme();
});
</script>

<template>
  <RouterView />

  <Toaster
    richColors
    position="top-right"
  />
</template>