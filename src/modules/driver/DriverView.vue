<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from "vue";
import SlideToAccept from "../../components/ui/SlideToAccept.vue";
import mapboxgl from "mapbox-gl";
import { toast } from "vue-sonner";
import { LogOut, Moon, Sun, MessageCircle, Navigation, User, Crosshair, Key } from "lucide-vue-next";

import { ref as dbRef, set, onDisconnect } from "firebase/database";
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc } from "firebase/firestore";
import { updatePassword } from "firebase/auth";

import realtime from "../../firebase/realtime";
import db from "../../firebase/firestore";
import auth from "../../firebase/auth";
import { getRoute } from "../../services/mapService";
import { moveToNextDriver } from "../../services/ridesService";
import { logoutUser } from "../../services/authService";
import { useRouter } from "vue-router";
import { useThemeStore } from "../../stores/themeStore";
import { getLocalPhoto } from "../../utils/indexedDB";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const router = useRouter();
const themeStore = useThemeStore();
const mapContainer = ref(null);
const localPhoto = ref("");
let map = null;

const isDark = computed(() => themeStore.isDark);
const online = ref(false);
const currentRide = ref(null);
const currentPosition = ref(null);

const routeDistance = ref("");
const routeDuration = ref("");

let watchId = null;
let driverMarker = null;
let passengerMarker = null;
let destinationMarker = null;

const timeLeft = ref(15);
let rideTimeout = null;
let timerInterval = null;

const centerCamera = ref(true);

// Cambiar contraseña
const showPasswordFields = ref(false);
const newPassword = ref("");
const changingPassword = ref(false);

// Cancelación justificada
const showCancelModal = ref(false);
const cancelReason = ref("");

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
    toast.error("Error al cambiar contraseña. Para seguridad, debes haber iniciado sesión recientemente.");
  } finally {
    changingPassword.value = false;
  }
};

const centerOnDriver = () => {
  if (navigator.geolocation) {
    toast.info("Centrando ubicación...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lngLat = [pos.coords.longitude, pos.coords.latitude];
        map.flyTo({ center: lngLat, zoom: 16, essential: true });
        
        currentPosition.value = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        
        if (driverMarker) {
          driverMarker.setLngLat(lngLat);
        } else {
          const el = document.createElement('div');
          el.className = 'relative flex items-center justify-center';
          el.innerHTML = `
            <div class="absolute w-10 h-10 bg-blue-500/20 rounded-full animate-ping"></div>
            <div class="relative w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M5 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M10 16h3L17 8H9L7 11.5M17 8h2.5L21 11.5v3h-2M12 8.5V11"/></svg>
            </div>
          `;
          driverMarker = new mapboxgl.Marker(el).setLngLat(lngLat).addTo(map);
        }
      },
      () => toast.error("Por favor activa tu GPS."),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }
};

const previewingOnMap = ref(false);
const previewPointType = ref("");
const previewingDistance = ref("");
const previewingDuration = ref("");

const getOriginLabel = (type) => {
  if (type === 'compra') return 'Ver Compra';
  if (type === 'envio') return 'Ver Recojo';
  return 'Ver Ubicación';
};

const getDestinationLabel = (type) => {
  if (type === 'compra') return 'Ver Destino';
  if (type === 'envio') return 'Ver Destino';
  return 'Ver Destino';
};

const previewLocation = async (pointType) => {
  if (!currentRide.value) return;
  const point = pointType === 'origin' ? currentRide.value.origin : currentRide.value.destination;
  if (point) {
    map.flyTo({ center: [point.lng, point.lat], zoom: 16, essential: true });
    previewPointType.value = pointType;
    previewingOnMap.value = true;
    
    previewingDistance.value = "Calculando...";
    previewingDuration.value = "...";
    
    if (currentPosition.value) {
      try {
        const route = await getRoute(currentPosition.value, point);
        if (route) {
          previewingDistance.value = route.distance + " km";
          previewingDuration.value = route.duration + " min";
        }
      } catch (err) {
        console.error("Error previewing route:", err);
        previewingDistance.value = "N/A";
        previewingDuration.value = "N/A";
      }
    }
  }
};

const closePreview = () => {
  previewingOnMap.value = false;
  previewPointType.value = "";
  previewingDistance.value = "";
  previewingDuration.value = "";
  clearMapData();
  
  if (currentRide.value) {
    renderRideMarkers();
    updateRoute();
  } else {
    centerOnDriver();
  }
};

