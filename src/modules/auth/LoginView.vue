<script setup>
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile,
  sendPasswordResetEmail,
  signOut
} from "firebase/auth";
import { doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs } from "firebase/firestore";
import { toast } from "vue-sonner";
import { 
  LogIn, 
  UserPlus, 
  Bike, 
  User, 
  MessageCircle, 
  Sun, 
  Moon, 
  Eye, 
  EyeOff, 
  Mail, 
  Lock, 
  Phone, 
  FileText,
  Camera,
  HelpCircle,
  Key,
  ChevronRight,
  Upload,
  RefreshCw,
  Video
} from "lucide-vue-next";

import auth from "../../firebase/auth";
import db from "../../firebase/firestore";
import { useAuthStore } from "../../stores/authStore";
import { useThemeStore } from "../../stores/themeStore";
import { saveLocalPhoto } from "../../utils/indexedDB";

const router = useRouter();
const authStore = useAuthStore();
const themeStore = useThemeStore();

const isLogin = ref(true);
const loading = ref(false);
const showWhatsappAction = ref(false);
const registeredName = ref("");
const showPassword = ref(false);

// Campos de registro / login estándar
const name = ref("");
const email = ref("");
const password = ref("");
const phone = ref("");
const dni = ref(""); // Carnet
const plate = ref(""); // Placa
const registerAsDriver = ref(false);
const base64Photo = ref("");

// Modal de Recuperación
const showRecoveryModal = ref(false);
const recoverySearchInput = ref("");
const foundUser = ref(null);
const searchingRecovery = ref(false);

// Cámara Web
const showCamera = ref(false);
const videoElement = ref(null);
const cameraStream = ref(null);
const capturing = ref(false);

onMounted(() => {
  if (authStore.user && authStore.role === 'driver' && authStore.userData?.isApproved === false) {
    registeredName.value = authStore.userData.name;
    showWhatsappAction.value = true;
  }
});

const startCamera = async () => {
  showCamera.value = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: false
    });
    cameraStream.value = stream;
    setTimeout(() => {
      if (videoElement.value) {
        videoElement.value.srcObject = stream;
      }
    }, 150);
  } catch (error) {
    console.error("Camera access error:", error);
    toast.error("No se pudo acceder a la cámara. Por favor, concede los permisos de cámara en tu navegador.");
    showCamera.value = false;
  }
};

const stopCamera = () => {
  if (cameraStream.value) {
    cameraStream.value.getTracks().forEach(track => track.stop());
    cameraStream.value = null;
  }
  showCamera.value = false;
};

const capturePhoto = () => {
  if (!videoElement.value) return;
  capturing.value = true;
  try {
    const canvas = document.createElement("canvas");
    const video = videoElement.value;
    
    // Obtener dimensiones reales
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    
    // Recortar a cuadrado central
    const size = Math.min(videoWidth, videoHeight);
    const startX = (videoWidth - size) / 2;
    const startY = (videoHeight - size) / 2;
    
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    
    ctx.drawImage(video, startX, startY, size, size, 0, 0, 400, 400);
    
    base64Photo.value = canvas.toDataURL("image/jpeg");
    toast.success("Foto tomada correctamente");
    stopCamera();
  } catch (error) {
    console.error("Capture error:", error);
    toast.error("Error al capturar la foto");
  } finally {
    capturing.value = false;
  }
};

const handlePhotoUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    return toast.error("La foto es demasiado grande. Máximo 2MB.");
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    base64Photo.value = e.target.result;
    toast.success("Foto de galería cargada correctamente");
  };
  reader.readAsDataURL(file);
};

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
        registeredName.value = userData.name;
        showWhatsappAction.value = true;
      } else {
        toast.success("¡Bienvenido a MotoCab!");
        router.push(`/${userData.role === 'admin' ? 'admin' : userData.role}`);
      }
    } else {
      toast.error("No se encontró el registro en la base de datos.");
    }
  } catch (error) {
    toast.error("Credenciales incorrectas o error en el servidor");
  } finally {
    loading.value = false;
  }
};

