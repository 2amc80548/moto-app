<script setup>
import { onMounted, ref, computed, watch } from "vue";
import { getRoute } from "../../services/mapService";
import mapboxgl from "mapbox-gl";
import { logoutUser } from "../../services/authService";
import { ref as dbRef, onValue } from "firebase/database";
import { collection, onSnapshot, updateDoc, doc, setDoc, serverTimestamp, deleteDoc } from "firebase/firestore";
import { toast } from "vue-sonner";
import { LayoutDashboard, Users, Car, Map, History, LogOut, Sun, Moon, Ban, CheckCircle, Trash2, Menu, Edit, X } from "lucide-vue-next";
import { useRouter } from "vue-router";
import { useThemeStore } from "../../stores/themeStore";

import realtime from "../../firebase/realtime";
import db from "../../firebase/firestore";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;
const router = useRouter();
const themeStore = useThemeStore();

const currentTab = ref("dashboard");
const isDark = computed(() => themeStore.isDark);
const sidebarOpen = ref(true);

const mapContainer = ref(null);
let map = null;
const mapMarkers = ref({});

const rides = ref([]);
const driversDB = ref({});
const usersList = ref([]);

// Edición
const editModalOpen = ref(false);
const editForm = ref({});

onMounted(() => {
  listenRealtimeDrivers();
  listenFirestoreRides();
  listenFirestoreUsers();
});

const toggleTheme = () => { themeStore.toggleTheme(); };
const handleLogout = async () => { await logoutUser(); router.push("/"); };

const initMap = () => {
  setTimeout(() => {
    if (!mapContainer.value) return;
    if (map) { map.remove(); }
    map = new mapboxgl.Map({
      container: mapContainer.value,
      style: themeStore.isDark ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/streets-v12",
      center: [-63.18, -17.78], zoom: 13,
    });
    renderMapActiveRides();
  }, 100);
};

const listenRealtimeDrivers = () => {
  onValue(dbRef(realtime, "drivers_online"), (snapshot) => {
    driversDB.value = snapshot.val() || {};
    if (currentTab.value === 'map' && map) renderMapActiveRides();
  });
};

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

const onlineDriversList = computed(() => {
  return Object.keys(driversDB.value).map(uid => {
    const driver = driversDB.value[uid];
    const profile = driversList.value.find(d => d.id === uid);
    const activeRide = rides.value.find(r => r.driverId === uid && ['accepted', 'started', 'arrived'].includes(r.status));
    return {
      uid,
      name: profile?.name || 'Chofer',
      lat: driver.lat,
      lng: driver.lng,
      online: driver.online,
      isBusy: !!activeRide
    };
  }).filter(d => d.online);
});

const stats = computed(() => {
  const onlineCount = onlineDriversList.value.length;
  const busyCount = onlineDriversList.value.filter(d => d.isBusy).length;
  return {
    online: onlineCount, busy: busyCount, available: Math.max(0, onlineCount - busyCount),
    completed: rides.value.filter(r => r.status === 'completed').length,
    clients: clientsList.value.length,
    totalDrivers: driversList.value.length
  };
});

const renderMapActiveRides = () => {
  if (!map) return;
  
  // Limpiar marcadores obsoletos
  Object.keys(mapMarkers.value).forEach(uid => {
    if (!driversDB.value[uid]?.online) {
      mapMarkers.value[uid].remove();
      delete mapMarkers.value[uid];
    }
  });

  onlineDriversList.value.forEach(driver => {
    const color = driver.isBusy ? '#eab308' : '#3b82f6'; // Amarillo ocupado, Azul libre
    if (mapMarkers.value[driver.uid]) {
      mapMarkers.value[driver.uid].setLngLat([driver.lng, driver.lat]);
      mapMarkers.value[driver.uid].getElement().style.backgroundColor = color;
    } else {
      const el = document.createElement('div'); 
      el.className = 'w-5 h-5 rounded-full border-2 border-white shadow-lg transition-transform duration-1000 ease-linear';
      el.style.backgroundColor = color;
      mapMarkers.value[driver.uid] = new mapboxgl.Marker(el).setLngLat([driver.lng, driver.lat]).addTo(map);
    }
  });
};

const centerOnDriver = (driver) => {
  if (map) {
    map.flyTo({ center: [driver.lng, driver.lat], zoom: 16, essential: true });
  }
};

// GESTIÓN
const toggleBlockUser = async (user) => {
  const newStatus = user.status === 'blocked' ? 'active' : 'blocked';
  await updateDoc(doc(db, "users", user.id), { status: newStatus });
  toast.success(`Usuario ${newStatus === 'blocked' ? 'Bloqueado' : 'Desbloqueado'}`);
};

