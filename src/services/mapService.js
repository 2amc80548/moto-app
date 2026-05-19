const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export const getRoute = async (origin, destination) => {
  if (!origin || !destination) return null;

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/` +
    `${origin.lng},${origin.lat};` +
    `${destination.lng},${destination.lat}` +
    `?geometries=geojson` +
    `&overview=full` +
    `&steps=true` +
    `&access_token=${MAPBOX_TOKEN}`;

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Fallo al consultar Mapbox Directions");

    const data = await response.json();
    
    if (!data.routes || data.routes.length === 0) {
      throw new Error("No se encontró una ruta posible entre los puntos");
    }

    const route = data.routes[0];

    return {
      geometry: route.geometry,
      distance: (route.distance / 1000).toFixed(1), // km
      duration: Math.ceil(route.duration / 60),     // minutos
    };
  } catch (error) {
    console.error("Error en el servicio de mapas:", error);
    return {
      geometry: null,
      distance: "0",
      duration: 0
    };
  }
};