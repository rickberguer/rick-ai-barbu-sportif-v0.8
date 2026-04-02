import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getFirebaseAdminApp() {
  if (!getApps().length) {
    return initializeApp({
      projectId: 'barbu-sportif-ai-center',
    });
  }
  return getApps()[0];
}

// Exportamos Auth para verificar tokens
export const auth = getAuth(getFirebaseAdminApp());

// Exportamos una FUNCIÓN para la BD, así no se ejecuta durante el build de Docker
export const getAdminDb = () => getFirestore(getFirebaseAdminApp(), 'barbuaidb');