<script setup>
import { onMounted, ref, computed } from "vue";
import { toast } from "vue-sonner";
import mapboxgl from "mapbox-gl";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import { ref as dbRef, onValue } from "firebase/database";
import { User, LogOut, MessageCircle, Moon, Sun, MapPin, Bike, Package, ShoppingBag } from "lucide-vue-next";

import db from "../../firebase/firestore";
import realtime from "../../firebase/realtime";
import auth from "../../firebase/auth";
import { createRide, moveToNextDriver } from "../../services/ridesService";
import { logoutUser } from "../../services/authService";
import { useRouter } from "vue-router";
import { useThemeStore } from "../../stores/themeStore";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const router = useRouter();
const themeStore = useThemeStore();
const mapContainer = ref(null);
let map = null;
const markers = {};

const isDark = computed(() => themeStore.isDark);
const step = ref("servicio");
const serviceType = ref("viaje");
const serviceDetails = ref("");
const origin = ref(null);
const destination = ref(null);
const currentRide = ref(null);
let driverMarker = null;

let rideGlobalTimeout = null;
let driverPingTimeout = null;

const showProfile = ref(false);
const userProfile = ref({
  name: auth?.currentUser?.displayName || "Cliente Moto",
  email: auth?.currentUser?.email || "",
  phone: "",
});

const avatarUrl = computed(() => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.value.name)}&background=3b82f6&color=fff&size=128`;
});

onMounted(async () => {
  // Cargar datos reales del perfil
  if (auth.currentUser) {
    const uDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (uDoc.exists()) {
      userProfile.value.phone = uDoc.data().phone || "";
      userProfile.value.name = uDoc.data().name || auth.currentUser.displayName;
      // Verificar si está bloqueado
      if (uDoc.data().status === 'blocked') {
        toast.error("Tu cuenta ha sido suspendida.");
        handleLogout();
      }
    }
  }

  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: themeStore.isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
    center: [-63.18, -17.78],
    zoom: 15,
  });

  listenDrivers();
  centerOnUser();
});

const toggleTheme = () => {
  themeStore.toggleTheme();
  map.setStyle(themeStore.isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12");
};

const handleLogout = async () => {
  await logoutUser();
  router.push("/");
};

const contactSupport = () => {
  const msg = `Hola, soy el cliente ${userProfile.value.name}. Necesito soporte por una queja o consulta.`;
  window.open(`https://wa.me/59163591312?text=${encodeURIComponent(msg)}`, "_blank");
};

const saveProfile = async () => {
  if (auth.currentUser) {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      name: userProfile.value.name,
      phone: userProfile.value.phone
    });
    toast.success("Perfil actualizado");
    showProfile.value = false;
  }
};

const listenDrivers = () => {
  onValue(dbRef(realtime, "drivers_online"), (snapshot) => {
    // Si hay un viaje activo, no mostramos motos cercanas
    if (currentRide.value && currentRide.value.status !== 'completed' && currentRide.value.status !== 'cancelled') {
      return;
    }

    const data = snapshot.val();
    Object.keys(markers).forEach((uid) => {
      if (!data?.[uid] || !data[uid].online) { markers[uid].remove(); delete markers[uid]; }
    });
    if (!data) return;
    Object.keys(data).forEach((uid) => {
      const driver = data[uid];
      if (!driver.online) return;
      const pinColor = driver.pinColor || "#3b82f6"; 
      if (markers[uid]) {
        markers[uid].setLngLat([driver.lng, driver.lat]);
        markers[uid].getElement().style.backgroundColor = pinColor;
      } else {
        const el = document.createElement("div");
        el.className = "w-3.5 h-3.5 rounded-full border-2 border-white shadow-md transition-transform duration-1000 ease-linear";
        el.style.backgroundColor = pinColor;
        markers[uid] = new mapboxgl.Marker(el).setLngLat([driver.lng, driver.lat]).addTo(map);
      }
    });
  });
};

let userMarker = null;

const centerOnUser = () => {
  if (navigator.geolocation) {
    toast.info("Centrando GPS...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lngLat = [pos.coords.longitude, pos.coords.latitude];
        map.flyTo({ center: lngLat, zoom: 16.5, essential: true });
        
        if (userMarker) {
          userMarker.setLngLat(lngLat);
        } else {
          const el = document.createElement("div");
          el.className = "text-2xl drop-shadow-md";
          el.innerHTML = "🧍";
          userMarker = new mapboxgl.Marker(el).setLngLat(lngLat).addTo(map);
        }
      },
      () => toast.error("Activa el GPS"),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }
};

const selectService = (type) => {
  serviceType.value = type;
  if (type === 'viaje') {
    step.value = 'origen';
  } else {
    step.value = 'detalles';
  }
};

