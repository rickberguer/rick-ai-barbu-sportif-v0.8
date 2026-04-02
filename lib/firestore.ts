import { db } from "./firebase";
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, orderBy, serverTimestamp, deleteField } from "firebase/firestore";
import type { ChatItem } from "@/components/gemini-sidebar";
import type { ChatMessage } from "@/components/chat-area";

/** Helper: strip undefined values from an object before sending to Firestore */
function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
}

// 1. Guarda o actualiza la metadata del chat (para que aparezca en el menú lateral)
export async function saveChatMetadata(userId: string, chatId: string, title: string, isFavorite = false) {
  const chatRef = doc(db, `users/${userId}/chats/${chatId}`);
  await setDoc(chatRef, {
    title,
    isFavorite,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// 2. Guarda un mensaje individual dentro de una conversación (Protegido contra 'undefined')
export async function saveChatMessage(userId: string, chatId: string, message: ChatMessage) {
  const msgRef = doc(db, `users/${userId}/chats/${chatId}/messages/${message.id}`);

  // FIREBASE HACK: Limpiamos el objeto de cualquier valor 'undefined' para evitar que Firestore colapse
  const cleanMessage = Object.fromEntries(
    Object.entries(message).filter(([_, v]) => v !== undefined)
  );

  await setDoc(msgRef, {
    ...cleanMessage,
    createdAt: serverTimestamp()
  });
}

// 3. Obtiene la lista de chats para el menú lateral
export async function getUserChats(userId: string): Promise<ChatItem[]> {
  const chatsRef = collection(db, `users/${userId}/chats`);
  const q = query(chatsRef, orderBy("updatedAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    title: doc.data().title || "Conversación sin título",
    isFavorite: doc.data().isFavorite || false
  }));
}

// 4. Obtiene todos los mensajes de un chat específico
export async function getChatMessages(userId: string, chatId: string): Promise<ChatMessage[]> {
  const msgsRef = collection(db, `users/${userId}/chats/${chatId}/messages`);
  const q = query(msgsRef, orderBy("createdAt", "asc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      role: data.role,
      content: data.content,
      attachments: data.attachments || undefined
    } as ChatMessage;
  });
}

// 5. Elimina un chat individual y todos sus mensajes
export async function deleteChatFromFirestore(userId: string, chatId: string) {
  // Primero borrar todos los mensajes del chat
  const msgsRef = collection(db, `users/${userId}/chats/${chatId}/messages`);
  const msgsSnapshot = await getDocs(msgsRef);
  const deletePromises = msgsSnapshot.docs.map(d => deleteDoc(d.ref));
  await Promise.all(deletePromises);
  // Luego borrar el documento del chat
  await deleteDoc(doc(db, `users/${userId}/chats/${chatId}`));
}

// 6. Elimina todos los chats de un usuario
export async function deleteAllChatsFromFirestore(userId: string) {
  const chatsRef = collection(db, `users/${userId}/chats`);
  const chatsSnapshot = await getDocs(chatsRef);
  for (const chatDoc of chatsSnapshot.docs) {
    const msgsRef = collection(db, `users/${userId}/chats/${chatDoc.id}/messages`);
    const msgsSnapshot = await getDocs(msgsRef);
    const deletePromises = msgsSnapshot.docs.map(d => deleteDoc(d.ref));
    await Promise.all(deletePromises);
    await deleteDoc(chatDoc.ref);
  }
}

// 7. Renombrar un chat
export async function renameChatInFirestore(userId: string, chatId: string, newTitle: string) {
  const chatRef = doc(db, `users/${userId}/chats/${chatId}`);
  await setDoc(chatRef, { title: newTitle, updatedAt: serverTimestamp() }, { merge: true });
}

// 8. Marcar/desmarcar un chat como favorito
export async function toggleChatFavoriteStatus(userId: string, chatId: string, isFavorite: boolean) {
  const chatRef = doc(db, `users/${userId}/chats/${chatId}`);
  await setDoc(chatRef, { isFavorite, updatedAt: serverTimestamp() }, { merge: true });
}

// --- Funciones de archivos independientes (explorador "Mis archivos") ---

export interface ExplorerFile {
  id: string
  name: string
  mimeType: string
  url: string
  size?: number
  folderId?: string
  createdAt?: unknown
}

export interface ExplorerFolder {
  id: string
  name: string
  parentId?: string
  createdAt?: unknown
}

// 8. Guardar un archivo en el explorador del usuario (independiente de chats)
export async function saveExplorerFile(userId: string, file: Omit<ExplorerFile, "id">) {
  const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileRef = doc(db, `users/${userId}/explorerFiles/${fileId}`);
  await setDoc(fileRef, cleanData({ ...file, createdAt: serverTimestamp() }));
  return fileId;
}

// 9. Obtener archivos del explorador
export async function getExplorerFiles(userId: string): Promise<ExplorerFile[]> {
  const filesRef = collection(db, `users/${userId}/explorerFiles`);
  const q = query(filesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExplorerFile));
}

