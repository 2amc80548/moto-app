<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "vue-sonner";
import { LogIn, UserPlus, Bike, User, MessageCircle, Sun, Moon, Eye, EyeOff, Mail, Lock, Phone, FileText } from "lucide-vue-next";

import auth from "../../firebase/auth";
import db from "../../firebase/firestore";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";

const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();

const isLogin = ref(true);
const loading = ref(false);
const showWhatsappAction = ref(false);
const registeredName = ref("");
const showPassword = ref(false);

// Campos
const name = ref("");
const email = ref("");
const password = ref("");
const phone = ref("");
const dni = ref(""); // Carnet
const plate = ref(""); // Placa

const registerAsDriver = ref(false);

const handleLogin = async () => {
  if (!email.value || !password.value) return toast.error("Completa todos los campos");
  loading.value = true;
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    const userDoc = await getDoc(doc(db, "users", userCredential.user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      authStore.setUser(userCredential.user);
      authStore.setUserData(userData);
      authStore.setRole(userData.role);

      if (userData.role === "driver" && !userData.isApproved) {
        toast.info("Tu cuenta de Chofer está pendiente de activación.");
      } else {
        toast.success("¡Bienvenido!");
      }
      router.push(`/${userData.role === 'admin' ? 'admin' : userData.role}`);
    }
  } catch (error) {
    toast.error("Credenciales incorrectas");
  } finally {
    loading.value = false;
  }
};

const handleRegister = async () => {
  if (!name.value || !email.value || !password.value) return toast.error("Campos obligatorios faltantes");
  loading.value = true;
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    await updateProfile(userCredential.user, { displayName: name.value });

    const assignedRole = registerAsDriver.value ? "driver" : "client";
    
    const userData = {
      name: name.value,
      email: email.value,
      phone: phone.value,
      dni: registerAsDriver.value ? dni.value : "",
      plate: registerAsDriver.value ? plate.value : "",
      photoUrl: "", // Para futura foto
      role: assignedRole,
      isApproved: !registerAsDriver.value, 
      status: 'active', // Para poder bloquear clientes luego
      createdAt: serverTimestamp()
    };

    if (assignedRole === "driver") userData.pinColor = "#3b82f6";

    await setDoc(doc(db, "users", userCredential.user.uid), userData);
    
    authStore.setUser(userCredential.user);
    authStore.setUserData(userData);
    authStore.setRole(assignedRole);

    if (assignedRole === "driver") {
      registeredName.value = name.value;
      showWhatsappAction.value = true;
    } else {
      toast.success("¡Cuenta creada!");
      router.push("/client");
    }
  } catch (error) {
    toast.error("Error al registrar: " + error.message);
  } finally {
    loading.value = false;
  }
};

const submitForm = () => isLogin.value ? handleLogin() : handleRegister();

const notifyAdmin = () => {
  const msg = `Hola, acabo de registrarme como chofer en MotoYa. Mi nombre es ${registeredName.value} y solicito la activación de mi usuario.`;
  window.open(`https://wa.me/59163591312?text=${encodeURIComponent(msg)}`, "_blank");
  router.push("/driver");
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 font-sans text-slate-800 dark:text-slate-100 transition-colors relative">
    
    <button @click="themeStore.toggleTheme" class="absolute top-6 right-6 p-3 bg-white/80 backdrop-blur-md dark:bg-slate-800/80 rounded-full shadow-lg text-slate-500 dark:text-yellow-400 border border-white dark:border-slate-700 hover:scale-105 transition-transform z-10">
      <Sun v-if="themeStore.isDark" :size="20"/>
      <Moon v-else :size="20"/>
    </button>
    
    <div class="max-w-md w-full bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-700 p-8 sm:p-10 space-y-8 relative z-10 overflow-hidden">
      
      <!-- Decoración de fondo del form -->
      <div class="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div class="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

      <div v-if="!showWhatsappAction" class="relative z-10">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-blue-600 to-blue-400 rounded-[1.5rem] shadow-lg shadow-blue-500/30 mb-5 text-white transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Bike :size="40" />
          </div>
          <h1 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">MotoYa</h1>
          <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-2">Tu transporte rápido y seguro</p>
        </div>

        <div class="flex p-1 bg-slate-50/80 backdrop-blur-sm border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 rounded-2xl mb-8 shadow-inner">
          <button @click="isLogin = true" :class="isLogin ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300">Ingresar</button>
          <button @click="isLogin = false" :class="!isLogin ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'" class="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300">Crear Cuenta</button>
        </div>

        <form @submit.prevent="submitForm" class="space-y-4">
          <template v-if="!isLogin">
            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <User :size="18" />
              </div>
              <input v-model="name" type="text" placeholder="Nombre Completo *" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
            </div>
            
            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <Phone :size="18" />
              </div>
              <input v-model="phone" type="tel" placeholder="Celular" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
            </div>
            
            <label class="flex items-center gap-3 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/50 cursor-pointer hover:border-blue-300 transition-colors">
              <div class="relative flex items-center justify-center">
                <input v-model="registerAsDriver" type="checkbox" class="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              </div>
              <div class="flex-1">
                <span class="font-bold text-sm block text-slate-800 dark:text-blue-300">Registrarme como Chofer</span>
                <span class="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Sujeto a aprobación</span>
              </div>
              <Bike class="text-blue-400 opacity-50" :size="24" />
            </label>

            <div v-if="registerAsDriver" class="space-y-4 pt-2 animate-in slide-in-from-top-2 fade-in duration-300">
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <FileText :size="18" />
                </div>
                <input v-model="dni" type="text" placeholder="N° de Carnet (DNI) *" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
              </div>
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <div class="font-black text-xs">🚗</div>
                </div>
                <input v-model="plate" type="text" placeholder="Placa de la Moto (Opcional)" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
              </div>
            </div>
          </template>

          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Mail :size="18" />
            </div>
            <input v-model="email" type="email" placeholder="Correo Electrónico *" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
          </div>

          <div class="relative group">
            <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
              <Lock :size="18" />
            </div>
            <input v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="Contraseña *" class="w-full pl-11 pr-12 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
            <button type="button" @click="showPassword = !showPassword" class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-blue-500 transition-colors">
              <Eye v-if="!showPassword" :size="18" />
              <EyeOff v-else :size="18" />
            </button>
          </div>

          <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 mt-6 transition-all active:scale-95">
            <span v-if="loading" class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
            <span v-else class="text-sm tracking-wide">{{ isLogin ? 'INGRESAR' : 'REGISTRARME' }}</span>
          </button>
        </form>
      </div>

      <div v-else class="text-center py-6 space-y-4">
        <div class="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <UserPlus :size="40" />
        </div>
        <h2 class="text-xl font-bold dark:text-white">¡Registro Completo!</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">Tu cuenta fue creada, pero necesitas que el administrador la active para empezar a trabajar.</p>
        <button @click="notifyAdmin" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg mt-4 flex justify-center items-center gap-2">
          <MessageCircle /> Notificar por WhatsApp
        </button>
        <button @click="router.push('/driver')" class="text-xs text-slate-400 underline mt-4 block mx-auto">Ir a mi panel (Modo lectura)</button>
      </div>

    </div>
  </div>
</template>