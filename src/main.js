import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import 'mapbox-gl/dist/mapbox-gl.css'
import { initAuth } from "./services/authService";
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import router from './router'
import { createPinia } from 'pinia'

const app = createApp(App)

app.use(createPinia())
app.use(router)
initAuth();
app.component("Toaster", Toaster);

app.mount('#app')