const showProfile = ref(false);
const userProfile = ref({
  name: auth?.currentUser?.displayName || "Chofer",
  email: auth?.currentUser?.email || "",
  phone: "",
  dni: "",
  plate: ""
});

const avatarUrl = computed(() => {
  return localPhoto.value || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile.value.name)}&background=10b981&color=fff&size=128`;
});

onMounted(async () => {
  if (auth.currentUser) {
    const uDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (uDoc.exists()) {
      const data = uDoc.data();
      userProfile.value.phone = data.phone || "";
      userProfile.value.name = data.name || auth.currentUser.displayName;
      userProfile.value.dni = data.dni || "";
      userProfile.value.plate = data.plate || "";
    }
    
    const pPhoto = await getLocalPhoto(auth.currentUser.uid);
    if (pPhoto) {
      localPhoto.value = pPhoto;
    }
  }

  // Mapa limpio sin líneas de tráfico
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: themeStore.isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
    center: [-63.18, -17.78],
    zoom: 14,
  });
});

onBeforeUnmount(() => {
  stopTracking();
  clearTimers();
});

const toggleTheme = () => {
  themeStore.toggleTheme();
  map.setStyle(themeStore.isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12");
};

const handleLogout = async () => {
  await stopTracking();
  await logoutUser();
  router.push("/");
};

const contactSupport = () => {
  const msg = `Hola soy ${userProfile.value.name}. Necesito soporte por una queja o consulta.`;
  window.open(`https://wa.me/59163591312?text=${encodeURIComponent(msg)}`, "_blank");
};

const toggleOnline = async () => {
  if (!online.value) { 
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (userDoc.data()?.isApproved === false) {
      return toast.error("Tu cuenta no ha sido habilitada por el Administrador.");
    }
  }

  online.value = !online.value;
  
  if (online.value) {
    centerCamera.value = true;
    startTracking();
    listenRides();
    toast.success("Te has conectado");
  } else {
    stopTracking();
    clearMapData();
    currentRide.value = null;
    toast.info("Te has desconectado");
  }
};

const startTracking = () => {
  navigator.geolocation.getCurrentPosition(
    async (position) => await updateDriverLocation(position),
    (err) => console.error(err),
    { enableHighAccuracy: true }
  );

  watchId = navigator.geolocation.watchPosition(
    async (position) => await updateDriverLocation(position),
    (err) => console.error(err),
    { enableHighAccuracy: true }
  );
};

const updateDriverLocation = async (position) => {
  const location = { lat: position.coords.latitude, lng: position.coords.longitude, online: true, updatedAt: Date.now() };
  currentPosition.value = location;

  if (auth.currentUser) {
    const driverOnlineRef = dbRef(realtime, `drivers_online/${auth.currentUser.uid}`);
    await set(driverOnlineRef, location);
    onDisconnect(driverOnlineRef).set({ online: false });
  }

  if (!driverMarker) {
    const el = document.createElement('div');
    el.className = 'relative flex items-center justify-center';
    el.innerHTML = `
      <div class="absolute w-10 h-10 bg-blue-500/20 rounded-full animate-ping"></div>
      <div class="relative w-9 h-9 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-full shadow-lg border-2 border-white flex items-center justify-center text-white">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M5 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0M13 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0"/><path d="M10 16h3L17 8H9L7 11.5M17 8h2.5L21 11.5v3h-2M12 8.5V11"/></svg>
      </div>
    `;
    driverMarker = new mapboxgl.Marker(el).setLngLat([location.lng, location.lat]).addTo(map);
  } else {
    driverMarker.setLngLat([location.lng, location.lat]);
  }

  // Centrado automático en viaje
  if (centerCamera.value) {
    if (currentRide.value && (currentRide.value.status === 'accepted' || currentRide.value.status === 'started' || currentRide.value.status === 'arrived')) {
      map.easeTo({ center: [location.lng, location.lat], zoom: 16.5, pitch: 60, essential: true });
      updateRoute();
    } else {
      map.easeTo({ center: [location.lng, location.lat], pitch: 0, zoom: 15 });
    }
    centerCamera.value = false;
  } else {
    if (currentRide.value && (currentRide.value.status === 'accepted' || currentRide.value.status === 'started' || currentRide.value.status === 'arrived')) {
      updateRoute();
    }
  }
};

