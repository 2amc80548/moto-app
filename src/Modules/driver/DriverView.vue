<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import SlideToAccept from "../../components/ui/SlideToAccept.vue";
import mapboxgl from "mapbox-gl";
import { toast } from "vue-sonner";
import { LogOut, Moon, Sun, MessageCircle, MapPin, Navigation } from "lucide-vue-next";

import { ref as dbRef, set, onDisconnect } from "firebase/database";
import { collection, query, where, onSnapshot, updateDoc, doc, getDoc } from "firebase/firestore";

import realtime from "../../firebase/realtime";
import db from "../../firebase/firestore";
import auth from "../../firebase/auth";
import { getRoute } from "../../services/mapService";
import { moveToNextDriver } from "../../services/ridesService";
import { logoutUser } from "../../services/authService";
import { useRouter } from "vue-router";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const router = useRouter();
const mapContainer = ref(null);
let map = null;

const isDark = ref(false); // Modo oscuro
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

onMounted(() => {
  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: "mapbox://styles/mapbox/navigation-night-v1",
    center: [-63.18, -17.78],
    zoom: 14,
  });
});

onBeforeUnmount(() => {
  stopTracking();
  clearTimers();
});

const toggleTheme = () => {
  isDark.value = !isDark.value;
  map.setStyle(isDark.value ? "mapbox://styles/mapbox/navigation-night-v1" : "mapbox://styles/mapbox/navigation-day-v1");
};

const handleLogout = async () => {
  await stopTracking();
  await logoutUser();
  router.push("/");
};

const contactSupport = () => {
  const msg = `Hola, soy chofer en MotoYa (ID: ${auth.currentUser.uid}). Necesito soporte por favor.`;
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
  watchId = navigator.geolocation.watchPosition(
    async (position) => {
      const location = { lat: position.coords.latitude, lng: position.coords.longitude, online: true, updatedAt: Date.now() };
      currentPosition.value = location;

      if (auth.currentUser) {
        const driverOnlineRef = dbRef(realtime, `drivers_online/${auth.currentUser.uid}`);
        await set(driverOnlineRef, location);
        onDisconnect(driverOnlineRef).set({ online: false });
      }

      if (!driverMarker) {
        const el = document.createElement('div');
        el.className = 'w-10 h-10 bg-blue-600 rounded-full border-4 border-white shadow-xl flex items-center justify-center text-white';
        el.innerHTML = '🏍️';
        driverMarker = new mapboxgl.Marker(el).setLngLat([location.lng, location.lat]).addTo(map);
      } else {
        driverMarker.setLngLat([location.lng, location.lat]);
      }

      // NAVEGACIÓN TIPO GOOGLE MAPS: Seguimiento 3D fluido cuando hay un viaje activo
      if (currentRide.value && (currentRide.value.status === 'accepted' || currentRide.value.status === 'started' || currentRide.value.status === 'arrived')) {
        map.easeTo({ 
          center: [location.lng, location.lat], 
          zoom: 17, 
          pitch: 60, // Ángulo 3D
          essential: true 
        });
        updateRoute();
      } else {
        map.easeTo({ center: [location.lng, location.lat], pitch: 0, zoom: 15 });
      }
    },
    (err) => console.error(err),
    { enableHighAccuracy: true }
  );
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
  onSnapshot(query(collection(db, "rides"), where("driverId", "==", auth.currentUser.uid)), (snapshot) => {
    snapshot.forEach((docItem) => {
      const rideData = { id: docItem.id, ...docItem.data() };
      if (rideData.status === "completed" || rideData.status === "cancelled") {
        clearMapData(); currentRide.value = null; clearTimers(); return;
      }
      const isNewRide = !currentRide.value || currentRide.value.id !== rideData.id;
      currentRide.value = rideData;
      renderRideMarkers();
      updateRoute();

      if (rideData.status === "searching" && isNewRide) startAcceptanceTimer(rideData);
      else if (rideData.status !== "searching") clearTimers();
    });
  });
};

const startAcceptanceTimer = (rideData) => {
  clearTimers();
  timeLeft.value = 15;
  timerInterval = setInterval(() => {
    timeLeft.value -= 1;
    if (timeLeft.value <= 0) clearTimers();
  }, 1000);
  rideTimeout = setTimeout(async () => {
    toast.error("Tiempo agotado.");
    await rejectRide(rideData);
  }, 15000);
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

  if (currentRide.value.status === "searching" || currentRide.value.status === "accepted") {
    const el = document.createElement('div'); el.className = "text-2xl"; el.innerHTML = "🧍";
    passengerMarker = new mapboxgl.Marker(el).setLngLat([currentRide.value.origin.lng, currentRide.value.origin.lat]).addTo(map);
  }
  if (currentRide.value.status === "arrived" || currentRide.value.status === "started") {
    const el = document.createElement('div'); el.className = "text-2xl"; el.innerHTML = "🏁";
    destinationMarker = new mapboxgl.Marker(el).setLngLat([currentRide.value.destination.lng, currentRide.value.destination.lat]).addTo(map);
  }
};

