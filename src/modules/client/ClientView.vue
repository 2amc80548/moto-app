<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { toast } from "vue-sonner";
import mapboxgl from "mapbox-gl";
import { doc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import { ref as dbRef, onValue } from "firebase/database";
import { User, LogOut, MessageCircle, Moon, Sun, MapPin, Bike, Package, ShoppingBag, Crosshair, Key } from "lucide-vue-next";
import { updatePassword } from "firebase/auth";

import db from "../../firebase/firestore";
import realtime from "../../firebase/realtime";
import auth from "../../firebase/auth";
import { createRide, moveToNextDriver } from "../../services/ridesService";
import { logoutUser } from "../../services/authService";
import { useRouter } from "vue-router";
import { useThemeStore } from "../../stores/themeStore";
import { getRoute } from "../../services/mapService";

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
const lastDriverIndex = ref(null);

const routeDistance = ref("");
const routeDuration = ref("");
const calculatedPrice = ref(4);
const extraPrice = ref(0);
const totalPrice = ref(4);

watch(extraPrice, (newVal) => {
  const parsed = parseInt(newVal) || 0;
  extraPrice.value = Math.max(0, parsed);
  totalPrice.value = calculatedPrice.value + extraPrice.value;
});

const drawRoute = (geometry) => {
  if (map.getSource("route")) {
    map.getSource("route").setData(geometry);
  } else {
    map.addSource("route", { type: "geojson", data: { type: "Feature", geometry } });
    map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#3b82f6", "line-width": 6 } });
  }
};

const clearMapRoute = () => {
  if (map.getSource("route")) { 
    map.removeLayer("route"); 
    map.removeSource("route"); 
  }
};

const calculateRidePrice = async () => {
  if (!origin.value || !destination.value) return;
  
  try {
    const route = await getRoute(origin.value, destination.value);
    if (route && route.geometry) {
      drawRoute(route.geometry);
      
      routeDistance.value = route.distance + " km";
      routeDuration.value = route.duration + " min";
      
      const distanceNum = parseFloat(route.distance) || 0;
      const baseFee = (serviceType.value === 'viaje') ? 4 : 5;
      
      let price = baseFee;
      if (distanceNum > 1.5) {
        price += (distanceNum - 1.5) * 3;
      }
      
      calculatedPrice.value = Math.round(price);
      totalPrice.value = calculatedPrice.value + extraPrice.value;
    }
  } catch (error) {
    console.error("Error calculating ride price:", error);
    const baseFee = (serviceType.value === 'viaje') ? 4 : 5;
    calculatedPrice.value = baseFee;
    totalPrice.value = baseFee + extraPrice.value;
  }
};

// Marcadores visuales de selección
let selectedOriginMarker = null;
let selectedDestMarker = null;

// Campos estructurados para Envíos y Compras
const envioObjeto = ref("");
const envioDestinatario = ref("");
const envioCelular = ref("");
const envioInstrucciones = ref("");

const compraDetalle = ref("");
const compraLugar = ref("");
const compraPresupuesto = ref("");

// Motivo de cancelación del chofer
const driverCancelReason = ref("");

// Estado de Bloqueo / Suspensión
const isBlocked = ref(false);

const userProfile = ref({
  name: auth?.currentUser?.displayName || "Cliente Moto",
  email: auth?.currentUser?.email || "",
  phone: "",
  dni: "",
});

// Cambiar contraseña del cliente
const showPasswordFields = ref(false);
const newPassword = ref("");
const changingPassword = ref(false);

const handleChangePassword = async () => {
  if (!newPassword.value) return toast.error("Ingresa la nueva contraseña");
  if (newPassword.value.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
  changingPassword.value = true;
  try {
    await updatePassword(auth.currentUser, newPassword.value);
    toast.success("Contraseña actualizada con éxito");
    newPassword.value = "";
    showPasswordFields.value = false;
  } catch (error) {
    console.error("Change password error:", error);
    toast.error("Error al cambiar contraseña. Por seguridad, debes haber iniciado sesión recientemente.");
  } finally {
    changingPassword.value = false;
  }
};

const avatarUrl = computed(() => {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.value.name)}&background=3b82f6&color=fff&size=128`;
});

onMounted(async () => {
  if (auth.currentUser) {
    const uDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (uDoc.exists()) {
      userProfile.value.phone = uDoc.data().phone || "";
      userProfile.value.name = uDoc.data().name || auth.currentUser.displayName;
      userProfile.value.dni = uDoc.data().dni || "";
      if (uDoc.data().status === 'blocked') {
        isBlocked.value = true;
      }
    }

    // Escuchar cambios de bloqueo en tiempo real
    onSnapshot(doc(db, "users", auth.currentUser.uid), (snapshot) => {
      const data = snapshot.data();
      if (data) {
        isBlocked.value = data.status === 'blocked';
      }
    });
  }

  // Estilo limpio del mapa (streets-v12 / dark-v11)
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
  if (!userProfile.value.name.trim()) return toast.error("El nombre es obligatorio");
  
  const phoneRegex = /^[67]\d{7}$/;
  if (!phoneRegex.test(userProfile.value.phone.trim())) {
    return toast.error("El número de celular debe tener exactamente 8 dígitos y comenzar con 6 o 7.");
  }

  if (auth.currentUser) {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      name: userProfile.value.name,
      phone: userProfile.value.phone.trim()
    });
    toast.success("Perfil actualizado");
    showProfile.value = false;
  }
};

const listenDrivers = () => {
  onValue(dbRef(realtime, "drivers_online"), (snapshot) => {
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
      } else {
        const el = document.createElement("div");
        el.className = "relative flex items-center justify-center transition-transform duration-1000 ease-linear";
        el.innerHTML = `
          <div class="absolute w-6 h-6 rounded-full opacity-25 animate-ping" style="background-color: ${pinColor}"></div>
          <div class="relative w-4.5 h-4.5 rounded-full border-2 border-white shadow-md flex items-center justify-center" style="background-color: ${pinColor}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="w-2.5 h-2.5 text-white"><path d="M5 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M10 16h3L17 8H9L7 11.5"/></svg>
          </div>
        `;
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
          el.className = "relative flex items-center justify-center";
          el.innerHTML = `
            <div class="absolute w-9 h-9 bg-blue-500/20 rounded-full animate-ping"></div>
            <div class="relative w-7 h-7 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-3.5 h-3.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
          `;
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
  if (serviceType.value === 'envio') {
    if (!envioObjeto.value.trim() || !envioDestinatario.value.trim() || !envioCelular.value.trim()) {
      return toast.error("Por favor completa los campos obligatorios del envío.");
    }
    serviceDetails.value = `📦 OBJETO: ${envioObjeto.value.trim()}\n👤 DESTINATARIO: ${envioDestinatario.value.trim()}\n📱 CONTACTO: ${envioCelular.value.trim()}${envioInstrucciones.value.trim() ? '\n🔑 NOTAS: ' + envioInstrucciones.value.trim() : ''}`;
    step.value = 'origen';
  } else if (serviceType.value === 'compra') {
    if (!compraDetalle.value.trim()) {
      return toast.error("Por favor especifica qué debemos comprar.");
    }
    serviceDetails.value = `🛍️ COMPRA: ${compraDetalle.value.trim()}${compraLugar.value.trim() ? '\n🏪 LUGAR: ' + compraLugar.value.trim() : ''}${compraPresupuesto.value.trim() ? '\n💵 PRESUPUESTO: ' + compraPresupuesto.value.trim() : ''}`;
    step.value = 'origen';
  }
};

const setOrigin = () => {
  const coords = { lat: map.getCenter().lat, lng: map.getCenter().lng };
  origin.value = coords;
  
  if (selectedOriginMarker) selectedOriginMarker.remove();
  const el = document.createElement("div");
  el.className = "relative flex flex-col items-center z-10";
  el.innerHTML = `<div class="w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white text-[10px] font-black">A</div>`;
  selectedOriginMarker = new mapboxgl.Marker(el).setLngLat([coords.lng, coords.lat]).addTo(map);
  
  step.value = "destino";
};

const setDestination = async () => {
  const coords = { lat: map.getCenter().lat, lng: map.getCenter().lng };
  destination.value = coords;
  
  if (selectedDestMarker) selectedDestMarker.remove();
  const el = document.createElement("div");
  el.className = "relative flex flex-col items-center animate-bounce z-10";
  el.innerHTML = `<div class="w-6 h-6 bg-rose-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white text-[10px] font-black">B</div>`;
  selectedDestMarker = new mapboxgl.Marker(el).setLngLat([coords.lng, coords.lat]).addTo(map);
  
  extraPrice.value = 0;
  await calculateRidePrice();
  
  step.value = "confirmar";
};

const resetFlow = () => {
  if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout);
  if (driverPingTimeout) clearTimeout(driverPingTimeout);
  lastDriverIndex.value = null;
  origin.value = null; destination.value = null; currentRide.value = null;
  serviceType.value = 'viaje'; serviceDetails.value = '';
  
  // Limpiar campos estructurados
  envioObjeto.value = "";
  envioDestinatario.value = "";
  envioCelular.value = "";
  envioInstrucciones.value = "";
  compraDetalle.value = "";
  compraLugar.value = "";
  compraPresupuesto.value = "";

  if (selectedOriginMarker) { selectedOriginMarker.remove(); selectedOriginMarker = null; }
  if (selectedDestMarker) { selectedDestMarker.remove(); selectedDestMarker = null; }
  if (driverMarker) { driverMarker.remove(); driverMarker = null; }
  
  clearMapRoute();
  step.value = "servicio";
};

const handleRide = async () => {
  if (serviceType.value !== 'compra' && !origin.value) return;
  if (!destination.value) return;
  try {
    currentRide.value = await createRide(
      origin.value, 
      destination.value, 
      serviceType.value, 
      serviceDetails.value,
      {
        basePrice: calculatedPrice.value,
        extraPrice: extraPrice.value,
        totalPrice: totalPrice.value
      }
    );
    step.value = "viaje_activo";
    
    if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout);
    rideGlobalTimeout = setTimeout(() => {
      cancelRideClient();
      toast.error("Ningún chofer aceptó el viaje. Por favor intenta de nuevo.");
    }, 300000);

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
  
  const isAccepted = ['accepted', 'arrived', 'started'].includes(currentRide.value.status);
  if (isAccepted) {
    return toast.error("El chofer ya aceptó tu solicitud. No puedes cancelar el servicio una vez iniciado.");
  }

  await updateDoc(doc(db, "rides", currentRide.value.id), { 
    status: "cancelled",
    cancelledBy: "client",
    cancelledAt: Date.now(),
    wasAccepted: false
  });
  resetFlow();
};

const listenRideStatus = () => {
  if (!currentRide.value?.id) return;
  onSnapshot(doc(db, "rides", currentRide.value.id), (snapshot) => {
    const updatedRide = snapshot.data();
    if (!updatedRide) return;
    currentRide.value = { ...currentRide.value, ...updatedRide };

    if (driverPingTimeout) clearTimeout(driverPingTimeout);

    if (updatedRide.status === 'searching') {
      if (lastDriverIndex.value === null || lastDriverIndex.value !== updatedRide.currentDriverIndex) {
        lastDriverIndex.value = updatedRide.currentDriverIndex;
        
        if (driverPingTimeout) clearTimeout(driverPingTimeout);
        
        const durationLimit = (updatedRide.type === 'viaje') ? 30000 : 60000;
        driverPingTimeout = setTimeout(() => {
          moveToNextDriver(currentRide.value);
        }, durationLimit + 3000); // 3s grace period
      }
    } else {
      lastDriverIndex.value = null;
      if (driverPingTimeout) clearTimeout(driverPingTimeout);
      if (updatedRide.status === 'accepted' || updatedRide.status === 'started' || updatedRide.status === 'arrived') {
        if (rideGlobalTimeout) clearTimeout(rideGlobalTimeout);
      }
    }

    if (updatedRide.driverId && updatedRide.status !== 'completed' && updatedRide.status !== 'cancelled') {
      listenDriverLocation(updatedRide.driverId);
    }

    if (updatedRide.status === "completed") {
      step.value = "terminado";
      if (driverMarker) driverMarker.remove();
    } else if (updatedRide.status === "cancelled") {
      if (updatedRide.cancelledBy === 'driver') {
        driverCancelReason.value = updatedRide.cancelReason || "Sin especificar";
        step.value = "rechazado_chofer";
      } else {
        step.value = "sin_motos";
      }
      if (driverMarker) { driverMarker.remove(); driverMarker = null; }
    }
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
      el.className = "relative flex items-center justify-center";
      el.innerHTML = `
        <div class="absolute w-10 h-10 bg-emerald-500/20 rounded-full animate-ping"></div>
        <div class="relative w-9 h-9 bg-gradient-to-tr from-emerald-600 to-teal-600 rounded-full shadow-xl border-2 border-white flex items-center justify-center text-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M5 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M10 16h3L17 8H9L7 11.5M17 8h2.5L21 11.5v3h-2M12 8.5V11"/></svg>
        </div>
      `;
      driverMarker = new mapboxgl.Marker(el).setLngLat(lngLat).addTo(map);
    }
  });
};
</script>

<template>
  <!-- PANTALLA DE BLOQUEO POR SUSPENSIÓN -->
  <div v-if="isBlocked" class="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4 font-sans">
    <div class="max-w-md w-full bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6 border border-rose-100 dark:border-rose-950/40 relative overflow-hidden transition-colors">
      <div class="absolute w-48 h-48 bg-rose-500/5 rounded-full blur-3xl -top-24 -right-24"></div>
      <div class="w-20 h-20 bg-rose-100 dark:bg-rose-950/40 text-rose-600 rounded-[1.8rem] flex items-center justify-center mx-auto mb-4 animate-bounce shrink-0">
        <span class="text-3xl">🚫</span>
      </div>
      <h2 class="text-2xl font-black dark:text-white">Cuenta Suspendida</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">Tu cuenta de MotoCab ha sido suspendida temporal o permanentemente debido a infracciones graves de los términos de servicio.</p>
      <button @click="contactSupport" class="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/20 flex justify-center items-center gap-2 hover:scale-[1.01] transition-all">
        <MessageCircle /> Contactar a Soporte
      </button>
      <button @click="handleLogout" class="text-xs text-slate-400 underline mt-4 block mx-auto hover:text-rose-500 transition-colors">Cerrar Sesión</button>
    </div>
  </div>

  <div v-else :class="{ 'dark': isDark }" class="h-screen w-full relative flex flex-col font-sans text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 overflow-hidden transition-colors">

    <!-- Header flotante premium -->
    <header class="absolute top-4 left-4 right-4 z-20 flex justify-between items-center pointer-events-none">
      <div class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-5 py-2 rounded-full shadow-md border border-white/20 dark:border-slate-700/50 pointer-events-auto">
        <span class="font-black text-blue-600 dark:text-blue-400 text-lg">MotoCab</span>
      </div>
      <div class="flex gap-2 pointer-events-auto">
        <button @click="contactSupport" class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-2.5 rounded-full shadow-md border border-white/20 dark:border-slate-700/50 text-green-600">
          <MessageCircle :size="20" />
        </button>
        <button @click="showProfile = true" class="bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-2.5 rounded-full shadow-md border border-white/20 dark:border-slate-700/50 text-blue-600">
          <User :size="20" />
        </button>
      </div>
    </header>

    <!-- Modal de Perfil (Con Cambio de Contraseña) -->
    <div v-if="showProfile" class="absolute inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-end animate-in fade-in duration-200">
      <div class="w-full max-w-sm bg-white dark:bg-slate-800 h-full p-6 shadow-2xl flex flex-col justify-between transition-colors animate-in slide-in-from-right duration-200">
        <div>
          <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-700">
            <h2 class="text-xl font-black">Mi Perfil</h2>
            <div class="flex gap-3 items-center">
              <button @click="toggleTheme" class="text-slate-500 hover:text-yellow-500"><Sun v-if="isDark" :size="20"/><Moon v-else :size="20"/></button>
              <button @click="showProfile = false; showPasswordFields = false; newPassword = '';" class="text-slate-400 font-bold">✕</button>
            </div>
          </div>
          <div class="space-y-4">
            <div class="flex justify-center mb-6">
              <img :src="avatarUrl" alt="Avatar" class="w-24 h-24 rounded-full shadow-lg border-4 border-blue-500/20 object-cover" />
            </div>
            
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 ml-1">Nombre</label>
              <input v-model="userProfile.name" type="text" placeholder="Nombre" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl text-sm outline-none dark:text-white border border-slate-200/50 dark:border-slate-600">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 ml-1">Correo Electrónico</label>
              <input v-model="userProfile.email" disabled type="text" class="w-full p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 rounded-xl text-sm border border-slate-200/30 dark:border-slate-800 cursor-not-allowed">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 ml-1">Teléfono</label>
              <input v-model="userProfile.phone" type="text" placeholder="Teléfono" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl text-sm outline-none dark:text-white border border-slate-200/50 dark:border-slate-600">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 ml-1">N° de Carnet (DNI)</label>
              <input v-model="userProfile.dni" disabled type="text" class="w-full p-3 bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 rounded-xl text-sm border border-slate-200/30 dark:border-slate-800 cursor-not-allowed">
            </div>

            <button @click="saveProfile" class="w-full bg-blue-600 text-white font-bold py-3 rounded-xl shadow-md">Guardar Cambios</button>

            <!-- Cambio de Contraseña -->
            <div class="border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 space-y-3">
              <button @click="showPasswordFields = !showPasswordFields" class="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-650 text-slate-800 dark:text-white font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-sm">
                <Key :size="14" /> {{ showPasswordFields ? 'Cancelar Cambio' : 'Cambiar Contraseña' }}
              </button>
              <div v-if="showPasswordFields" class="space-y-3 animate-in slide-in-from-top-2 duration-200">
                <input v-model="newPassword" type="password" placeholder="Nueva Contraseña" class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none dark:text-white">
                <button @click="handleChangePassword" :disabled="changingPassword" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition text-xs shadow-md shadow-blue-500/10">
                  <span v-if="changingPassword" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block"></span>
                  <span v-else>Guardar Contraseña</span>
                </button>
              </div>
            </div>

          </div>
        </div>
        <button @click="handleLogout" class="w-full bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400 font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 mt-4">
          <LogOut :size="18"/> Cerrar Sesión
        </button>
      </div>
    </div>

    <!-- Mapa -->
    <div class="flex-grow w-full relative z-0">
      <div ref="mapContainer" class="w-full h-full"></div>

      <!-- Icono central para fijar Origen / Destino -->
      <div v-if="step === 'origen' || step === 'destino'" class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10 flex flex-col items-center">
        <span class="text-[9px] font-black text-white px-2 py-0.5 rounded-full shadow mb-1 uppercase animate-pulse" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'">{{ step === 'origen' ? 'Fijar Origen' : 'Fijar Destino' }}</span>
        <div class="w-4 h-4 rounded-full border-2 border-white shadow-md animate-ping absolute top-4" :class="step === 'origen' ? 'bg-emerald-500' : 'bg-rose-500'"></div>
        <div class="w-4 h-4 rounded-full border-2 border-white shadow-lg relative z-20" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'"></div>
        <div class="w-0.5 h-4 shadow-sm" :class="step === 'origen' ? 'bg-emerald-600' : 'bg-rose-600'"></div>
      </div>
    </div>

    <!-- Botón Flotante de Centrar GPS -->
    <button 
      @click="centerOnUser"
      class="absolute top-20 right-4 z-30 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md p-3 rounded-full shadow-xl border border-white/20 dark:border-slate-700/50 hover:scale-105 active:scale-95 transition flex items-center justify-center"
      title="Mi ubicación">
      <Crosshair class="text-blue-600 dark:text-blue-400" :size="24" />
    </button>

    <!-- Tarjeta Flotante Inferior de Control (Diseño Compacto Sin Scroll) -->
    <div class="absolute bottom-4 left-4 right-4 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 dark:border-slate-700/50 p-5 max-w-md mx-auto animate-in slide-in-from-bottom duration-300">
      
      <!-- SELECCIÓN DE SERVICIO -->
      <div v-if="step === 'servicio'" class="space-y-4">
        <h3 class="text-center text-sm font-black dark:text-white uppercase tracking-wider text-slate-500">¿Qué necesitas hoy?</h3>
        <div class="grid grid-cols-3 gap-3">
          <button @click="selectService('viaje')" class="flex flex-col items-center justify-center p-3 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-blue-50 dark:hover:bg-slate-700 rounded-2xl border-2 border-transparent hover:border-blue-500 transition-all hover:scale-[1.02] duration-200">
            <Bike class="text-blue-500 mb-1" :size="28" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Viaje</span>
          </button>
          <button @click="selectService('envio')" class="flex flex-col items-center justify-center p-3 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-emerald-50 dark:hover:bg-slate-700 rounded-2xl border-2 border-transparent hover:border-emerald-500 transition-all hover:scale-[1.02] duration-200">
            <Package class="text-emerald-500 mb-1" :size="28" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Envío</span>
          </button>
          <button @click="selectService('compra')" class="flex flex-col items-center justify-center p-3 bg-slate-50/50 dark:bg-slate-900/40 hover:bg-amber-50 dark:hover:bg-slate-700 rounded-2xl border-2 border-transparent hover:border-amber-500 transition-all hover:scale-[1.02] duration-200">
            <ShoppingBag class="text-amber-500 mb-1" :size="28" />
            <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Pedido</span>
          </button>
        </div>
      </div>

      <!-- FORMULARIOS DETALLADOS Y ORDENADOS (SIN SCROLL) -->
      <div v-if="step === 'detalles'" class="space-y-3">
        <h3 class="text-center text-sm font-black dark:text-white uppercase tracking-wider text-slate-500">
          {{ serviceType === 'envio' ? 'Detalles del Envío 📦' : 'Detalles del Pedido 🛍️' }}
        </h3>
        
        <!-- Formulario estructurado para Envíos -->
        <div v-if="serviceType === 'envio'" class="space-y-2">
          <input v-model="envioObjeto" type="text" placeholder="¿Qué vamos a enviar? (Ej: Llaves, documentos) *" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
          <input v-model="envioDestinatario" type="text" placeholder="Nombre de quien recibe *" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
          <input v-model="envioCelular" type="tel" placeholder="Celular de quien recibe *" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
          <input v-model="envioInstrucciones" type="text" placeholder="Instrucciones (Ej: Piso 3, portería) (Opcional)" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
        </div>

        <!-- Formulario estructurado para Pedidos -->
        <div v-if="serviceType === 'compra'" class="space-y-2">
          <textarea v-model="compraDetalle" rows="2" placeholder="Especifica qué comprar (Ej: 2 hamburguesas Toby y una soda) *" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white resize-none focus:border-blue-500"></textarea>
          <input v-model="compraLugar" type="text" placeholder="Lugar o comercio preferido (Opcional)" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
          <input v-model="compraPresupuesto" type="text" placeholder="Presupuesto aproximado (Ej: 80 Bs) (Opcional)" class="w-full p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white focus:border-blue-500" />
        </div>

        <div class="flex gap-2 pt-1.5">
          <button @click="step = 'servicio'" class="px-4 py-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition">Atrás</button>
          <button @click="proceedFromDetails" class="flex-grow py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-blue-500/10">Continuar</button>
        </div>
      </div>

      <!-- FIJAR ORIGEN -->
      <div v-if="step === 'origen'" class="space-y-3">
        <h3 class="text-center text-sm font-black dark:text-white uppercase tracking-wider text-slate-500">
          {{ serviceType === 'viaje' ? '¿Dónde te recogemos?' : '¿Dónde recogemos el paquete?' }}
        </h3>
        <button @click="centerOnUser" class="w-full py-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-blue-200/50">
          <MapPin :size="14" /> Usar Ubicación Actual
        </button>
        <div class="flex gap-2">
          <button @click="step = serviceType === 'viaje' ? 'servicio' : 'detalles'" class="px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition">←</button>
          <button @click="setOrigin" class="flex-grow py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-500/10">Fijar Punto de Recojo</button>
        </div>
      </div>

      <!-- FIJAR DESTINO -->
      <div v-if="step === 'destino'" class="space-y-3">
        <h3 class="text-center text-sm font-black dark:text-white uppercase tracking-wider text-slate-500">
          {{ serviceType === 'viaje' ? '¿A dónde vas?' : (serviceType === 'envio' ? '¿Dónde entregamos?' : '¿Dónde entregamos tu pedido?') }}
        </h3>
        <div class="flex gap-2">
          <button @click="step = 'origen'" class="px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition">←</button>
          <button @click="setDestination" class="flex-grow py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition shadow-md shadow-rose-500/10">Fijar Punto de Entrega</button>
        </div>
      </div>

      <!-- CONFIRMAR VIAJE/PEDIDO -->
      <div v-if="step === 'confirmar'" class="space-y-3">
        <h3 class="text-center text-sm font-black dark:text-white uppercase tracking-wider text-slate-500">Confirmar Solicitud</h3>
        
        <!-- Resumen de detalles -->
        <div v-if="serviceType !== 'viaje'" class="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200/50 dark:border-amber-800 text-left max-h-[80px] overflow-y-auto">
          <span class="text-[9px] font-black text-amber-600 uppercase tracking-wider">Especificaciones del servicio</span>
          <p class="text-[11px] font-bold mt-0.5 text-slate-800 dark:text-slate-200 whitespace-pre-line">{{ serviceDetails }}</p>
        </div>

        <!-- Tarjeta de Costo y Extra -->
        <div class="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/80 space-y-3 text-left">
          <div class="flex justify-between items-center">
            <div>
              <span class="text-[9px] font-black uppercase text-slate-450 dark:text-slate-400">Tarifa Sugerida</span>
              <p class="text-lg font-black text-slate-850 dark:text-white">{{ calculatedPrice }} Bs</p>
            </div>
            <div class="text-right">
              <span class="text-[9px] font-black uppercase text-slate-450 dark:text-slate-400">Total a Pagar</span>
              <p class="text-lg font-black text-blue-650 dark:text-blue-400">{{ totalPrice }} Bs</p>
            </div>
          </div>

          <!-- Campo de Extra/Propina -->
          <div class="pt-1">
            <label class="text-[10px] uppercase font-bold text-slate-450 dark:text-slate-400 block mb-1">Monto extra (opcional - Bs)</label>
            <div class="relative group">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold text-xs">
                + Bs.
              </div>
              <input 
                v-model.number="extraPrice" 
                type="number" 
                min="0"
                step="1"
                placeholder="Ej: 2, 5, 10" 
                class="w-full pl-12 pr-4 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs outline-none focus:border-blue-500 font-bold dark:text-white text-left" 
              />
            </div>
            <p class="text-[9px] text-slate-450 dark:text-slate-400 mt-1">Suma un monto extra para incentivar a los conductores a aceptar tu pedido más rápido.</p>
          </div>
        </div>

        <!-- Advertencia de no cancelación -->
        <div class="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-left">
          <p class="text-[10px] text-rose-700 dark:text-rose-400 font-bold leading-tight flex items-start gap-1.5">
            <span>⚠️</span>
            <span>Una vez que el chofer acepte tu solicitud, no podrás cancelar el pedido ni realizar modificaciones.</span>
          </p>
        </div>

        <div class="flex gap-2">
          <button @click="resetFlow" class="px-4 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition">Cancelar</button>
          <button @click="handleRide" class="flex-grow py-3 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl text-xs transition shadow-lg shadow-blue-500/20">CONFIRMAR Y BUSCAR</button>
        </div>
      </div>

      <!-- VIAJE EN CURSO / BUSCANDO -->
      <div v-if="step === 'viaje_activo'" class="space-y-3 text-center py-2">
        <div v-if="currentRide?.details" class="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-250 dark:border-amber-900 text-left max-h-[75px] overflow-y-auto mb-2">
          <span class="text-[9px] font-black text-amber-600 uppercase">Detalles del {{ currentRide.type }}</span>
          <p class="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-line">{{ currentRide.details }}</p>
        </div>

        <div class="flex items-center justify-center gap-2.5">
          <div v-if="currentRide?.status === 'searching'" class="animate-spin w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"></div>
          <span class="font-black text-xs uppercase tracking-widest text-blue-600 dark:text-blue-400">
            {{ currentRide?.status === 'searching' ? 'Buscando Chofer...' : `Estado: ${currentRide?.status}` }}
          </span>
        </div>
        
        <!-- Mostrar datos del chofer si aceptó -->
        <div v-if="currentRide?.status !== 'searching' && currentRide?.driverId" class="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-left mt-2">
          <div>
            <span class="text-[9px] uppercase font-bold text-slate-400">Chofer Asignado</span>
            <p class="text-xs font-bold dark:text-white">{{ currentRide.driverName || 'Conductor MotoCab' }}</p>
          </div>
          <a :href="`https://wa.me/${currentRide.driverPhone}`" target="_blank" v-if="currentRide.driverPhone" class="bg-emerald-500 hover:bg-emerald-600 text-white p-2 rounded-full shadow transition-all">
            <MessageCircle :size="16" />
          </a>
        </div>

        <!-- Evitar cancelación del cliente una vez aceptado por el chofer -->
        <button v-if="currentRide?.status === 'searching'" @click="cancelRideClient" class="w-full py-2.5 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-bold rounded-xl text-xs transition">
          Cancelar Solicitud
        </button>
        <div v-else class="text-[10px] text-center text-slate-400 font-bold bg-slate-100 dark:bg-slate-800/50 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
          🔒 El chofer aceptó tu solicitud (No puedes cancelar).
        </div>
      </div>

      <!-- SIN MOTOS / REINTENTO -->
      <div v-if="step === 'sin_motos'" class="space-y-3 text-center py-2">
        <h3 class="font-black text-sm text-slate-700 dark:text-slate-300">No hay conductores disponibles</h3>
        <p class="text-xs text-slate-400">Todos los conductores de MotoCab se encuentran ocupados o fuera de rango en este momento.</p>
        <div class="flex gap-2 pt-2">
          <button @click="resetFlow" class="flex-grow py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-xl text-xs font-bold transition">Cambiar Ruta</button>
          <button @click="handleRide" class="flex-grow py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition">🔄 Reintentar</button>
        </div>
      </div>

      <!-- VIAJE CANCELADO POR EL CHOFER (CON DETALLES DE JUSTIFICACIÓN) -->
      <div v-if="step === 'rechazado_chofer'" class="space-y-3 text-center py-3 animate-in zoom-in-95 duration-250">
        <div class="w-12 h-12 bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-full flex items-center justify-center mx-auto mb-2 animate-bounce">
          ✕
        </div>
        <h2 class="font-black text-rose-600 text-base">Servicio Cancelado</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">El conductor asignado tuvo que cancelar el servicio por el siguiente motivo:</p>
        <p class="text-xs bg-rose-50 dark:bg-rose-950/20 p-3 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 font-bold italic">
          "{{ driverCancelReason }}"
        </p>
        <button @click="resetFlow" class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md mt-2 transition">Pedir Otra Moto</button>
      </div>

      <!-- COMPLETADO -->
      <div v-if="step === 'terminado'" class="space-y-3 text-center py-3">
        <div class="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-2 animate-bounce">
          ✓
        </div>
        <h2 class="font-black text-emerald-600 text-base">¡Servicio Completado!</h2>
        <p class="text-xs text-slate-400">Gracias por elegir MotoCab. Esperamos verte pronto.</p>
        <button @click="resetFlow" class="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-950 dark:hover:bg-black text-white font-bold rounded-xl text-xs border border-slate-700 mt-2 transition">Pedir Nuevo Viaje</button>
      </div>

    </div>
  </div>
</template>