const stopTracking = async () => {
  if (watchId) navigator.geolocation.clearWatch(watchId);
  if (auth.currentUser) {
    const ref = dbRef(realtime, `drivers_online/${auth.currentUser.uid}`);
    onDisconnect(ref).cancel();
    await set(ref, { online: false });
  }
  if (driverMarker) { driverMarker.remove(); driverMarker = null; }
};

const listenRides = () => {
  if (!auth.currentUser) return;
  
  const qActive = query(
    collection(db, "rides"), 
    where("driverId", "==", auth.currentUser.uid),
    where("status", "in", ["searching", "accepted", "arrived", "started"])
  );

  onSnapshot(qActive, (snapshot) => {
    if (snapshot.empty) {
      clearMapData(); currentRide.value = null; clearTimers(); return;
    }
    
    // Convert docs to array and sort by createdAt descending
    const activeRides = snapshot.docs.map(docItem => ({ id: docItem.id, ...docItem.data() }));
    activeRides.sort((a, b) => {
      const timeA = a.createdAt?.seconds ? a.createdAt.seconds * 1000 : (a.createdAt || 0);
      const timeB = b.createdAt?.seconds ? b.createdAt.seconds * 1000 : (b.createdAt || 0);
      return timeB - timeA;
    });

    const rideData = activeRides[0];
    
    // Check if expired immediately on load/receive (only reject if genuinely abandoned, e.g. > 3 minutes)
    const createdAtMs = (rideData.createdAt?.seconds ? rideData.createdAt.seconds * 1000 : rideData.createdAt) || Date.now();
    const timeElapsed = Date.now() - createdAtMs;

    if (rideData.status === "searching" && timeElapsed > 180000) {
      rejectRide(rideData);
      return;
    }
    
    const isNewRide = !currentRide.value || currentRide.value.id !== rideData.id;
    currentRide.value = rideData;
    renderRideMarkers();
    updateRoute();

    if (rideData.status === "searching" && isNewRide) startAcceptanceTimer(rideData);
    else if (rideData.status !== "searching") clearTimers();
  });
};

const startAcceptanceTimer = (rideData) => {
  clearTimers();
  const createdAtMs = (rideData.createdAt?.seconds ? rideData.createdAt.seconds * 1000 : rideData.createdAt) || Date.now();
  const durationLimit = (rideData.type === 'viaje') ? 30000 : 60000;
  const timeElapsed = Date.now() - createdAtMs;
  
  let remainingTimeMs = durationLimit - timeElapsed;
  // If the calculated remaining time is negative or invalid due to clock drift, default to full duration limit
  if (remainingTimeMs <= 0 || remainingTimeMs > durationLimit) {
    remainingTimeMs = durationLimit;
  }

  timeLeft.value = Math.ceil(remainingTimeMs / 1000);

  timerInterval = setInterval(() => {
    timeLeft.value -= 1;
    if (timeLeft.value <= 0) {
      clearTimers();
      rejectRide(rideData);
    }
  }, 1000);

  rideTimeout = setTimeout(async () => {
    toast.error("Tiempo agotado.");
    await rejectRide(rideData);
  }, remainingTimeMs);
};

const clearTimers = () => {
  if (rideTimeout) clearTimeout(rideTimeout);
  if (timerInterval) clearInterval(timerInterval);
};

const renderRideMarkers = () => {
  if (!currentRide.value) return;
  if (passengerMarker) passengerMarker.remove();
  if (destinationMarker) destinationMarker.remove();
  passengerMarker = null; destinationMarker = null;

  if (currentRide.value.origin) {
    const el = document.createElement('div');
    el.className = 'relative flex items-center justify-center';
    el.innerHTML = `
      <div class="absolute w-8 h-8 bg-emerald-500/20 rounded-full animate-pulse"></div>
      <div class="relative w-6 h-6 bg-emerald-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white text-[10px] font-black">A</div>
    `;
    passengerMarker = new mapboxgl.Marker(el).setLngLat([currentRide.value.origin.lng, currentRide.value.origin.lat]).addTo(map);
  }

  if (currentRide.value.destination) {
    const el = document.createElement('div');
    el.className = 'relative flex flex-col items-center animate-bounce';
    el.innerHTML = `
      <div class="w-6 h-6 bg-rose-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white text-[10px] font-black">B</div>
    `;
    destinationMarker = new mapboxgl.Marker(el).setLngLat([currentRide.value.destination.lng, currentRide.value.destination.lat]).addTo(map);
  }
};