const toggleApproval = async (driver) => {
  await updateDoc(doc(db, "users", driver.id), { isApproved: !driver.isApproved });
  toast.success(`Chofer ${!driver.isApproved ? 'Habilitado' : 'Deshabilitado'}`);
};

const deleteUser = async (id) => {
  if(confirm("¿Eliminar permanentemente este usuario? Esto no se puede deshacer.")) {
    await deleteDoc(doc(db, "users", id));
    toast.success("Usuario eliminado");
  }
};

const openEditModal = (user) => {
  editForm.value = { ...user };
  editModalOpen.value = true;
};

const saveEdit = async () => {
  if (!editForm.value.id) return;
  await updateDoc(doc(db, "users", editForm.value.id), {
    name: editForm.value.name || "",
    phone: editForm.value.phone || "",
    dni: editForm.value.dni || "",
    plate: editForm.value.plate || ""
  });
  toast.success("Datos actualizados");
  editModalOpen.value = false;
};

const getAvatar = (name, color='3b82f6') => `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=${color}&color=fff&size=128`;
</script>

<template>
  <div :class="{ 'dark': isDark }" class="h-screen flex bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors">
    
    <!-- Sidebar -->
    <aside :class="sidebarOpen ? 'w-64' : 'w-20'" class="bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-all duration-300 z-20 hidden md:flex">
      <div class="h-20 flex items-center justify-center border-b border-slate-100 dark:border-slate-800">
        <div class="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/30 shrink-0">
          M
        </div>
        <h2 v-if="sidebarOpen" class="ml-3 font-black text-xl tracking-tight">MotoYa</h2>
      </div>

      <nav class="flex-1 py-6 px-3 space-y-2">
        <button @click="currentTab = 'dashboard'" :class="currentTab === 'dashboard' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500'" class="w-full flex items-center p-3 rounded-xl transition font-medium">
          <LayoutDashboard :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Dashboard</span>
        </button>
        <button @click="currentTab = 'drivers'" :class="currentTab === 'drivers' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500'" class="w-full flex items-center p-3 rounded-xl transition font-medium">
          <Car :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Choferes</span>
        </button>
        <button @click="currentTab = 'clients'" :class="currentTab === 'clients' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500'" class="w-full flex items-center p-3 rounded-xl transition font-medium">
          <Users :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Clientes</span>
        </button>
        <button @click="currentTab = 'history'" :class="currentTab === 'history' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500'" class="w-full flex items-center p-3 rounded-xl transition font-medium">
          <History :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Historial</span>
        </button>
        <button @click="currentTab = 'map'; initMap()" :class="currentTab === 'map' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500'" class="w-full flex items-center p-3 rounded-xl transition font-medium">
          <Map :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Mapa en Vivo</span>
        </button>
      </nav>

      <div class="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
         <button @click="toggleTheme" class="w-full flex items-center p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-500 transition font-medium">
          <Sun v-if="isDark" :size="20" class="shrink-0 text-yellow-400" />
          <Moon v-else :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Tema {{ isDark ? 'Claro' : 'Oscuro' }}</span>
        </button>
        <button @click="handleLogout" class="w-full flex items-center p-3 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-500 transition font-medium">
          <LogOut :size="20" class="shrink-0" />
          <span v-if="sidebarOpen" class="ml-3">Cerrar Sesión</span>
        </button>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="flex-1 flex flex-col h-full overflow-hidden relative">
      <!-- Mobile Header -->
      <header class="md:hidden bg-white dark:bg-slate-950 h-16 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center px-4">
        <h1 class="font-black text-xl text-blue-600">MotoYa Admin</h1>
        <div class="flex gap-2">
           <button @click="toggleTheme" class="p-2 text-slate-500"><Sun v-if="isDark" :size="20"/><Moon v-else :size="20"/></button>
           <button @click="handleLogout" class="p-2 text-rose-500"><LogOut :size="20"/></button>
        </div>
      </header>

      <!-- Mobile Tabs -->
      <nav class="md:hidden flex overflow-x-auto bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 p-2 hide-scrollbar">
         <button v-for="(label, key) in {dashboard: 'Dash', drivers: 'Choferes', clients: 'Clientes', history: 'Historial', map: 'Mapa'}" :key="key"
                  @click="currentTab = key; if(key==='map') initMap()"
                  :class="currentTab === key ? 'bg-blue-600 text-white font-bold' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'"
                  class="px-4 py-2 rounded-lg text-xs shrink-0 mr-2">{{ label }}</button>
      </nav>

      <div class="flex-1 overflow-y-auto p-4 md:p-8">
        
        <!-- DASHBOARD -->
        <div v-if="currentTab === 'dashboard'" class="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 class="text-2xl font-black mb-1">Dashboard</h1>
            <p class="text-slate-500 text-sm">Resumen de la plataforma en tiempo real</p>
          </div>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition">
              <Car class="text-blue-500 mb-4" :size="32"/>
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Motos Online</p>
              <p class="text-4xl font-black mt-1">{{ stats.online }}</p>
            </div>
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition">
              <CheckCircle class="text-emerald-500 mb-4" :size="32"/>
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Disponibles</p>
              <p class="text-4xl font-black mt-1 text-emerald-600 dark:text-emerald-400">{{ stats.available }}</p>
            </div>
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition">
              <Map class="text-amber-500 mb-4" :size="32"/>
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">En Viaje</p>
              <p class="text-4xl font-black mt-1 text-amber-600 dark:text-amber-400">{{ stats.busy }}</p>
            </div>
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition">
              <Users class="text-purple-500 mb-4" :size="32"/>
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Clientes Totales</p>
              <p class="text-4xl font-black mt-1">{{ stats.clients }}</p>
            </div>
            <div class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl shadow-sm hover:shadow-md transition">
              <Users class="text-indigo-500 mb-4" :size="32"/>
              <p class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Choferes Totales</p>
              <p class="text-4xl font-black mt-1">{{ stats.totalDrivers }}</p>
            </div>
          </div>
        </div>

        <!-- DRIVERS -->
        <div v-if="currentTab === 'drivers'" class="max-w-6xl mx-auto space-y-4">
           <div>
            <h1 class="text-2xl font-black mb-1">Gestión de Choferes</h1>
          </div>
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-sm min-w-[600px]">
              <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr><th class="p-4">Chofer</th><th class="p-4">Contacto</th><th class="p-4">Vehículo / Docs</th><th class="p-4 text-center">Habilitado</th><th class="p-4 text-right">Acciones</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                <tr v-for="driver in driversList" :key="driver.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td class="p-4 flex items-center gap-3">
                    <img :src="getAvatar(driver.name, '10b981')" class="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600" />
                    <div><p class="font-bold">{{ driver.name }}</p></div>
                  </td>
                  <td class="p-4 text-xs"><p class="font-medium">{{ driver.phone || 'Sin número' }}</p><p class="text-slate-500">{{ driver.email }}</p></td>
                  <td class="p-4 text-xs"><p>Placa: <span class="font-bold">{{ driver.plate || 'N/A' }}</span></p><p>DNI: <span class="font-bold">{{ driver.dni || 'N/A' }}</span></p></td>
                  <td class="p-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" :checked="driver.isApproved" @change="toggleApproval(driver)" class="sr-only peer">
                      <div class="w-11 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </td>
                  <td class="p-4 text-right">
                    <button @click="openEditModal(driver)" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Editar"><Edit :size="18"/></button>
                    <button @click="deleteUser(driver.id)" class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition"><Trash2 :size="18"/></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- CLIENTS -->
        <div v-if="currentTab === 'clients'" class="max-w-6xl mx-auto space-y-4">
           <div>
            <h1 class="text-2xl font-black mb-1">Gestión de Clientes</h1>
          </div>
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-x-auto shadow-sm">
            <table class="w-full text-left text-sm min-w-[600px]">
              <thead class="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <tr><th class="p-4">Cliente</th><th class="p-4">Contacto</th><th class="p-4 text-center">Activo</th><th class="p-4 text-right">Acciones</th></tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                <tr v-for="client in clientsList" :key="client.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td class="p-4 flex items-center gap-3">
                    <img :src="getAvatar(client.name, '3b82f6')" class="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-600" />
                    <div><p class="font-bold">{{ client.name }}</p></div>
                  </td>
                  <td class="p-4 text-xs"><p class="font-medium">{{ client.phone || 'Sin número' }}</p><p class="text-slate-500">{{ client.email }}</p></td>
                  <td class="p-4 text-center">
                    <label class="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" :checked="client.status !== 'blocked'" @change="toggleBlockUser(client)" class="sr-only peer">
                      <div class="w-11 h-6 bg-rose-500 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </td>
                  <td class="p-4 text-right">
                    <button @click="openEditModal(client)" class="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition" title="Editar"><Edit :size="18"/></button>
                    <button @click="deleteUser(client.id)" class="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition ml-1"><Trash2 :size="18"/></button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- HISTORY -->
        <div v-if="currentTab === 'history'" class="max-w-6xl mx-auto space-y-4">
           <div>
            <h1 class="text-2xl font-black mb-1">Historial de Viajes</h1>
          </div>
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-2 shadow-sm">
            <div v-for="ride in completedRides" :key="ride.id" class="p-4 border-b border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-4 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition">
              <div class="flex items-center gap-4">
                 <div class="w-12 h-12 bg-slate-100 dark:bg-slate-900 rounded-xl flex items-center justify-center">
                   <History class="text-slate-400" :size="24"/>
                 </div>
                 <div>
                   <p class="font-bold text-sm flex items-center flex-wrap gap-2">
                     <span class="text-slate-500 text-xs">El cliente</span>
                     <span class="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded text-xs">{{ ride.clientName || 'Cliente' }}</span>
                     <span class="text-slate-500 text-xs">fue llevado por el chofer</span>
                     <span class="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded text-xs">{{ driversList.find(d => d.id === ride.driverId)?.name || ride.driverId.slice(0,6) }}</span>
                   </p>
                   <p class="text-xs text-slate-500 mt-2 font-medium">{{ new Date(ride.createdAt?.toDate()).toLocaleString() }}</p>
                 </div>
              </div>
              <span class="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs px-3 py-1.5 rounded-lg font-bold h-fit border border-purple-200 dark:border-purple-800 shadow-sm flex items-center gap-1 w-fit">
                <CheckCircle :size="14"/> Completado
              </span>
            </div>
            <div v-if="completedRides.length === 0" class="p-8 text-center text-slate-500">
               No hay viajes completados aún.
            </div>
          </div>
        </div>

        <!-- MAPA VIVO CON SIDEBAR -->
        <div v-show="currentTab === 'map'" class="h-[calc(100vh-120px)] flex flex-col md:flex-row rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-900">
           
           <!-- Lista lateral de choferes -->
           <div class="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 overflow-y-auto flex flex-col">
             <div class="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
               <h2 class="font-black text-sm">Choferes Online ({{ onlineDriversList.length }})</h2>
             </div>
             <div class="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
               <button v-for="driver in onlineDriversList" :key="driver.uid" @click="centerOnDriver(driver)" class="w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-between group">
                 <div class="flex items-center gap-3">
                   <div class="relative">
                     <img :src="getAvatar(driver.name, '10b981')" class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700" />
                     <div class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900" :class="driver.isBusy ? 'bg-yellow-500' : 'bg-blue-500'"></div>
                   </div>
                   <div>
                     <p class="font-bold text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{{ driver.name }}</p>
                     <p class="text-xs text-slate-500">{{ driver.isBusy ? 'En Viaje' : 'Disponible' }}</p>
                   </div>
                 </div>
               </button>
               <div v-if="onlineDriversList.length === 0" class="p-6 text-center text-xs text-slate-500">
                 Nadie conectado
               </div>
             </div>
           </div>

           <!-- Mapa -->
           <div class="flex-1 relative">
             <div class="absolute top-4 right-4 z-10 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-4 py-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 pointer-events-none">
               <div class="flex gap-4 text-xs font-bold">
                 <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-blue-500"></div> Disponible</span>
                 <span class="flex items-center gap-1"><div class="w-2 h-2 rounded-full bg-yellow-500"></div> En Viaje</span>
               </div>
             </div>
            <div ref="mapContainer" class="w-full h-full"></div>
           </div>
        </div>

      </div>
    </main>

    <!-- Modal de Edición -->
    <div v-if="editModalOpen" class="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div class="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
        <button @click="editModalOpen = false" class="absolute top-6 right-6 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X :size="24"/></button>
        <h2 class="text-xl font-bold mb-6">Editar Usuario</h2>
        
        <div class="space-y-4">
          <div>
            <label class="text-xs font-bold text-slate-500 ml-1">Nombre Completo</label>
            <input v-model="editForm.name" type="text" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl mt-1 outline-none focus:ring-2 ring-blue-500">
          </div>
          <div>
            <label class="text-xs font-bold text-slate-500 ml-1">Teléfono</label>
            <input v-model="editForm.phone" type="text" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl mt-1 outline-none focus:ring-2 ring-blue-500">
          </div>
          
          <!-- Si es chofer mostrar estos también -->
          <template v-if="editForm.role === 'driver'">
            <div>
              <label class="text-xs font-bold text-slate-500 ml-1">N° Carnet (DNI)</label>
              <input v-model="editForm.dni" type="text" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl mt-1 outline-none focus:ring-2 ring-blue-500">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-500 ml-1">Placa Vehículo</label>
              <input v-model="editForm.plate" type="text" class="w-full p-3 bg-slate-50 dark:bg-slate-700 rounded-xl mt-1 outline-none focus:ring-2 ring-blue-500">
            </div>
          </template>

          <button @click="saveEdit" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl mt-4 transition">Guardar Cambios</button>
        </div>
      </div>
    </div>

  </div>
</template>