const proceedFromDetails = () => {
  if (!serviceDetails.value.trim()) {
    toast.error("Por favor, escribe los detalles.");
    return;
  }
  if (serviceType.value === 'envio') {
    step.value = 'origen';
  } else if (serviceType.value === 'compra') {
    step.value = 'destino';
  }
};

const setOrigin = () => { origin.value = { lat: map.getCenter().lat, lng: map.getCenter().lng }; step.value = "destino"; };
const setDestination = () => { destination.value = { lat: map.getCenter().lat, lng: map.getCenter().lng }; step.value = "confirmar"; };

const resetFlow = () => {
  if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout);
  if (driverPingTimeout) clearTimeout(driverPingTimeout);
  origin.value = null; destination.value = null; currentRide.value = null;
  serviceType.value = 'viaje'; serviceDetails.value = '';
  if (driverMarker) { driverMarker.remove(); driverMarker = null; }
  step.value = "servicio";
};

const handleRide = async () => {
  if (serviceType.value !== 'compra' && !origin.value) return;
  if (!destination.value) return;
  try {
    currentRide.value = await createRide(origin.value, destination.value, serviceType.value, serviceDetails.value);
    step.value = "viaje_activo";
    
    // Iniciar temporizador global de 5 minutos (300,000 ms)
    if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout);
    rideGlobalTimeout = setTimeout(() => {
      cancelRideClient();
      toast.error("Ningún chofer aceptó el viaje. Por favor intenta de nuevo.");
    }, 300000);

    // Ocultar todas las motos cercanas
    Object.keys(markers).forEach((uid) => {
      markers[uid].remove(); delete markers[uid];
    });

    listenRideStatus();
  } catch (error) {
    step.value = "sin_motos";
  }
};

const cancelRideClient = async () => {
  if (!currentRide.value?.id) return;
  await updateDoc(doc(db, "rides", currentRide.value.id), { status: "cancelled" });
  resetFlow();
};

const listenRideStatus = () => {
  if (!currentRide.value?.id) return;
  onSnapshot(doc(db, "rides", currentRide.value.id), (snapshot) => {
    const updatedRide = snapshot.data();
    if (!updatedRide) return;
    currentRide.value = { ...currentRide.value, ...updatedRide };

    // Manejo del temporizador de ping al chofer (20 seg)
    if (driverPingTimeout) clearTimeout(driverPingTimeout);

    if (updatedRide.status === 'searching') {
      driverPingTimeout = setTimeout(() => {
        moveToNextDriver(currentRide.value);
      }, 20000); // 20 segundos para que responda o lo pasamos
    } else if (updatedRide.status === 'accepted' || updatedRide.status === 'started' || updatedRide.status === 'arrived') {
      if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout); // Ya alguien aceptó, se cancela el global
    }

    if (updatedRide.driverId && updatedRide.status !== 'completed' && updatedRide.status !== 'cancelled') {
      listenDriverLocation(updatedRide.driverId);
    }
    if (updatedRide.status === "completed") { step.value = "terminado"; if (driverMarker) driverMarker.remove(); } 
    else if (updatedRide.status === "cancelled") { step.value = "sin_motos"; if (driverMarker) driverMarker.remove(); }
  });
};

const listenDriverLocation = (driverId) => {
  onValue(dbRef(realtime, `drivers_online/${driverId}`), (snapshot) => {
    const driver = snapshot.val();
    if (!driver?.online) return;
    const lngLat = [driver.lng, driver.lat];
    if (driverMarker) { driverMarker.setLngLat(lngLat); } 
    else {
      const el = document.createElement("div");
      el.className = "w-8 h-8 bg-black rounded-full border-2 border-white shadow-xl flex items-center justify-center text-xs text-white transition-transform duration-1000 ease-linear";
      el.innerHTML = "🏍️";
      driverMarker = new mapboxgl.Marker(el).setLngLat(lngLat).addTo(map);
    }
  });
};
</script>

