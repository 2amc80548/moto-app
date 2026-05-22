import auth from "../firebase/auth";
import db from "../firebase/firestore";

import {
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  doc,
  getDoc
} from "firebase/firestore";

import { useAuthStore }
  from "../stores/authStore";

export const initAuth = () => {

  const authStore = useAuthStore();

  onAuthStateChanged(
    auth,
    async (user) => {

      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          authStore.setUser(user);
          authStore.setUserData(userData);
          authStore.setRole(userData.role);
        } else {
          authStore.logout();
        }
      } else {
        authStore.logout();
      }

      authStore.setLoading(false);
    }
  );
};

export const logoutUser = async () => {

  await signOut(auth);
};