const handleRegister = async () => {
  if (!name.value || !email.value || !password.value || !phone.value || !dni.value) {
    return toast.error("Campos obligatorios faltantes (*)");
  }
  
  // Validar celular: 8 dígitos empezando por 6 o 7
  const phoneRegex = /^[67]\d{7}$/;
  if (!phoneRegex.test(phone.value.trim())) {
    return toast.error("El número de celular debe tener exactamente 8 dígitos y comenzar con 6 o 7.");
  }

  if (registerAsDriver.value && !base64Photo.value) {
    return toast.error("La foto de perfil es obligatoria para choferes");
  }

  loading.value = true;
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    await updateProfile(userCredential.user, { displayName: name.value });

    const assignedRole = registerAsDriver.value ? "driver" : "client";
    
    const userData = {
      name: name.value,
      email: email.value,
      phone: phone.value.trim(),
      dni: dni.value.trim(),
      plate: registerAsDriver.value ? plate.value : "",
      photoUrl: base64Photo.value || "",
      role: assignedRole,
      isApproved: !registerAsDriver.value,
      status: 'active',
      createdAt: serverTimestamp()
    };

    if (assignedRole === "driver") userData.pinColor = "#3b82f6";

    await setDoc(doc(db, "users", userCredential.user.uid), userData);

    if (assignedRole === "driver" && base64Photo.value) {
      await saveLocalPhoto(userCredential.user.uid, base64Photo.value);
    }
    
    authStore.setUser(userCredential.user);
    authStore.setUserData(userData);
    authStore.setRole(assignedRole);

    if (assignedRole === "driver") {
      registeredName.value = userData.name;
      showWhatsappAction.value = true;
      toast.success("¡Registro de Chofer completo! Esperando aprobación.");
    } else {
      toast.success("¡Cuenta creada exitosamente!");
      router.push("/client");
    }
  } catch (error) {
    toast.error("Error al registrar: " + error.message);
  } finally {
    loading.value = false;
  }
};

const searchRecoveryAccount = async () => {
  if (!recoverySearchInput.value.trim()) return toast.error("Ingresa tu celular o carnet");
  searchingRecovery.value = true;
  foundUser.value = null;
  try {
    const q1 = query(collection(db, "users"), where("phone", "==", recoverySearchInput.value.trim()));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      foundUser.value = { id: snap1.docs[0].id, ...snap1.docs[0].data() };
      return;
    }
    
    const q2 = query(collection(db, "users"), where("dni", "==", recoverySearchInput.value.trim()));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      foundUser.value = { id: snap2.docs[0].id, ...snap2.docs[0].data() };
      return;
    }
    
    toast.error("No se encontró ninguna cuenta asociada");
  } catch (error) {
    toast.error("Error en la búsqueda");
  } finally {
    searchingRecovery.value = false;
  }
};

const sendRecoveryEmail = async () => {
  if (!foundUser.value?.email) return;
  try {
    await sendPasswordResetEmail(auth, foundUser.value.email);
    toast.success("Enlace enviado al correo de recuperación.");
    showRecoveryModal.value = false;
  } catch (error) {
    toast.error("Error al enviar correo de recuperación");
  }
};

const contactAdminForRecovery = () => {
  const user = foundUser.value;
  const msg = `Hola Administrador de MotoCab, perdí el acceso a mi correo para la cuenta de DNI/Celular ${recoverySearchInput.value.trim()}. Mi nombre es ${user?.name || ''}. Solicito ayuda para cambiar mi correo.`;
  window.open(`https://wa.me/59163591312?text=${encodeURIComponent(msg)}`, "_blank");
};

const maskEmail = (email) => {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const nameStr = parts[0];
  const domain = parts[1];
  if (nameStr.length <= 2) return `**@${domain}`;
  return `${nameStr[0]}${"*".repeat(nameStr.length - 2)}${nameStr[nameStr.length - 1]}@${domain}`;
};

const submitForm = () => isLogin.value ? handleLogin() : handleRegister();

