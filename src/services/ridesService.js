import db from "../firebase/firestore";
import realtime from "../firebase/realtime";
import auth from "../firebase/auth"; // Importamos auth para saber quién pide el viaje
import {
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
  doc,
  getDocs,
  query,
  where
} from "firebase/firestore";
import { ref as dbRef, get } from "firebase/database";
import { getDistance } from "geolib";

export const createRide = async (origin, destination, type = 'viaje', details = '') => {
  try {
    const snapshot = await get(dbRef(realtime, "drivers_online"));
    const drivers = snapshot.val();

    if (!drivers) {
      throw new Error("No hay conductores conectados en este momento.");
    }

    // Obtener conductores ocupados
    const activeRidesSnap = await getDocs(query(collection(db, "rides"), where("status", "in", ["searching", "accepted", "arrived", "started"])));
    const busyDrivers = new Set();
    activeRidesSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      // Solo el chofer actualmente asignado a un viaje activo está ocupado
      if (data.driverId) busyDrivers.add(data.driverId);
    });

    const nearbyDrivers = [];

    Object.keys(drivers).forEach((uid) => {
      const driver = drivers[uid];
      if (!driver.online || busyDrivers.has(uid)) return; // <-- Filtramos a los ocupados

      // Para 'compra', medimos la distancia desde el destino (porque el origen no importa/es donde el chofer está)
      const referenceLocation = (type === 'compra') ? destination : origin;
      
      const distance = getDistance(
        { latitude: referenceLocation.lat, longitude: referenceLocation.lng },
        { latitude: driver.lat, longitude: driver.lng }
      );

      // Opcional: Filtrar para que solo entren conductores a menos de 10km (10000 metros)
      if (distance <= 10000) {
        nearbyDrivers.push({ uid, distance });
      }
    });

    // Ordenar del más cercano al más lejano
    nearbyDrivers.sort((a, b) => a.distance - b.distance);

    if (nearbyDrivers.length === 0) {
      throw new Error("No hay conductores cercanos disponibles.");
    }

    // Datos del cliente actual
    const currentUser = auth.currentUser;
    const clientName = currentUser?.displayName || "Cliente Pasajero";
    const clientId = currentUser?.uid || "anon_client";

    const rideData = {
      status: "searching",
      clientId,
      clientName,
      type,
      details,
      origin: origin || null, // Puede ser null en caso de compra
      destination,
      candidateDrivers: nearbyDrivers.map(d => d.uid),
      rejectedDrivers: [],
      currentDriverIndex: 0,
      driverId: nearbyDrivers[0].uid, // Se le asigna al primero
      createdAt: serverTimestamp(),
    };

    const rideRef = await addDoc(collection(db, "rides"), rideData);

    return {
      id: rideRef.id,
      driverId: nearbyDrivers[0].uid,
      ...rideData
    };
  } catch (error) {
    console.error("Error en createRide:", error);
    throw error; // Lanzamos el error para que ClientView use toast.error()
  }
};

export const moveToNextDriver = async (ride) => {
  try {
    const nextIndex = ride.currentDriverIndex + 1;

    // Si ya le preguntamos a todos los conductores candidatos
    if (nextIndex >= ride.candidateDrivers.length) {
      await updateDoc(doc(db, "rides", ride.id), {
        status: "cancelled",
        driverId: null,
        updatedAt: serverTimestamp()
      });
      return;
    }

    // Pasar al siguiente conductor
    await updateDoc(doc(db, "rides", ride.id), {
      currentDriverIndex: nextIndex,
      driverId: ride.candidateDrivers[nextIndex],
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error al mover al siguiente conductor:", error);
  }
};