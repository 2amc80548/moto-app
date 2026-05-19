<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "vue-sonner";
import { LogIn, UserPlus, Car, User } from "lucide-vue-next";

import auth from "../../firebase/auth";
import db from "../../firebase/firestore";
import { useAuthStore } from "../../stores/authStore";

const router = useRouter();
const authStore = useAuthStore();

const isLogin = ref(true);
const loading = ref(false);
const showWhatsappAction = ref(false);
const registeredName = ref("");

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
  <div class="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 font-sans text-slate-800 dark:text-slate-100 transition-colors">
    <div class="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 space-y-6">
      
      <div v-if="!showWhatsappAction">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/30 mb-4 text-white">
            <Car :size="32" />
          </div>
          <h1 class="text-2xl font-black tracking-tight text-slate-900 dark:text-white">MotoYa</h1>
        </div>

        <div class="flex p-1 bg-slate-100 dark:bg-slate-700 rounded-xl mb-6">
          <button @click="isLogin = true" :class="isLogin ? 'bg-white dark:bg-slate-600 shadow-sm font-bold' : 'text-slate-500'" class="flex-1 py-2.5 rounded-lg text-sm transition">Ingresar</button>
          <button @click="isLogin = false" :class="!isLogin ? 'bg-white dark:bg-slate-600 shadow-sm font-bold' : 'text-slate-500'" class="flex-1 py-2.5 rounded-lg text-sm transition">Registrarse</button>
        </div>

        <form @submit.prevent="submitForm" class="space-y-4 text-sm">
          <template v-if="!isLogin">
            <input v-model="name" type="text" placeholder="Nombre Completo *" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 dark:text-white" />
            <input v-model="phone" type="tel" placeholder="Celular" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 dark:text-white" />
            
            <label class="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-xl border border-blue-200 dark:border-blue-800 cursor-pointer">
              <input v-model="registerAsDriver" type="checkbox" class="w-4 h-4 text-blue-600" />
              <div>
                <span class="font-bold block dark:text-blue-400">Registrarme como Chofer</span>
                <span class="text-slate-500 text-[10px]">Requiere aprobación</span>
              </div>
            </label>

            <div v-if="registerAsDriver" class="space-y-4 pt-2">
              <input v-model="dni" type="text" placeholder="N° de Carnet (DNI) *" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none" />
              <input v-model="plate" type="text" placeholder="Placa de la Moto (Opcional)" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none" />
            </div>
          </template>

          <input v-model="email" type="email" placeholder="Correo Electrónico *" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 dark:text-white" />
          <input v-model="password" type="password" placeholder="Contraseña *" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 dark:text-white" />

          <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold p-4 rounded-xl flex items-center justify-center gap-2 mt-4">
            <span v-if="loading" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
            <span>{{ loading ? 'Cargando...' : (isLogin ? 'Ingresar' : 'Registrarme') }}</span>
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