const notifyAdmin = () => {
  const msg = `Hola, acabo de registrarme como chofer en MotoCab. Mi nombre es ${registeredName.value} y solicito la activación de mi usuario.`;
  window.open(`https://wa.me/59163591312?text=${encodeURIComponent(msg)}`, "_blank");
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-950 px-4 font-sans text-slate-800 dark:text-slate-100 transition-colors relative overflow-hidden">
    
    <!-- Esferas decorativas de fondo -->
    <div class="absolute w-[500px] h-[500px] rounded-full bg-blue-500/5 -top-40 -left-40 blur-3xl pointer-events-none"></div>
    <div class="absolute w-[500px] h-[500px] rounded-full bg-emerald-500/5 -bottom-40 -right-40 blur-3xl pointer-events-none"></div>

    <button @click="themeStore.toggleTheme" class="absolute top-6 right-6 p-3 bg-white/80 backdrop-blur-md dark:bg-slate-800/80 rounded-full shadow-lg text-slate-500 dark:text-yellow-400 border border-white dark:border-slate-700 hover:scale-105 transition-transform z-10">
      <Sun v-if="themeStore.isDark" :size="20"/>
      <Moon v-else :size="20"/>
    </button>
    
    <div class="max-w-md w-full bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-slate-700 p-8 sm:p-10 space-y-6 relative z-10 overflow-hidden">
      
      <!-- PANTALLA WHATSAPP (CHOFER PENDIENTE) -->
      <div v-if="showWhatsappAction" class="text-center py-6 space-y-4">
        <div class="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-[1.8rem] flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/20 transform -rotate-3">
          <UserPlus :size="40" />
        </div>
        <h2 class="text-2xl font-black dark:text-white">¡Registro Completo!</h2>
        <p class="text-sm text-slate-500 dark:text-slate-400">Tu cuenta fue creada exitosamente, pero es necesario que el administrador la apruebe para poder ingresar a trabajar.</p>
        <button @click="notifyAdmin" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 mt-6 flex justify-center items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all">
          <MessageCircle /> Notificar por WhatsApp
        </button>
        <button @click="signOut(auth); showWhatsappAction = false; isLogin = true;" class="text-xs text-slate-400 underline mt-4 block mx-auto hover:text-slate-600 dark:hover:text-slate-300">Cerrar Sesión / Volver</button>
      </div>

      <!-- INGRESO / REGISTRO ESTÁNDAR -->
      <div v-else class="relative z-10">
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-[1.3rem] shadow-lg shadow-blue-500/30 mb-4 text-white transform -rotate-6 hover:rotate-0 transition-transform duration-300">
            <Bike :size="34" />
          </div>
          <h1 class="text-3xl font-black tracking-tight text-slate-900 dark:text-white">MotoCab</h1>
          <p class="text-xs font-semibold text-slate-400 dark:text-slate-500 mt-1">Rápido. Confiable. Seguro.</p>
        </div>

        <div class="flex p-1 bg-slate-50 border border-slate-100 dark:border-slate-700 dark:bg-slate-900/50 rounded-2xl mb-6">
          <button @click="isLogin = true" :class="isLogin ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500'" class="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300">Ingresar</button>
          <button @click="isLogin = false" :class="!isLogin ? 'bg-white dark:bg-slate-700 shadow text-blue-600 dark:text-blue-400' : 'text-slate-500'" class="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-300">Crear Cuenta</button>
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
              <input v-model="phone" type="tel" placeholder="Celular (8 dígitos, empieza con 6 o 7) *" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
            </div>

            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                <FileText :size="18" />
              </div>
              <input v-model="dni" type="text" placeholder="N° de Carnet (DNI) *" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
            </div>
            
            <label class="flex items-center gap-3 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-900/20 p-4 rounded-2xl border border-blue-100 dark:border-blue-800/50 cursor-pointer hover:border-blue-300 transition-colors">
              <input v-model="registerAsDriver" type="checkbox" class="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              <div class="flex-1">
                <span class="font-bold text-sm block text-slate-800 dark:text-blue-300">Registrarme como Chofer</span>
                <span class="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold tracking-wider">Requiere Aprobación</span>
              </div>
              <Bike class="text-blue-500 opacity-60 animate-bounce" :size="24" />
            </label>

            <div v-if="registerAsDriver" class="space-y-4 pt-2 animate-in slide-in-from-top-2 fade-in duration-300">
              <div class="relative group">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-blue-500 transition-colors">
                  <span class="text-xs font-black">🚗</span>
                </div>
                <input v-model="plate" type="text" placeholder="Placa de la Moto (Opcional)" class="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white dark:focus:bg-slate-800" />
              </div>

              <!-- Foto de perfil (Galería o Cámara) -->
              <div class="border border-dashed border-slate-250 dark:border-slate-700 rounded-2xl p-4 flex flex-col items-center justify-center gap-3 bg-slate-50/50 dark:bg-slate-900/20">
                <div v-if="base64Photo" class="relative">
                  <img :src="base64Photo" class="w-20 h-20 rounded-full object-cover border-2 border-blue-500 shadow" />
                  <button type="button" @click="base64Photo = ''" class="absolute -top-1 -right-1 bg-rose-500 text-white rounded-full p-1 text-[8px] font-bold">✕</button>
                </div>
                <div v-else class="flex flex-col items-center gap-2 w-full">
                  <span class="text-xs font-bold text-slate-400">Foto de Perfil *</span>
                  <div class="flex gap-4 w-full">
                    <button type="button" @click="startCamera" class="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 dark:text-white transition">
                      <Video :size="14" /> Tomar Foto
                    </button>
                    <label class="flex-1 py-2 px-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-2 dark:text-white transition cursor-pointer text-center">
                      <Upload :size="14" /> Galería
                      <input type="file" accept="image/*" class="hidden" @change="handlePhotoUpload" />
                    </label>
                  </div>
                </div>
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

          <!-- Olvidó sus datos -->
          <div class="text-right" v-if="isLogin">
            <button type="button" @click="showRecoveryModal = true" class="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">¿Olvidaste tus datos?</button>
          </div>

          <button type="submit" :disabled="loading" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 mt-2 hover:scale-[1.02] active:scale-95 transition-all">
            <span v-if="loading" class="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
            <span v-else class="text-sm tracking-wide">{{ isLogin ? 'INGRESAR' : 'REGISTRARME' }}</span>
          </button>
        </form>
      </div>

    </div>

    <!-- MODAL DE RECUPERACIÓN -->
    <div v-if="showRecoveryModal" class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white dark:bg-slate-800 rounded-[2rem] w-full max-w-md p-6 shadow-2xl relative border border-white/20 dark:border-slate-700 animate-in zoom-in-95 duration-200">
        <button @click="showRecoveryModal = false; foundUser = null; recoverySearchInput = '';" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 font-bold">✕</button>
        <h2 class="text-xl font-black mb-2 dark:text-white flex items-center gap-2">
          <HelpCircle class="text-blue-500" /> Recuperar Cuenta
        </h2>
        <p class="text-xs text-slate-400 mb-6">Busca tu cuenta de MotoCab utilizando tu Celular o número de Carnet.</p>

        <div class="space-y-4">
          <div class="flex gap-2">
            <input v-model="recoverySearchInput" type="text" placeholder="Celular o Carnet (DNI)" class="flex-grow p-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none dark:text-white focus:border-blue-500">
            <button @click="searchRecoveryAccount" :disabled="searchingRecovery" class="bg-blue-600 text-white font-bold px-4 rounded-xl flex items-center justify-center hover:bg-blue-700">
              <span v-if="searchingRecovery" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></span>
              <span v-else>Buscar</span>
            </button>
          </div>

          <!-- RESULTADO DE BÚSQUEDA -->
          <div v-if="foundUser" class="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4 animate-in fade-in duration-300">
            <div>
              <span class="text-[10px] font-black uppercase text-slate-400">Usuario Encontrado</span>
              <p class="font-extrabold text-slate-800 dark:text-white text-base mt-0.5">{{ foundUser.name }}</p>
            </div>
            <div>
              <span class="text-[10px] font-black uppercase text-slate-400">Correo Asociado</span>
              <p class="font-extrabold text-blue-600 dark:text-blue-400 text-sm mt-0.5">{{ maskEmail(foundUser.email) }}</p>
            </div>

            <button @click="sendRecoveryEmail" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm shadow-blue-500/10">
              <Key :size="16" /> Enviar correo de restablecimiento
            </button>

            <div class="border-t border-slate-200 dark:border-slate-700 pt-3">
              <p class="text-xs text-slate-400 mb-2">¿No tienes acceso a este correo? El administrador puede cambiarlo en la consola.</p>
              <button @click="contactAdminForRecovery" class="w-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-xs border border-emerald-200/50 hover:bg-emerald-100/50">
                <MessageCircle :size="16" /> Contactar Admin por WhatsApp
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL DE CÁMARA WEB (TOMAR FOTO) -->
    <div v-if="showCamera" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-sm p-6 shadow-2xl relative flex flex-col items-center gap-4">
        <h3 class="text-white font-black text-sm uppercase tracking-wider">Tomar Foto de Perfil</h3>
        
        <div class="relative w-full aspect-square overflow-hidden rounded-[2rem] border-4 border-slate-800 shadow-inner bg-black">
          <video ref="videoElement" autoplay playsinline class="w-full h-full object-cover transform -scale-x-100"></video>
        </div>

        <div class="flex gap-4 w-full justify-center mt-2">
          <button type="button" @click="stopCamera" class="py-3 px-6 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-2xl text-xs transition">
            Cancelar
          </button>
          <button type="button" @click="capturePhoto" :disabled="capturing" class="py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-2xl text-xs flex items-center gap-2 transition">
            <Camera :size="16" /> Capturar
          </button>
        </div>
      </div>
    </div>

  </div>
</template>