<script setup>
import { onMounted, ref, computed } from "vue";
import { getRoute } from "../../services/mapService";
import mapboxgl from "mapbox-gl";
import { logoutUser } from "../../services/authService";
import { ref as dbRef, onValue } from "firebase/database";
import { collection, onSnapshot, updateDoc, doc, setDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { toast } from "vue-sonner";
import { LayoutDashboard, Users, Car, Map, History, LogOut, Sun, Moon, Ban, CheckCircle, Trash2 } from "lucide-vue-next";
import { useRouter } from "vue-router";

import realtime from "../../firebase/realtime";
import db from "../../firebase/firestore";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const router = useRouter();

const currentTab = ref("dashboard");
const isDark = ref(false);

const mapContainer = ref(null);
let map = null;
const mapMarkers = ref([]);

const rides = ref([]);
const driversDB = ref({});
const usersList = ref([]);

const showAddModal = ref(false);
const newDriver = ref({ name: "", email: "", phone: "", pinColor: "#3b82f6" });

onMounted(() => {
  listenRealtimeDrivers();
  listenFirestoreRides();
  listenFirestoreUsers();
});

const toggleTheme = () => { isDark.value = !isDark.value; };
const handleLogout = async () => { await logoutUser(); router.push("/"); };

const initMap = () => {
  setTimeout(() => {
    if (!mapContainer.value) return;
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: isDark.value ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
      center: [-63.18, -17.78], zoom: 13,
    });
    renderMapActiveRides();
  }, 100);
};

const listenRealtimeDrivers = () => onValue(dbRef(realtime, "drivers_online"), (snapshot) => driversDB.value = snapshot.val() || {});
const listenFirestoreRides = () => {
  onSnapshot(collection(db, "rides"), (snapshot) => {
    rides.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (currentTab.value === 'map' && map) renderMapActiveRides();
  });
};
const listenFirestoreUsers = () => {
  onSnapshot(collection(db, "users"), (snapshot) => {
    usersList.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  });
};

const driversList = computed(() => usersList.value.filter(u => u.role === 'driver'));
const clientsList = computed(() => usersList.value.filter(u => u.role === 'client'));
const completedRides = computed(() => rides.value.filter(r => r.status === 'completed').sort((a,b) => b.createdAt - a.createdAt));

const stats = computed(() => {
  const onlineCount = Object.values(driversDB.value).filter(d => d.online).length;
  const busyCount = rides.value.filter(r => ['accepted', 'arrived', 'started'].includes(r.status)).length;
  return {
    online: onlineCount, busy: busyCount, available: Math.max(0, onlineCount - busyCount),
    completed: rides.value.filter(r => r.status === 'completed').length,
    clients: clientsList.value.length
  };
});

const renderMapActiveRides = () => {
  if (!map) return;
  mapMarkers.value.forEach(m => m.remove()); mapMarkers.value = [];
  rides.value.filter(r => r.status !== 'completed' && r.status !== 'cancelled').forEach(ride => {
    if (ride.origin) {
      const el = document.createElement('div'); el.className = 'w-4 h-4 rounded-full border-2 border-white';
      el.style.backgroundColor = ride.status === 'searching' ? '#eab308' : '#3b82f6';
      mapMarkers.value.push(new mapboxgl.Marker(el).setLngLat([ride.origin.lng, ride.origin.lat]).addTo(map));
    }
  });
};

// GESTIÓN
const toggleBlockUser = async (user) => {
  const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
  await updateDoc(doc(db, "users", user.id), { status: newStatus });
  toast.success(`Usuario ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}`);
};

const toggleApproval = async (driver) => {
  await updateDoc(doc(db, "users", driver.id), { isApproved: !driver.isApproved });
};

const deleteUser = async (id) => {
  if(confirm("¿Eliminar permanentemente este usuario?")) {
    await deleteDoc(doc(db, "users", id));
    toast.success("Usuario eliminado");
  }
};
</script>

