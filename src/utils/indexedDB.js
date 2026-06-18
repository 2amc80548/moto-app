export const initLocalDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("motocab", 1);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("driver_photos")) {
        db.createObjectStore("driver_photos", { keyPath: "uid" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

export const saveLocalPhoto = async (uid, base64Photo) => {
  try {
    const db = await initLocalDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("driver_photos", "readwrite");
      const store = transaction.objectStore("driver_photos");
      const request = store.put({ uid, photo: base64Photo, updatedAt: Date.now() });
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("Error saving local photo:", error);
    return false;
  }
};

export const getLocalPhoto = async (uid) => {
  try {
    const db = await initLocalDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("driver_photos", "readonly");
      const store = transaction.objectStore("driver_photos");
      const request = store.get(uid);
      request.onsuccess = (e) => resolve(e.target.result?.photo || null);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (error) {
    console.error("Error getting local photo:", error);
    return null;
  }
};
