import { storage } from "./firebase";
import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";

export async function uploadFileToStorage(userId: string, chatId: string, file: { name: string, data: string, mimeType: string }) {
  const uniqueName = `${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
  const fullPath = `users/${userId}/chats/${chatId}/${uniqueName}`;
  const storageRef = ref(storage, fullPath);

  await uploadString(storageRef, file.data, 'base64', { contentType: file.mimeType });
  const downloadUrl = await getDownloadURL(storageRef);

  // ¡NUEVO! Regresamos también el fullPath para saber qué archivo borrar después
  return { url: downloadUrl, fullPath };
}

// Para eliminar el archivo físico de la nube
export async function deleteFileFromStorage(fullPath: string) {
  try {
    const storageRef = ref(storage, fullPath);
    await deleteObject(storageRef);
  } catch (error) {
    console.error("Error borrando archivo de Storage:", error);
  }
}