const updateRoute = async () => {
  if (!currentRide.value || !currentPosition.value) return;
  const status = currentRide.value.status;
  let originPoint = (status === "searching" || status === "accepted") ? currentPosition.value : (currentRide.value.origin || currentPosition.value);
  let targetPoint = (status === "searching" || status === "accepted") ? (currentRide.value.origin || currentRide.value.destination) : currentRide.value.destination;

  try {
    const route = await getRoute(originPoint, targetPoint);
    if (route && route.geometry) {
      drawRoute(route.geometry);
      routeDistance.value = route.distance + " km";
      routeDuration.value = route.duration + " min";
    }
  } catch (error) { console.error(error); }
};

const drawRoute = (geometry) => {
  if (map.getSource("route")) map.getSource("route").setData(geometry);
  else {
    map.addSource("route", { type: "geojson", data: { type: "Feature", geometry } });
    map.addLayer({ id: "route", type: "line", source: "route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#3b82f6", "line-width": 6 } });
  }
};

const clearMapData = () => {
  if (map.getSource("route")) { map.removeLayer("route"); map.removeSource("route"); }
  if (passengerMarker) passengerMarker.remove();
  if (destinationMarker) destinationMarker.remove();
  routeDistance.value = ""; routeDuration.value = "";
  map.easeTo({ pitch: 0 }); 
};

const updateRideStatus = async (status) => {
  if (!currentRide.value) return;
  
  // Validar asignación del chofer antes de permitir aceptar
  const rideDoc = await getDoc(doc(db, "rides", currentRide.value.id));
  if (!rideDoc.exists()) {
    toast.error("El viaje ya no existe.");
    currentRide.value = null;
    clearMapData();
    return;
  }
  
  const rideData = rideDoc.data();
  if (status === 'accepted') {
    if (rideData.status !== 'searching' || rideData.driverId !== auth.currentUser.uid) {
      toast.error("El viaje ya no está disponible o el tiempo expiró.");
      currentRide.value = null;
      clearMapData();
      clearTimers();
      return;
    }
  }

  const updateData = { status };
  if (status === 'accepted') {
    updateData.wasAccepted = true;
    updateData.acceptedAt = Date.now();
  }
  await updateDoc(doc(db, "rides", currentRide.value.id), updateData);
  currentRide.value.status = status;
  if (status === "completed") {
    toast.success("¡Viaje finalizado!");
    clearMapData(); currentRide.value = null;
  } else { 
    if (status === 'accepted') centerCamera.value = true;
    renderRideMarkers(); 
    updateRoute(); 
  }
};

const rejectRide = async (ride = currentRide.value) => {
  if (!ride) return;
  clearTimers(); clearMapData();
  await moveToNextDriver(ride);
  currentRide.value = null;
};

// Cancelar viaje de chofer con Justificación
const cancelRideDriver = async () => {
  if (!currentRide.value) return;
  showCancelModal.value = true;
};

const confirmCancelRideDriver = async () => {
  if (!cancelReason.value.trim()) {
    return toast.error("Ingresa el motivo de cancelación");
  }
  try {
    await updateDoc(doc(db, "rides", currentRide.value.id), {
      status: "cancelled",
      cancelledBy: "driver",
      cancelledAt: Date.now(),
      cancelReason: cancelReason.value.trim(),
      wasAccepted: true
    });
    clearMapData();
    currentRide.value = null;
    showCancelModal.value = false;
    cancelReason.value = "";
    toast.info("Viaje cancelado");
  } catch (error) {
    toast.error("Error al cancelar");
  }
};
</script>