const updateRoute = async () => {
  if (!currentRide.value || !currentPosition.value) return;
  const status = currentRide.value.status;
  let originPoint = (status === "searching" || status === "accepted") ? currentPosition.value : currentRide.value.origin;
  let targetPoint = (status === "searching" || status === "accepted") ? currentRide.value.origin : currentRide.value.destination;

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
  map.easeTo({ pitch: 0 }); // Volver a vista plana al terminar
};

const updateRideStatus = async (status) => {
  if (!currentRide.value) return;
  await updateDoc(doc(db, "rides", currentRide.value.id), { status });
  currentRide.value.status = status;
  if (status === "completed") {
    toast.success("¡Viaje finalizado!");
    clearMapData(); currentRide.value = null;
  } else { renderRideMarkers(); updateRoute(); }
};

const rejectRide = async (ride = currentRide.value) => {
  if (!ride) return;
  clearTimers(); clearMapData();
  await moveToNextDriver(ride);
  currentRide.value = null;
};
</script>

<template>
  <div :class="{ 'dark': isDark }" class="relative w-full h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-900 transition-colors">
    
    <div class="absolute inset-0 md:relative md:flex-1 h-full w-full z-0">
      <div ref="mapContainer" class="w-full h-full"></div>
    </div>

    <div class="z-10 w-full md:w-[400px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md shadow-2xl flex flex-col justify-between p-6 md:h-full absolute bottom-0 md:relative rounded-t-3xl md:rounded-none border-t md:border-r border-slate-100 dark:border-slate-700 max-h-[85vh] overflow-y-auto transition-colors">
      
      <div>
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-black text-slate-800 dark:text-white">Conductor</h1>
            <p class="text-xs text-slate-500 dark:text-slate-400">Modo Navegación</p>
          </div>
          
          <div class="flex items-center gap-2">
            <button @click="toggleTheme" class="p-2 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-600 dark:text-yellow-400">
              <Sun v-if="isDark" :size="18" />
              <Moon v-else :size="18" />
            </button>
            <label class="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" :checked="online" @change="toggleOnline" class="sr-only peer">
              <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>
        </div>

        <div v-if="!online" class="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-center text-amber-700 dark:text-amber-400 text-sm">
          Activa el interruptor para recibir viajes.
        </div>
      </div>

      <div v-if="currentRide" class="flex-1 flex flex-col justify-between mt-4">
        <div class="bg-slate-50 dark:bg-slate-700/50 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 shadow-sm mb-4">
          
          <div class="flex justify-between items-center mb-3 pb-3 border-b border-slate-200 dark:border-slate-600">
            <span class="text-xs font-bold uppercase flex items-center gap-1" :class="currentRide.status === 'accepted' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'">
              <Navigation :size="14" /> {{ currentRide.status === 'accepted' ? 'Ir a recoger' : 'Ir a destino' }}
            </span>
            <div class="text-right">
              <span class="text-lg font-extrabold text-slate-800 dark:text-white block">{{ routeDuration }}</span>
              <span class="text-xs text-slate-500">{{ routeDistance }}</span>
            </div>
          </div>

          <div class="space-y-2 text-sm">
            <div class="flex items-start gap-2">
              <User class="text-emerald-500" :size="18" />
              <span class="text-slate-600 dark:text-slate-300 font-bold">{{ currentRide.clientName || 'Cliente' }}</span>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div v-if="currentRide.status === 'searching'" class="space-y-2">
            <div class="flex justify-between text-xs font-bold px-1 dark:text-white">
              <span>Aceptar en:</span>
              <span class="text-rose-500">{{ timeLeft }}s</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div class="bg-rose-500 h-full transition-all duration-1000 ease-linear" :style="{ width: `${(timeLeft / 15) * 100}%` }"></div>
            </div>
            <div class="pt-2"><SlideToAccept @confirm="updateRideStatus('accepted')" /></div>
            <button @click="rejectRide()" class="w-full py-3 text-sm font-semibold text-rose-500 hover:text-rose-600">Rechazar viaje</button>
          </div>

          <button v-if="currentRide.status === 'accepted'" @click="updateRideStatus('arrived')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg">Llegué al Punto</button>
          <button v-if="currentRide.status === 'arrived'" @click="updateRideStatus('started')" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg">Iniciar Viaje</button>
          <button v-if="currentRide.status === 'started'" @click="updateRideStatus('completed')" class="w-full bg-slate-900 dark:bg-slate-950 text-white font-bold py-4 rounded-xl shadow-lg border border-slate-700">Finalizar Viaje</button>
        </div>
      </div>

      <div class="mt-6 flex gap-2 border-t border-slate-100 dark:border-slate-700 pt-4">
        <button @click="contactSupport" class="flex-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs transition hover:bg-green-100">
          <MessageCircle :size="16" /> Soporte
        </button>
        <button @click="handleLogout" class="flex-1 bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 py-3 rounded-xl flex justify-center items-center gap-2 font-bold text-xs transition hover:bg-rose-100">
          <LogOut :size="16" /> Salir
        </button>
      </div>

    </div>
  </div>
</template>