<template>
  <div :class="{ 'dark': isDark }" class="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors">
    
    <header class="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex justify-between items-center z-10">
      <div class="flex items-center gap-6">
        <h1 class="text-xl font-black text-blue-600 flex items-center gap-2"><LayoutDashboard :size="24"/> Admin</h1>
        <nav class="hidden md:flex gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          <button v-for="(label, key) in {dashboard: 'Dashboard', drivers: 'Choferes', clients: 'Clientes', history: 'Historial', map: 'Mapa Activo'}" :key="key"
                  @click="currentTab = key; if(key==='map') initMap()"
                  :class="currentTab === key ? 'bg-blue-600 text-white font-bold shadow' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
                  class="px-4 py-2 rounded-lg text-xs transition">{{ label }}</button>
        </nav>
      </div>
      <div class="flex gap-3">
        <button @click="toggleTheme" class="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-yellow-400"><Sun v-if="isDark" :size="18"/><Moon v-else :size="18"/></button>
        <button @click="handleLogout" class="flex items-center gap-1 text-xs bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-lg font-bold"><LogOut :size="14"/> Salir</button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-6">
      
      <div v-if="currentTab === 'dashboard'" class="max-w-5xl mx-auto space-y-6">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm">
            <Car class="text-blue-500 mb-2"/>
            <p class="text-xs font-bold text-slate-500">Motos Online</p>
            <p class="text-3xl font-black">{{ stats.online }}</p>
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm">
            <CheckCircle class="text-emerald-500 mb-2"/>
            <p class="text-xs font-bold text-slate-500">Disponibles</p>
            <p class="text-3xl font-black text-emerald-600">{{ stats.available }}</p>
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm">
            <Map class="text-amber-500 mb-2"/>
            <p class="text-xs font-bold text-slate-500">En Viaje</p>
            <p class="text-3xl font-black text-amber-600">{{ stats.busy }}</p>
          </div>
          <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm">
            <Users class="text-purple-500 mb-2"/>
            <p class="text-xs font-bold text-slate-500">Clientes Totales</p>
            <p class="text-3xl font-black">{{ stats.clients }}</p>
          </div>
        </div>
      </div>

      <div v-if="currentTab === 'drivers'" class="max-w-5xl mx-auto">
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <tr><th class="p-4">Chofer / DNI</th><th class="p-4">Contacto</th><th class="p-4 text-center">Aprobación</th><th class="p-4 text-right">Acciones</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              <tr v-for="driver in driversList" :key="driver.id">
                <td class="p-4"><p class="font-bold">{{ driver.name }}</p><p class="text-xs text-slate-500">Carnet: {{ driver.dni || 'N/A' }}</p></td>
                <td class="p-4 text-xs">{{ driver.phone }}<br>{{ driver.email }}</td>
                <td class="p-4 text-center">
                  <button @click="toggleApproval(driver)" class="px-3 py-1 rounded-full text-xs font-bold transition" :class="driver.isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'">{{ driver.isApproved ? 'Habilitado' : 'Pendiente' }}</button>
                </td>
                <td class="p-4 text-right"><button @click="deleteUser(driver.id)" class="text-rose-500 hover:text-rose-700"><Trash2 :size="18"/></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="currentTab === 'clients'" class="max-w-5xl mx-auto">
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
              <tr><th class="p-4">Cliente</th><th class="p-4">Contacto</th><th class="p-4 text-center">Estado</th><th class="p-4 text-right">Bloquear</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              <tr v-for="client in clientsList" :key="client.id">
                <td class="p-4 font-bold">{{ client.name }}</td>
                <td class="p-4 text-xs">{{ client.phone }}<br>{{ client.email }}</td>
                <td class="p-4 text-center">
                  <span class="px-3 py-1 rounded-full text-xs font-bold" :class="client.status === 'blocked' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'">{{ client.status === 'blocked' ? 'Bloqueado' : 'Activo' }}</span>
                </td>
                <td class="p-4 text-right">
                  <button @click="toggleBlockUser(client)" class="text-slate-400 hover:text-rose-500 mx-2"><Ban :size="18"/></button>
                  <button @click="deleteUser(client.id)" class="text-rose-500 hover:text-rose-700"><Trash2 :size="18"/></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="currentTab === 'history'" class="max-w-5xl mx-auto">
        <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div v-for="ride in completedRides" :key="ride.id" class="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between">
            <div>
              <p class="font-bold text-sm">Cliente: {{ ride.clientName }} <span class="text-slate-400 mx-2">→</span> Chofer ID: {{ ride.driverId.slice(0,6) }}</p>
              <p class="text-xs text-slate-500 mt-1">Fecha: {{ new Date(ride.createdAt?.toDate()).toLocaleString() }}</p>
            </div>
            <span class="bg-purple-100 text-purple-700 text-xs px-3 py-1 rounded-full font-bold h-fit">Completado</span>
          </div>
        </div>
      </div>

      <div v-show="currentTab === 'map'" class="h-full relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
        <div ref="mapContainer" class="w-full h-full"></div>
      </div>

    </div>
  </div>
</template>