<template>
  <div :class="{ 'dark': isDark }" class="relative w-full h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900 transition-colors">
    
    <div class="absolute inset-0 md:relative md:flex-1 h-full w-full z-0">
      <div ref="mapContainer" class="w-full h-full"></div>
    </div>

    <!-- Botón de centrar - Siempre visible y flotante z-30 -->
    <button @click="centerOnDriver" class="absolute top-20 right-4 z-30 p-3 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full shadow-xl border border-white/20 dark:border-slate-700 text-blue-600 hover:scale-105 active:scale-95 transition flex items-center justify-center">
      <Crosshair :size="24" />
    </button>

    <!-- Menú de Perfil (Modal) -->
    <div v-if="showProfile" class="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex justify-start md:justify-end">
      <div class="w-full max-w-sm bg-white dark:bg-slate-800 h-full p-6 shadow-2xl flex flex-col justify-between transition-colors animate-in slide-in-from-right duration-250">
        <div>
          <div class="flex justify-between items-center mb-6 pb-4 border-b border-slate-100 dark:border-slate-700">
            <h2 class="text-xl font-black dark:text-white">Perfil Conductor</h2>
            <button @click="showProfile = false; showPasswordFields = false; newPassword = '';" class="text-slate-400 font-bold hover:text-slate-600 dark:hover:text-slate-200">✕</button>
          </div>
          <div class="space-y-4">
            <div class="flex justify-center mb-6">
              <img :src="avatarUrl" alt="Avatar" class="w-24 h-24 rounded-full shadow-lg border-4 border-emerald-500/20 object-cover" />
            </div>
            
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400">Nombre Completo</label>
              <input v-model="userProfile.name" type="text" disabled placeholder="Nombre" class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-sm outline-none cursor-not-allowed">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400">Celular</label>
              <input v-model="userProfile.phone" type="text" disabled placeholder="Celular" class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-sm outline-none cursor-not-allowed">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400">N° Carnet (DNI)</label>
              <input v-model="userProfile.dni" type="text" disabled placeholder="DNI" class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-sm outline-none cursor-not-allowed">
            </div>

            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400">Placa de la Moto</label>
              <input v-model="userProfile.plate" type="text" disabled placeholder="Placa" class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-700 text-slate-500 dark:text-slate-400 rounded-xl text-sm outline-none cursor-not-allowed">
            </div>

            <!-- Botón y formulario para cambiar contraseña -->
            <div class="border-t border-slate-100 dark:border-slate-700 pt-4 mt-4 space-y-3">
              <button @click="showPasswordFields = !showPasswordFields" class="w-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-250 text-slate-800 dark:text-white font-bold py-3 rounded-xl transition text-xs flex items-center justify-center gap-2 shadow-sm">
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
      </div>
    </div>

    <!-- PANEL PRINCIPAL LATERAL - Habilitado solo si no hay viaje o si el viaje está en 'searching' (Aceptar) -->
    <div v-if="(!currentRide || currentRide.status === 'searching') && !previewingOnMap" class="z-10 w-full md:w-[400px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-2xl flex flex-col justify-between p-6 md:h-full absolute bottom-0 md:relative rounded-t-3xl md:rounded-none border-t md:border-r border-slate-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto transition-colors">
      
      <div>
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
             <button @click="showProfile = true" class="w-10 h-10 rounded-full border-2 border-slate-200 dark:border-slate-600 overflow-hidden shadow-sm hover:scale-105 transition shrink-0">
               <img :src="avatarUrl" alt="Avatar" class="w-full h-full object-cover"/>
             </button>
             <div>
               <h1 class="text-xl font-black text-slate-800 dark:text-white">MotoCab</h1>
               <p class="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500">Conductor</p>
             </div>
          </div>
          
          <div class="flex items-center gap-2">
            <button @click="toggleTheme" class="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-600 dark:text-yellow-400">
              <Sun v-if="isDark" :size="18" />
              <Moon v-else :size="18" />
            </button>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" :checked="online" @change="toggleOnline" class="sr-only peer">
              <div class="w-14 h-7 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        <div v-if="!online" class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center text-amber-700 dark:text-amber-400 text-sm font-medium">
          Activa el interruptor para recibir viajes.
        </div>
      </div>

      <!-- Alerta de aceptación entrante -->
      <div v-if="currentRide && currentRide.status === 'searching'" class="flex-grow flex flex-col justify-end mt-4">
        <div class="bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded-2xl p-4 shadow-sm mb-4">
          <span class="text-[11px] uppercase font-black text-amber-700 dark:text-amber-500">
            NUEVO SERVICIO ({{ currentRide.type === 'viaje' ? 'VIAJE 🏍️' : (currentRide.type === 'envio' ? 'ENVÍO 📦' : 'PEDIDO 🛍️') }})
          </span>
          <p class="text-sm font-black text-slate-900 dark:text-white mt-1">{{ currentRide.details || 'Solicitud de transporte' }}</p>
          
          <!-- Detalle de Tarifa para el Chofer -->
          <div v-if="currentRide.totalPrice" class="mt-2.5 bg-white/70 dark:bg-slate-950/40 p-2.5 rounded-xl border border-amber-200/50 dark:border-slate-800 flex justify-between items-center text-left text-xs">
            <div>
              <span class="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">Tarifa Total</span>
              <p class="font-extrabold text-slate-900 dark:text-white text-sm">{{ currentRide.totalPrice }} Bs</p>
            </div>
            <div v-if="currentRide.extraPrice > 0" class="text-right">
              <span class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase font-bold animate-pulse">Bs {{ currentRide.extraPrice }} Extra Incluido</span>
            </div>
          </div>
          
          <div class="flex gap-2 text-xs font-bold mt-3">
            <button type="button" @click="previewLocation('origin')" v-if="currentRide.origin" class="flex-1 py-1.5 bg-white/85 dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200/50">📍 {{ getOriginLabel(currentRide.type) }}</button>
            <button type="button" @click="previewLocation('destination')" class="flex-1 py-1.5 bg-white/85 dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200/50">🏁 {{ getDestinationLabel(currentRide.type) }}</button>
          </div>
        </div>

        <div class="space-y-2">
          <div class="flex justify-between text-xs font-bold px-1 dark:text-white">
            <span>Aceptar en:</span>
            <span class="text-rose-500">{{ timeLeft }}s</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div class="bg-rose-500 h-full transition-all duration-1000 ease-linear" :style="{ width: `${(timeLeft / (currentRide.type === 'viaje' ? 30 : 60)) * 100}%` }"></div>
          </div>
          <div class="pt-2"><SlideToAccept @confirm="updateRideStatus('accepted')" /></div>
          <button @click="rejectRide()" class="w-full py-3 text-xs font-semibold text-rose-500 hover:text-rose-600">Rechazar servicio</button>
        </div>
      </div>

      <div class="mt-6 flex gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">
        <button @click="contactSupport" class="flex-1 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 text-green-600 dark:text-green-400 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs transition shadow-sm">
          <MessageCircle :size="16" /> Soporte
        </button>
        <button @click="handleLogout" class="flex-1 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs transition shadow-sm">
          <LogOut :size="16" /> Salir
        </button>
      </div>

    </div>

    <!-- PANEL FLOTANTE COMPACTO DE VIAJE ACTIVO (95% MAPA) -->
    <div v-if="currentRide && currentRide.status !== 'searching'" class="absolute bottom-6 left-4 right-4 z-10 max-w-md mx-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-3xl p-5 border border-white/20 dark:border-slate-700/50 shadow-2xl space-y-3 animate-in slide-in-from-bottom duration-250 text-slate-800 dark:text-white transition-colors">
      
      <!-- Compact Info -->
      <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
        <div>
          <span class="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-blue-150 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            {{ currentRide.type === 'viaje' ? 'VIAJE 🏍️' : (currentRide.type === 'envio' ? 'ENVÍO 📦' : 'PEDIDO 🛍️') }}
          </span>
          <p class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2">Cliente: {{ currentRide.clientName }}</p>
        </div>
        <div class="text-right flex flex-col items-end">
          <p class="text-sm font-black text-slate-800 dark:text-white">{{ routeDuration }}</p>
          <p class="text-[10px] text-slate-400 font-bold">{{ routeDistance }}</p>
          <p v-if="currentRide.totalPrice" class="text-xs font-black text-blue-600 dark:text-blue-400 mt-1">Cobrar: {{ currentRide.totalPrice }} Bs</p>
        </div>
      </div>
      
      <!-- Details of shipment/purchase -->
      <p v-if="currentRide.details" class="text-xs bg-amber-50 dark:bg-amber-950/20 p-2.5 rounded-xl border border-amber-250 dark:border-amber-900 text-amber-800 dark:text-amber-300 font-medium">
        {{ currentRide.details }}
      </p>
      
      <!-- Action Button -->
      <div class="pt-2">
        <button v-if="currentRide.status === 'accepted'" @click="updateRideStatus('arrived')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl shadow-lg transition">
          {{ currentRide.type === 'compra' ? 'Ya compré y llegué al destino' : 'Llegué al Punto de Recojo' }}
        </button>
        <button v-if="currentRide.status === 'arrived'" @click="updateRideStatus('started')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl shadow-lg transition">
          {{ currentRide.type !== 'viaje' ? 'En camino a entregar' : 'Iniciar Viaje' }}
        </button>
        <button v-if="currentRide.status === 'started'" @click="updateRideStatus('completed')" class="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-950 dark:hover:bg-black text-white font-bold py-3.5 rounded-2xl shadow-lg border border-slate-700 transition">
          {{ currentRide.type !== 'viaje' ? 'Entregado con éxito' : 'Finalizar Viaje' }}
        </button>

        <button @click="cancelRideDriver" class="w-full mt-2 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 text-rose-600 dark:text-rose-400 font-bold py-2 rounded-xl transition text-[10px]">
          Cancelar Servicio
        </button>
      </div>
    </div>

    <!-- PANEL DE PREVISUALIZACIÓN DE MAPA LIMPIO (MUESTRA DISTANCIA/TIEMPO Y VOLVER) -->
    <div v-if="previewingOnMap && currentRide" class="absolute bottom-6 left-4 right-4 z-30 max-w-md mx-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-3xl p-5 border border-white/20 dark:border-slate-700/50 shadow-2xl space-y-4 animate-in slide-in-from-bottom duration-250 text-slate-800 dark:text-white transition-colors">
      <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
        <div>
          <span class="text-[9px] uppercase font-black px-2 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
            Previsualización
          </span>
          <h4 class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-2">
            Punto: <span class="text-slate-800 dark:text-white">{{ previewPointType === 'origin' ? 'Recojo' : 'Entrega' }}</span>
          </h4>
        </div>
        <div class="text-right">
          <p class="text-sm font-black text-slate-800 dark:text-white">{{ previewingDuration }}</p>
          <p class="text-[10px] text-slate-400 font-bold">{{ previewingDistance }}</p>
        </div>
      </div>
      
      <!-- Detalles del servicio -->
      <div v-if="currentRide.details" class="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200 dark:border-amber-800 text-left text-xs max-h-[80px] overflow-y-auto">
        <span class="text-[9px] font-black text-amber-600 uppercase">Detalles del {{ currentRide.type === 'compra' ? 'Pedido' : (currentRide.type === 'envio' ? 'Envío' : 'Viaje') }}</span>
        <p class="text-[11px] font-bold mt-0.5 text-slate-750 dark:text-slate-350 whitespace-pre-line">{{ currentRide.details }}</p>
      </div>

      <div class="flex justify-between text-xs font-bold px-1 items-center">
        <span class="text-slate-500">Expiración:</span>
        <span class="text-rose-500 font-black">{{ timeLeft }}s</span>
      </div>

      <button @click="closePreview" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-2xl shadow-lg transition text-xs">
        ← Volver a la Solicitud
      </button>
    </div>

    <!-- MODAL DE CANCELACIÓN JUSTIFICADA (CHOFER) -->
    <div v-if="showCancelModal" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl relative border border-white/20 dark:border-slate-700 animate-in zoom-in-95 duration-200">
        <button @click="showCancelModal = false; cancelReason = '';" class="absolute top-6 right-6 text-slate-400 font-bold hover:text-slate-600">✕</button>
        <h3 class="text-slate-900 dark:text-white font-black text-base mb-2">Cancelar Servicio</h3>
        <p class="text-xs text-slate-400 mb-4">Ingresa un motivo breve para cancelar el servicio. Este motivo le aparecerá al cliente en su pantalla.</p>
        
        <textarea v-model="cancelReason" rows="3" placeholder="Ej: Neumático pinchado, problemas con el vehículo, etc." class="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none dark:text-white resize-none focus:border-rose-500"></textarea>
        
        <div class="flex gap-3 mt-4">
          <button @click="showCancelModal = false; cancelReason = '';" class="flex-1 py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 rounded-2xl text-xs font-bold text-slate-700 dark:text-white">Cancelar</button>
          <button @click="confirmCancelRideDriver" class="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-2xl text-xs shadow-md">Confirmar</button>
        </div>
      </div>
    </div>

  </div>
</template>