<template>
  <div :class="{ 'dark': isDark }" class="h-screen w-full relative flex flex-col font-sans text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors">

    <header class="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
      <div class="bg-white/95 dark:bg-slate-800/95 backdrop-blur-md px-5 py-2 rounded-full shadow-md border border-slate-100 dark:border-slate-700 pointer-events-auto">
        <span class="font-black text-blue-600 dark:text-blue-400 text-lg">MotoYa</span>
      </div>
      <div class="flex gap-2 pointer-events-auto">
        <button @click="contactSupport" class="bg-white/95 dark:bg-slate-800/95 p-2.5 rounded-full shadow-md border border-slate-100 dark:border-slate-700 text-green-600">
          <MessageCircle :size="20" />
        </button>
        <button @click="showProfile = true" class="bg-white/95 dark:bg-slate-800/95 p-2.5 rounded-full shadow-md border border-slate-100 dark:border-slate-700 text-blue-600">
          <User :size="20" />
        </button>
      </div>
    </header>

    <div v-if="showProfile" class="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end">
      <div class="w-full max-w-sm bg-white dark:bg-slate-800 h-full p-6 shadow-2xl flex flex-col justify-between">
        <div>
          <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-700">
            <h2 class="text-xl font-bold">Mi Perfil</h2>
            <div class="flex gap-3 items-center">
              <button @click="toggleTheme" class="text-slate-500 hover:text-yellow-500"><Sun v-if="isDark" :size="20"/><Moon v-else :size="20"/></button>
              <button @click="showProfile = false" class="text-slate-400 font-bold">✕</button>
            </div>
          </div>
          <div class="space-y-4">
            <div class="flex justify-center mb-6">
              <img :src="avatarUrl" alt="Avatar" class="w-24 h-24 rounded-full shadow-lg border-4 border-blue-50 dark:border-slate-700 object-cover" />
            </div>
            <input v-model="userProfile.name" type="text" placeholder="Nombre" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl text-sm outline-none">
            <input v-model="userProfile.email" disabled type="text" class="w-full p-3 bg-slate-100 dark:bg-slate-900 rounded-xl text-sm text-slate-500">
            <input v-model="userProfile.phone" type="text" placeholder="Teléfono" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl text-sm outline-none">
            <button @click="saveProfile" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl">Guardar Cambios</button>
          </div>
        </div>
        <button @click="handleLogout" class="w-full bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2">
          <LogOut :size="18"/> Cerrar Sesión
        </button>
      </div>
    </div>

    <div class="flex-1 w-full h-full relative z-0">
      <div ref="mapContainer" class="w-full h-full"></div>

      <div v-if="step === 'origen' || step === 'destino'" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 flex flex-col items-center">
        <span class="text-[10px] font-black text-white px-2 py-0.5 rounded-full shadow mb-1 uppercase" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'">{{ step === 'origen' ? 'Origen' : 'Destino' }}</span>
        <div class="w-4 h-4 rounded-full border-2 border-white shadow-md" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'"></div>
        <div class="w-0.5 h-3 shadow-sm" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'"></div>
        <div class="absolute w-1 h-1 bg-black rounded-full pointer-events-none"></div>
      </div>
    </div>

    <div class="absolute bottom-0 left-0 right-0 z-20 bg-white dark:bg-slate-800 rounded-t-3xl shadow-2xl border-t border-slate-100 dark:border-slate-700 p-6 max-w-lg mx-auto">
      
      <div v-if="step === 'servicio'" class="space-y-4">
        <div class="text-center"><h1 class="text-lg font-black">¿Qué necesitas hoy?</h1></div>
        <div class="grid grid-cols-3 gap-3">
          <button @click="selectService('viaje')" class="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700 hover:bg-blue-50 dark:hover:bg-slate-600 rounded-2xl border-2 border-transparent hover:border-blue-500 transition">
            <Bike class="text-blue-500 mb-2" :size="32" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Viaje</span>
          </button>
          <button @click="selectService('envio')" class="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700 hover:bg-emerald-50 dark:hover:bg-slate-600 rounded-2xl border-2 border-transparent hover:border-emerald-500 transition">
            <Package class="text-emerald-500 mb-2" :size="32" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Envío</span>
          </button>
          <button @click="selectService('compra')" class="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-700 hover:bg-amber-50 dark:hover:bg-slate-600 rounded-2xl border-2 border-transparent hover:border-amber-500 transition">
            <ShoppingBag class="text-amber-500 mb-2" :size="32" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Pedido</span>
          </button>
        </div>
      </div>

      <div v-if="step === 'detalles'" class="space-y-4">
        <div class="text-center">
          <h1 class="text-base font-extrabold">{{ serviceType === 'envio' ? '¿Qué vamos a enviar?' : '¿Qué necesitas que te compremos?' }}</h1>
          <p class="text-xs text-slate-500 mt-1">{{ serviceType === 'envio' ? 'Ej: Un sobre azul con documentos' : 'Ej: 10 Bs de pan marraqueta y una Coca-Cola' }}</p>
        </div>
        <textarea v-model="serviceDetails" rows="3" class="w-full p-4 bg-slate-50 dark:bg-slate-700 rounded-xl text-sm font-bold outline-none border border-slate-200 dark:border-slate-600" placeholder="Escribe aquí los detalles..."></textarea>
        <div class="flex gap-2">
          <button @click="step = 'servicio'" class="p-3.5 bg-slate-100 dark:bg-slate-700 font-bold rounded-xl">←</button>
          <button @click="proceedFromDetails" class="flex-1 bg-black dark:bg-blue-600 text-white font-bold p-3.5 rounded-xl">Continuar</button>
        </div>
      </div>

      <div v-if="step === 'origen'" class="space-y-3">
        <div class="text-center">
          <h1 class="text-base font-extrabold">{{ serviceType === 'viaje' ? '¿Dónde te recogemos?' : '¿Dónde recogemos el paquete?' }}</h1>
        </div>
        <button @click="centerOnUser" class="w-full py-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-xl font-bold text-xs flex items-center justify-center gap-2">
          <MapPin :size="14" /> Ubicación Precisa GPS
        </button>
        <div class="flex gap-2">
          <button @click="step = serviceType === 'viaje' ? 'servicio' : 'detalles'" class="p-3.5 bg-slate-100 dark:bg-slate-700 font-bold rounded-xl">←</button>
          <button @click="setOrigin" class="flex-1 bg-emerald-600 text-white font-bold p-3.5 rounded-xl">Fijar Origen</button>
        </div>
      </div>

      <div v-if="step === 'destino'" class="space-y-3">
        <div class="text-center">
          <h1 class="text-base font-extrabold">{{ serviceType === 'viaje' ? '¿A dónde vas?' : (serviceType === 'envio' ? '¿A dónde llevamos el paquete?' : '¿A dónde te llevamos el pedido?') }}</h1>
        </div>
        <div class="flex gap-2">
          <button @click="step = serviceType === 'compra' ? 'detalles' : 'origen'" class="p-3.5 bg-slate-100 dark:bg-slate-700 font-bold rounded-xl">←</button>
          <button @click="setDestination" class="flex-1 bg-rose-600 text-white font-bold p-3.5 rounded-xl">Fijar Destino</button>
        </div>
      </div>

      <div v-if="step === 'confirmar'" class="space-y-3">
        <h1 class="text-base font-extrabold text-center">Confirmar Solicitud</h1>
        
        <div v-if="serviceType !== 'viaje'" class="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
          <span class="text-[10px] uppercase font-black text-amber-600">Detalles del {{ serviceType }}</span>
          <p class="text-sm font-bold mt-1 text-slate-800 dark:text-slate-200">{{ serviceDetails }}</p>
        </div>
        <div class="flex gap-2">
          <button @click="resetFlow" class="px-4 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold">Cancelar</button>
          <button @click="handleRide" class="flex-1 bg-blue-600 text-white font-bold p-3.5 rounded-xl">Confirmar y Buscar</button>
        </div>
      </div>

      <div v-if="step === 'viaje_activo'" class="space-y-3 text-center py-2">
        
        <div v-if="currentRide?.details" class="bg-amber-100 dark:bg-amber-900/40 p-4 rounded-xl border border-amber-300 dark:border-amber-700 mb-4 shadow-sm text-left">
          <span class="text-[11px] uppercase font-black text-amber-700 dark:text-amber-500">Detalles del {{ currentRide.type }}</span>
          <p class="text-base font-black text-slate-900 dark:text-white mt-1">{{ currentRide.details }}</p>
        </div>

        <div class="flex items-center justify-center gap-2">
          <div v-if="currentRide?.status === 'searching'" class="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span class="font-black text-sm uppercase text-blue-600 dark:text-blue-400">{{ currentRide?.status === 'searching' ? 'Buscando Moto...' : `Estado: ${currentRide?.status}` }}</span>
        </div>
        <button @click="cancelRideClient" class="mt-2 w-full py-2.5 bg-rose-50 dark:bg-rose-900/30 text-rose-600 font-bold rounded-xl text-xs">Cancelar Solicitud</button>
      </div>

      <div v-if="step === 'sin_motos'" class="space-y-3 text-center py-2">
        <h2 class="font-bold text-sm">Motos Ocupadas</h2>
        <div class="flex gap-2 pt-2">
          <button @click="resetFlow" class="flex-1 py-3 bg-slate-100 dark:bg-slate-700 rounded-xl text-xs font-bold">Cambiar Ruta</button>
          <button @click="handleRide" class="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-xs shadow-md">🔄 Reintentar</button>
        </div>
      </div>

      <div v-if="step === 'terminado'" class="space-y-3 text-center py-3">
        <h2 class="font-black text-emerald-600 text-lg">¡Viaje Terminado!</h2>
        <button @click="resetFlow" class="w-full py-3 bg-slate-900 dark:bg-slate-950 text-white font-bold rounded-xl text-xs border border-slate-700 mt-2">Pedir Nuevo Viaje</button>
      </div>

    </div>
  </div>
</template>