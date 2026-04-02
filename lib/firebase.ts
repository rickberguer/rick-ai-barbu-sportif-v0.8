import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { isSupported, getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyDmjc2qu2vhSKLVgrQTZZ4u6tOZSB41yI4",
  authDomain: "barbu-sportif-ai-center.firebaseapp.com",
  projectId: "barbu-sportif-ai-center",
  storageBucket: "barbu-sportif-ai-center.firebasestorage.app",
  messagingSenderId: "497745856294",
  appId: "1:497745856294:web:e0076b11a0a847d582e3e7",
  measurementId: "G-N6NG6CKFXH"
};

// Evitar inicializar la app múltiples veces (vital en Next.js)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Inicializamos los servicios de Auth y Base de Datos
const auth = getAuth(app);
const db = getFirestore(app, "barbuaidb");

// Inicializamos Analytics solo del lado del cliente para no romper el servidor
let analytics;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  });
}

const storage = getStorage(app);

export { app, auth, db, analytics, storage };