// 10. Eliminar un archivo del explorador
export async function deleteExplorerFile(userId: string, fileId: string) {
  await deleteDoc(doc(db, `users/${userId}/explorerFiles/${fileId}`));
}

// 11. Crear una carpeta en el explorador
export async function createExplorerFolder(userId: string, name: string, parentId?: string) {
  const folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const folderRef = doc(db, `users/${userId}/explorerFolders/${folderId}`);
  await setDoc(folderRef, cleanData({ name, parentId, createdAt: serverTimestamp() }));
  return folderId;
}

// 12. Obtener carpetas del explorador
export async function getExplorerFolders(userId: string): Promise<ExplorerFolder[]> {
  const foldersRef = collection(db, `users/${userId}/explorerFolders`);
  const q = query(foldersRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ExplorerFolder));
}

// 13. Obtener los archivos vinculados a un chat específico (para mantener/eliminar)
export async function getChatFileUrls(userId: string, chatId: string): Promise<string[]> {
  const msgsRef = collection(db, `users/${userId}/chats/${chatId}/messages`);
  const snapshot = await getDocs(msgsRef);
  const urls: string[] = [];
  for (const d of snapshot.docs) {
    const data = d.data();
    if (data.attachments && Array.isArray(data.attachments)) {
      for (const att of data.attachments) {
        if (att.data && typeof att.data === "string" && att.data.startsWith("http")) {
          urls.push(att.data);
        }
      }
    }
  }
  return urls;
}



// 14. Renombrar un archivo del explorador (solo Firestore, Storage intacto)
export async function renameExplorerFile(userId: string, fileId: string, newName: string) {
  const fileRef = doc(db, `users/${userId}/explorerFiles/${fileId}`);
  await setDoc(fileRef, cleanData({ name: newName }), { merge: true });
}

// 15. Mover un archivo a otra carpeta (solo Firestore, Storage intacto)
export async function moveExplorerFile(userId: string, fileId: string, newFolderId: string | null) {
  const fileRef = doc(db, `users/${userId}/explorerFiles/${fileId}`);
  if (newFolderId) {
    await setDoc(fileRef, { folderId: newFolderId }, { merge: true });
  } else {
    // Mover a raiz: eliminar el campo folderId del documento
    await setDoc(fileRef, { folderId: deleteField() }, { merge: true });
  }
}

// 16. Renombrar una carpeta (solo Firestore)
export async function renameExplorerFolder(userId: string, folderId: string, newName: string) {
  const folderRef = doc(db, `users/${userId}/explorerFolders/${folderId}`);
  await setDoc(folderRef, cleanData({ name: newName }), { merge: true });
}

// 17. Eliminar una carpeta y todos sus archivos
export async function deleteExplorerFolder(userId: string, folderId: string) {
  // Delete files inside the folder
  const filesRef = collection(db, `users/${userId}/explorerFiles`);
  const snapshot = await getDocs(filesRef);
  for (const d of snapshot.docs) {
    if (d.data().folderId === folderId) {
      await deleteDoc(d.ref);
    }
  }
  // Delete sub-folders
  const foldersRef = collection(db, `users/${userId}/explorerFolders`);
  const foldersSnapshot = await getDocs(foldersRef);
  for (const d of foldersSnapshot.docs) {
    if (d.data().parentId === folderId) {
      await deleteExplorerFolder(userId, d.id); // recursive
    }
  }
  // Delete the folder itself
  await deleteDoc(doc(db, `users/${userId}/explorerFolders/${folderId}`));
}

// --- NUEVAS FUNCIONES PARA EL EXPLORADOR DE ARCHIVOS GLOBAL ---

export async function saveGlobalFileRecord(userId: string, fileRecord: Record<string, unknown>) {
  const newFileRef = doc(collection(db, `users/${userId}/files`));
  await setDoc(newFileRef, cleanData({
    ...fileRecord,
    id: newFileRef.id,
    createdAt: serverTimestamp()
  }));
  return newFileRef.id;
}

export async function getUserGlobalFiles(userId: string) {
  const filesRef = collection(db, `users/${userId}/files`);
  const q = query(filesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => doc.data());
}

export async function deleteGlobalFileRecord(userId: string, fileId: string) {
  const fileRef = doc(db, `users/${userId}/files/${fileId}`);
  await deleteDoc(fileRef);
}

// 18. Grupos personalizados del panel financiero
export async function getFinancialCustomGroups(userId: string) {
  const docRef = doc(db, `users/${userId}/settings/financialGroups`);
  const snapshot = await getDoc(docRef);
  if (snapshot.exists()) {
    return snapshot.data().groups || [];
  }
  return [];
}

export async function saveFinancialCustomGroups(userId: string, groups: any[]) {
  const docRef = doc(db, `users/${userId}/settings/financialGroups`);
  await setDoc(docRef, { groups, updatedAt: serverTimestamp() }, { merge: true });
}
