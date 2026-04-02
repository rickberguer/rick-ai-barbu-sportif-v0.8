"use client"
export const dynamic = "force-dynamic";

import { uploadFileToStorage, deleteFileFromStorage } from "@/lib/storage";
import { useState, useCallback, useEffect, useRef } from "react"
import { GeminiSidebar, type ChatItem } from "@/components/gemini-sidebar"
import { GeminiHeader } from "@/components/gemini-header"
import { ChatArea, type ChatMessage, type ChatAttachment } from "@/components/chat-area"
import { ChatInputBar, type ToolMode } from "@/components/chat-input-bar"
import { MobileSidebar } from "@/components/mobile-sidebar"
import { FileExplorer, type LocalFile } from "@/components/file-explorer"
import { LoginScreen } from "@/components/login-screen"
import { DashboardTabs, type DashboardPanelType } from "@/components/dashboard-tabs"
import { PromptShortcuts } from "@/components/prompt-shortcuts"
import { FinancialPanel } from "@/components/dashboard/financial-panel"
import { TrafficPanel } from "@/components/dashboard/traffic-panel"
import { CompetitorsPanel } from "@/components/dashboard/competitors-panel"
import { AccountingPanel } from "@/components/dashboard/accounting-panel"
import { MarketingPanel } from "@/components/dashboard/marketing-panel"
import { ReportsPanel } from "@/components/dashboard/reports-panel"
import { RecommendationsPanel } from "@/components/dashboard/recommendations-panel"
import { CashReportPanel } from "@/components/dashboard/cash-report-panel"
import { VisionPanel } from "@/components/dashboard/vision-panel"
import { InventoryPanel } from "@/components/dashboard/inventory-panel"
import { useAuth } from "@/lib/auth-context"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
// --- IMPORTAMOS LAS FUNCIONES DE FIRESTORE ---
import {
  saveChatMetadata, saveChatMessage, getUserChats, getChatMessages,
  deleteChatFromFirestore, deleteAllChatsFromFirestore, renameChatInFirestore,
  toggleChatFavoriteStatus, saveGlobalFileRecord, getUserGlobalFiles, deleteGlobalFileRecord,
  createExplorerFolder, getExplorerFolders, renameExplorerFile, moveExplorerFile,
  renameExplorerFolder, deleteExplorerFolder, saveExplorerFile, getExplorerFiles,
  type ExplorerFolder,
} from "@/lib/firestore"

import { useSoundSetting } from "@/components/settings-menu"
import { Minimize2, MessageSquare, X, Maximize2, Sparkles } from "lucide-react"

export default function GeminiPage() {
  const { t, locale } = useI18n()
  const { user, loading: authLoading } = useAuth()
  const { soundEnabled } = useSoundSetting()
  const abortControllerRef = useRef<AbortController | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const lastMessageWasAudioRef = useRef(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [activePanel, setActivePanel] = useState<DashboardPanelType>('chat')

  // All conversations keyed by chat ID
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({})
  // Ordered list of chats for the sidebar (newest first)
  const [chatHistory, setChatHistory] = useState<ChatItem[]>([])

  const [isLoading, setIsLoading] = useState(false)
  const [activeTool, setActiveTool] = useState<ToolMode>(null)
  const [modelSelected, setModelSelected] = useState<"rapido" | "pro">("rapido")
  const [showFileExplorer, setShowFileExplorer] = useState(false)
  const [allLocalFiles, setAllLocalFiles] = useState<LocalFile[]>([])
  const [explorerFolders, setExplorerFolders] = useState<ExplorerFolder[]>([])
  const [isChatMinimized, setIsChatMinimized] = useState(false)
  const [panelNotifications, setPanelNotifications] = useState<Record<string, boolean>>({})

  const clearNotification = useCallback((panelId: string) => {
    setPanelNotifications(prev => ({ ...prev, [panelId]: false }));
  }, []);

  // Auto-minimize chat when switching to a dashboard, and restore when back to chat panel
  useEffect(() => {
    if (activePanel !== 'chat') {
      setIsChatMinimized(true)
      setSidebarOpen(false)
    } else {
      setIsChatMinimized(false)
      setSidebarOpen(true)
    }
  }, [activePanel])

  // --- EFECTOS PARA CARGAR DATOS DESDE FIRESTORE ---

  // 1. Cargar el historial del menú lateral y archivos del explorador global cuando el usuario inicia sesión
  useEffect(() => {
    if (user) {
      getUserChats(user.uid).then((history) => setChatHistory(history));
      getUserGlobalFiles(user.uid).then((files) => {
        setAllLocalFiles(files as LocalFile[]);
      });
      getExplorerFolders(user.uid).then((folders) => setExplorerFolders(folders));

      getExplorerFiles(user.uid).then((files) => {
        // Merge explorer files into local files if not already present
        setAllLocalFiles((prev) => {
          const existingIds = new Set(prev.map((f) => f.id));
          const newFiles = files.filter((f) => !existingIds.has(f.id)).map((f) => ({
            id: f.id, name: f.name, mimeType: f.mimeType, data: f.url,
            previewUrl: f.url, source: "uploaded" as const, timestamp: Date.now(),
            folderId: f.folderId,
          }));
          return [...prev, ...newFiles];
        });
      });
    }
  }, [user]);

  // 2. Cargar los mensajes cuando el usuario selecciona un chat del menú lateral
  useEffect(() => {
    if (user && activeChatId && !conversations[activeChatId]) {
      getChatMessages(user.uid, activeChatId).then((msgs) => {
        setConversations((prev) => ({ ...prev, [activeChatId]: msgs }));
      });
    }
  }, [user, activeChatId, conversations]);

  // Notification sound using Web Audio API
  const playNotificationSound = useCallback(() => {
    if (!soundEnabled) return
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext()
      }
      const ctx = audioContextRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = "sine"

      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.08)
      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.25)
    } catch {
      // Silently fail if audio is unavailable
    }
  }, [soundEnabled])

  // TTS: speak AI response in the user's language when they sent audio
  const speakText = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return
    // Clean markdown from text
    const cleanText = text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .replace(/^-\s*/gm, "")
      .trim()
    if (!cleanText) return

    const { locale } = { locale: document.documentElement.getAttribute("lang") || "fr" }
    const langMap: Record<string, string> = {
      fr: "fr-CA",
      en: "en-CA",
      es: "es-MX",
    }
    const targetLang = langMap[locale] || "fr-CA"

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = targetLang
    utterance.rate = 1.0
    utterance.pitch = 1.0

    // Try to find a matching voice
    const voices = window.speechSynthesis.getVoices()
    const matchingVoice = voices.find((v) => v.lang === targetLang) ||
      voices.find((v) => v.lang.startsWith(locale)) ||
      voices.find((v) => v.lang.startsWith(targetLang.split("-")[0]))
    if (matchingVoice) utterance.voice = matchingVoice

    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }, [])

  // Current messages for the active chat
  const messages = activeChatId ? (conversations[activeChatId] ?? []) : []

  const handleNewChat = useCallback(() => {
    setActiveChatId(null)
  }, [])

  const handleSelectChat = useCallback((id: string) => {
    setActiveChatId(id)
  }, [])

  // --- ELIMINAR TODOS LOS CHATS ---
  const handleDeleteAllChats = useCallback(async (keepFiles?: boolean) => {
    if (user) {
      if (!keepFiles) {
        const filesToDelete = allLocalFiles.filter(f => f.storagePath && f.storagePath.includes('/chats/'));

        for (const file of filesToDelete) {
          if (file.id && file.storagePath) {
            try {
              await deleteGlobalFileRecord(user.uid, file.id);
              await deleteFileFromStorage(file.storagePath);
            } catch (e) {
              console.error("Error al borrar archivo masivo:", e);
            }
          }
        }
        setAllLocalFiles(prev => prev.filter(f => !(f.storagePath && f.storagePath.includes('/chats/'))));
      }

      await deleteAllChatsFromFirestore(user.uid);
    }

    setConversations({})
    setChatHistory([])
    setActiveChatId(null)
  }, [user, allLocalFiles])


  // --- ELIMINAR UN SOLO CHAT ---
  const handleDeleteChat = useCallback(async (chatId: string, keepFiles?: boolean) => {
    if (user) {
      if (!keepFiles) {
        const filesToDelete = allLocalFiles.filter(f => f.storagePath && f.storagePath.includes(`/chats/${chatId}/`));

        for (const file of filesToDelete) {
          if (file.id && file.storagePath) {
            try {
              await deleteGlobalFileRecord(user.uid, file.id);
              await deleteFileFromStorage(file.storagePath);
            } catch (e) {
              console.error(`Error al borrar archivo del chat ${chatId}:`, e);
            }
          }
        }
        setAllLocalFiles(prev => prev.filter(f => !(f.storagePath && f.storagePath.includes(`/chats/${chatId}/`))));
      }

      await deleteChatFromFirestore(user.uid, chatId);
    }

    setConversations((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });
    setChatHistory((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
  }, [user, activeChatId, allLocalFiles])

  const handleRenameChat = useCallback(async (chatId: string, newTitle: string) => {
    if (user) {
      await renameChatInFirestore(user.uid, chatId, newTitle);
    }
    setChatHistory((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
    );
  }, [user])

  const handleToggleFavorite = useCallback(async (chatId: string) => {
    if (!user) return;
    const chat = chatHistory.find(c => c.id === chatId);
    if (!chat) return;

    const newIsFavorite = !chat.isFavorite;
    await toggleChatFavoriteStatus(user.uid, chatId, newIsFavorite);
    setChatHistory(prev => prev.map(c => c.id === chatId ? { ...c, isFavorite: newIsFavorite } : c));
  }, [user, chatHistory]);

  // --- FUNCIÓN PARA ELIMINAR ARCHIVOS DESDE EL EXPLORADOR ---
  const handleDeleteFile = useCallback(async (fileId: string, storagePath: string) => {
    if (!user) return;

    // 1. Quitar de la pantalla
    setAllLocalFiles(prev => prev.filter(f => f.id !== fileId));

    // 2. Borrar de la base de datos global y Storage
    try {
      await deleteGlobalFileRecord(user.uid, fileId);
      if (storagePath) {
        await deleteFileFromStorage(storagePath);
      }
    } catch (e) {
      console.error("Error al borrar el archivo:", e);
    }
  }, [user]);

  // --- CREAR CARPETA ---
  const handleCreateFolder = useCallback(async (name: string, parentId?: string) => {
    if (!user) return;
    const folderId = await createExplorerFolder(user.uid, name, parentId);
    setExplorerFolders((prev) => [...prev, { id: folderId, name, parentId }]);
  }, [user]);

  // --- RENOMBRAR ARCHIVO (solo Firestore, Storage intacto) ---
  const handleRenameFile = useCallback(async (fileId: string, newName: string) => {
    if (!user) return;
    // Rename in both collections (explorerFiles for folders + files for global)
    await renameExplorerFile(user.uid, fileId, newName);
    // Also try to rename in global files collection
    try {
      const { doc: docRef, setDoc: setDocFn } = await import("firebase/firestore");
      const { db: dbRef } = await import("@/lib/firebase");
      await setDocFn(docRef(dbRef, `users/${user.uid}/files/${fileId}`), { name: newName }, { merge: true });
    } catch { /* file may not exist in global collection */ }
    setAllLocalFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, name: newName } : f));
  }, [user]);

  // --- MOVER ARCHIVO (solo Firestore, Storage intacto) ---
  const handleMoveFile = useCallback(async (fileId: string, newFolderId: string | null) => {
    if (!user) return;
    await moveExplorerFile(user.uid, fileId, newFolderId);
    // Also try to update in global files collection
    try {
      const { doc: docRef, setDoc: setDocFn, deleteField: delField } = await import("firebase/firestore");
      const { db: dbRef } = await import("@/lib/firebase");
      if (newFolderId) {
        await setDocFn(docRef(dbRef, `users/${user.uid}/files/${fileId}`), { folderId: newFolderId }, { merge: true });
      } else {
        await setDocFn(docRef(dbRef, `users/${user.uid}/files/${fileId}`), { folderId: delField() }, { merge: true });
      }
    } catch { /* file may not exist in global collection */ }
    setAllLocalFiles((prev) => prev.map((f) => f.id === fileId ? { ...f, folderId: newFolderId || undefined } : f));
  }, [user]);

  // --- RENOMBRAR CARPETA ---
  const handleRenameFolder = useCallback(async (folderId: string, newName: string) => {
    if (!user) return;
    await renameExplorerFolder(user.uid, folderId, newName);
    setExplorerFolders((prev) => prev.map((f) => f.id === folderId ? { ...f, name: newName } : f));
  }, [user]);

  // --- ELIMINAR CARPETA ---
  const handleDeleteFolder = useCallback(async (folderId: string) => {
    if (!user) return;
    // Delete files in that folder from local state
    const filesToRemove = allLocalFiles.filter((f) => f.folderId === folderId);
    for (const file of filesToRemove) {
      if (file.id && file.storagePath) {
        try { await deleteGlobalFileRecord(user.uid, file.id); await deleteFileFromStorage(file.storagePath); } catch { }
      }
    }
    setAllLocalFiles((prev) => prev.filter((f) => f.folderId !== folderId));

    await deleteExplorerFolder(user.uid, folderId);
    setExplorerFolders((prev) => prev.filter((f) => f.id !== folderId));
  }, [user, allLocalFiles]);

  // --- AGREGAR ARCHIVO A NUEVO CHAT (sin duplicar en Storage) ---
  const handleAddFileToChat = useCallback((file: LocalFile) => {
    setShowFileExplorer(false);
    const chatId = Date.now().toString();
    const chatTitle = file.name.length > 28 ? file.name.substring(0, 28) + "..." : file.name;
    setChatHistory((prev) => [{ id: chatId, title: chatTitle, isFavorite: false }, ...prev]);
    setActiveChatId(chatId);

    // Ensure the URL is correct for both data and previewUrl so native players work
    const fileUrl = file.previewUrl || file.data || "";
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: `[${file.name}]`,
      timestamp: Date.now(),
      attachments: [{
        name: file.name,
        mimeType: file.mimeType,
        data: fileUrl,
        previewUrl: fileUrl,
      }],
    };
    setConversations((prev) => ({ ...prev, [chatId]: [userMessage] }));
    if (user) {
      saveChatMetadata(user.uid, chatId, chatTitle);
      saveChatMessage(user.uid, chatId, userMessage);
    }
  }, [user]);

const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsLoading(false)
  }, [])

  // =================================================================================
  // --- SEND MESSAGE (Streaming con Buffer & Status Sync) ---
  // =================================================================================
  const handleSendMessage = useCallback(
    async (content: string, attachments?: ChatAttachment[], tool?: ToolMode, panelContext?: string) => {
      if ((!content.trim() && (!attachments || attachments.length === 0)) || isLoading) return

      let chatId = activeChatId
      let chatTitle = ""

      if (!chatId) {
        chatId = Date.now().toString()
        const titleSource = content.trim() || (attachments?.[0]?.name ?? "")
        chatTitle = titleSource.length > 28 ? titleSource.substring(0, 28) + "..." : titleSource
        setChatHistory((prev) => [{ id: chatId!, title: chatTitle }, ...prev])
        setActiveChatId(chatId)
      } else {
        chatTitle = chatHistory.find(c => c.id === chatId)?.title || "Conversación"
      }

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "user",
        content,
        attachments,
        timestamp: Date.now(),
      }

      setConversations((prev) => ({
        ...prev,
        [chatId!]: [...(prev[chatId!] ?? []), userMessage],
      }))

      if (user) {
        saveChatMetadata(user.uid, chatId!, chatTitle);
        let firestoreAttachments = attachments;

        if (attachments && attachments.length > 0) {
          firestoreAttachments = await Promise.all(attachments.map(async (att) => {
            try {
              const { url, fullPath } = await uploadFileToStorage(user.uid, chatId!, att);
              const newFileRecord = {
                name: att.name, mimeType: att.mimeType, data: url, previewUrl: url,
                storagePath: fullPath, source: "uploaded" as const, timestamp: Date.now()
              };
              const fileId = await saveGlobalFileRecord(user.uid, newFileRecord);
              setAllLocalFiles(prev => [{ ...newFileRecord, id: fileId } as LocalFile, ...prev]);
              return { name: att.name, mimeType: att.mimeType, data: url, previewUrl: url };
            } catch (e) {
              return { name: att.name, mimeType: att.mimeType, data: att.data, previewUrl: att.previewUrl };
            }
          }));
        }
        const messageToSave = { ...userMessage, attachments: firestoreAttachments };
        saveChatMessage(user.uid, chatId!, messageToSave);
      }

      lastMessageWasAudioRef.current = !!(attachments && attachments.some(a => a.mimeType.startsWith("audio/")))
      setIsLoading(true)
      if (tool) setActiveTool(null)

      try {
        // -----------------------------------------------------------
        // --- ENRUTADOR DE HERRAMIENTAS (FRONTEND) ---
        // -----------------------------------------------------------
        if (tool === 'create-images') {
          const token = user ? await user.getIdToken() : "";
          const response = await fetch('/api/tools/images', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ prompt: content }),
          });

          const assistantMsgId = (Date.now() + 1).toString();
          let finalAssistantMessage: ChatMessage;

          if (!response.ok) {
            const errorData = await response.json();
            finalAssistantMessage = {
              id: assistantMsgId,
              role: 'assistant',
              content: errorData.fallbackText || t('tools.imagesFailed'),
              timestamp: Date.now(),
            };
          } else {
            const { images } = await response.json();
            if (images && images.length > 0) {
              finalAssistantMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: t('tools.imagesGenerated'),
                timestamp: Date.now(),
                attachments: images.map((img: any) => ({
                  name: img.name,
                  mimeType: img.mimeType,
                  data: img.base64,
                  previewUrl: `data:${img.mimeType};base64,${img.base64}`,
                })),
              };
            } else {
              finalAssistantMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: t('tools.imagesFailed'),
                timestamp: Date.now(),
              };
            }
          }

          playNotificationSound();
          setConversations((prev) => ({ ...prev, [chatId!]: [...(prev[chatId!] ?? []), finalAssistantMessage] }));
          if (user) saveChatMessage(user.uid, chatId!, finalAssistantMessage);
          setIsLoading(false);
          return; // Detenemos la ejecución para no continuar al endpoint de chat
        }
        // --- FIN DEL ENRUTADOR DE HERRAMIENTAS ---

        // Obtenemos el token usando caché para no saturar la red en cada clic
        const token = user ? await user.getIdToken() : "";
        const authHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        };

        const apiPayload: any = { message: content, panelContext }
        if (attachments && attachments.length > 0) {
          apiPayload.attachments = attachments.map((att) => ({ name: att.name, mimeType: att.mimeType, data: att.data }))
        }

        const currentMsgs = conversations[chatId!] ?? []
        if (currentMsgs.length > 0) {
          apiPayload.history = currentMsgs.slice(-10).map((m) => ({ role: m.role, content: m.content }))
        }

        abortControllerRef.current = new AbortController()
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ ...apiPayload, modelSelected, locale: locale.split("-")[0] }),
          signal: abortControllerRef.current.signal,
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || "Error en la conexión con el servidor");
        }

        const assistantMsgId = (Date.now() + 1).toString()
        let assistantContent = ""
        let generatedAttachments: ChatAttachment[] | undefined = undefined;

        // Globo temporal
        setConversations((prev) => ({
          ...prev,
          [chatId!]: [...(prev[chatId!] ?? []), {
            id: assistantMsgId, role: "assistant", content: "", timestamp: Date.now(), isStreaming: true, status: "Conectando con Rick..."
          }],
        }))

        // BLINDAJE: Verificamos si el servidor nos mandó un JSON (Error interno) o un Stream (Respuesta normal)
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
          // El servidor abortó y mandó una advertencia en formato JSON puro
          const data = await response.json();
          assistantContent = data.response || data.error || "El servidor detuvo la conexión.";
          
          setConversations((prev) => {
            const msgs = [...(prev[chatId!] ?? [])]
            const idx = msgs.findIndex((m) => m.id === assistantMsgId)
            if (idx !== -1) msgs[idx] = { ...msgs[idx], content: assistantContent, status: undefined }
            return { ...prev, [chatId!]: msgs }
          })
        } else {
          // Es el Stream normal de datos NDJSON
          const reader = response.body?.getReader()
          const decoder = new TextDecoder("utf-8")
          let streamBuffer = ""

          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              streamBuffer += decoder.decode(value, { stream: true })
              const lines = streamBuffer.split("\n")
              streamBuffer = lines.pop() || ""

              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) continue

                try {
                  const data = JSON.parse(trimmed)
                  if (data.type === "text") {
                    assistantContent += data.content
                    setConversations((prev) => {
                      const msgs = [...(prev[chatId!] ?? [])]
                      const idx = msgs.findIndex((m) => m.id === assistantMsgId)
                      if (idx !== -1) msgs[idx] = { ...msgs[idx], content: assistantContent, status: undefined }
                      return { ...prev, [chatId!]: msgs }
                    })
                  } else if (data.type === "progress") {
                    setConversations((prev) => {
                      const msgs = [...(prev[chatId!] ?? [])]
                      const idx = msgs.findIndex((m) => m.id === assistantMsgId)
                      // --- PARSER DE TRADUCCIONES DE PROGRESO ---
                      if (idx !== -1) {
                        const [key, value] = (data.content as string).split(':');
                        const translatedStatus = value ? t(key, { toolName: value }) : t(key);
                        msgs[idx] = { ...msgs[idx], status: translatedStatus };
                      }
                      return { ...prev, [chatId!]: msgs };
                    })
                  } else if (data.type === "attachment") {
                    if (!generatedAttachments) generatedAttachments = [];
                    generatedAttachments.push(data.content);
                  } else if (data.type === "notification") {
                    setPanelNotifications(prev => ({ ...prev, [data.content]: true }));
                  } else if (data.type === "error") {
                    assistantContent += `\n\n**Error del Servidor:** ${data.content}`
                  }
                } catch (e) { }
              }
            }

            if (streamBuffer.trim()) {
              try {
                const data = JSON.parse(streamBuffer.trim());
                if (data.type === "text") assistantContent += data.content;
                else if (data.type === "error") assistantContent += `\n\n**Error:** ${data.content}`;
              } catch (e) { }
            }
          }
        }

        // Cierre definitivo del mensaje
        const finalAssistantMessage: ChatMessage = {
          id: assistantMsgId,
          role: "assistant",
          content: assistantContent || "Lo siento, la respuesta de la IA estaba vacía.",
          timestamp: Date.now(),
          isStreaming: false,
          status: undefined,
          attachments: generatedAttachments
        }

        playNotificationSound()
        if (lastMessageWasAudioRef.current && assistantContent) {
          speakText(assistantContent)
          lastMessageWasAudioRef.current = false
        }

        setConversations((prev) => {
          const msgs = [...(prev[chatId!] ?? [])]
          const idx = msgs.findIndex((m) => m.id === assistantMsgId)
          if (idx !== -1) msgs[idx] = finalAssistantMessage
          return { ...prev, [chatId!]: msgs }
        })

        if (user) {
          let firestoreGeneratedAtts = generatedAttachments;
          if (generatedAttachments && generatedAttachments.length > 0) {
            firestoreGeneratedAtts = await Promise.all(generatedAttachments.map(async (att) => {
              try {
                const { url, fullPath } = await uploadFileToStorage(user.uid, chatId!, att);
                const newFileRecord = {
                  name: att.name, mimeType: att.mimeType, data: url, previewUrl: url,
                  storagePath: fullPath, source: "generated" as const, timestamp: Date.now()
                };
                const fileId = await saveGlobalFileRecord(user.uid, newFileRecord);
                setAllLocalFiles(prev => [{ ...newFileRecord, id: fileId } as LocalFile, ...prev]);
                return { name: att.name, mimeType: att.mimeType, data: url, previewUrl: url };
              } catch (e) {
                return { name: att.name, mimeType: att.mimeType, data: att.data, previewUrl: att.previewUrl };
              }
            }));
          }
          const messageToSave = { ...finalAssistantMessage, attachments: firestoreGeneratedAtts };
          saveChatMessage(user.uid, chatId!, messageToSave);
        }

      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("Petición abortada por el usuario")
          return
        }
        console.error("Error crítico en el chat:", error)
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.errorConnection") + ` (${error.message})`,
          timestamp: Date.now(),
        }
        setConversations((prev) => ({
          ...prev,
          [chatId!]: [...(prev[chatId!] ?? []), errorMessage],
        }))
        if (user) saveChatMessage(user.uid, chatId!, errorMessage);
      } finally {
        setIsLoading(false)
      }
    },
    [isLoading, activeChatId, t, conversations, user, chatHistory, playNotificationSound, speakText, modelSelected, allLocalFiles, locale]
  )

  // Auth loading state
  if (authLoading) {
    return (
      <div className="glass-bg flex h-dvh items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-sm text-muted-foreground">{t("app.loading")}</span>
        </div>
      </div>
    )
  }

  // Not authenticated - show login
  if (!user) {
    return <LoginScreen />
  }

  return (
    <div className="glass-bg flex h-dvh overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <GeminiSidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          activeChatId={activeChatId}
          onSelectChat={(id) => {
            handleSelectChat(id)
            setShowFileExplorer(false)
            setActivePanel('chat')
          }}
          onNewChat={() => {
            handleNewChat()
            setShowFileExplorer(false)
            setActivePanel('chat')
          }}
          chatHistory={chatHistory}
          onDeleteAllChats={handleDeleteAllChats}
          onOpenFileExplorer={() => setShowFileExplorer(true)}
          onRenameChat={handleRenameChat}
          onDeleteChat={handleDeleteChat}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>

      {/* Main content area */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="bg-transparent flex h-14 shrink-0 items-center justify-between rounded-none border-none px-2 md:px-4 z-20">
          <div className="flex items-center gap-2">
            {/* Mobile menu trigger */}
            <div className="md:hidden">
              <MobileSidebar
                activeChatId={activeChatId}
                onSelectChat={(id) => {
                  handleSelectChat(id)
                  setShowFileExplorer(false)
                  setActivePanel('chat')
                }}
                onNewChat={() => {
                  handleNewChat()
                  setShowFileExplorer(false)
                  setActivePanel('chat')
                }}
                chatHistory={chatHistory}
                onDeleteAllChats={handleDeleteAllChats}
                onOpenFileExplorer={() => setShowFileExplorer(true)}
                onRenameChat={handleRenameChat}
                onDeleteChat={handleDeleteChat}
                onToggleFavorite={handleToggleFavorite}
              />
            </div>

            {/* Gemini branding - shimmer + logo */}
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-bold tracking-tight md:text-lg"
                style={{
                  backgroundImage: "linear-gradient(135deg, var(--foreground) 0%, #8ab4f8 50%, var(--foreground) 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  animation: "shimmer 4s linear infinite",
                }}
              >
                BarbuSportif AI
              </span>
              <img
                src="/images/logo-white.png"
                alt="BarbuSportif"
                className="hidden size-6 md:block"
                style={{
                  animation: "logo-shimmer 4s ease-in-out infinite",
                }}
              />
            </div>
          </div>

          <GeminiHeader
            chatTitle={
              messages.length > 0
                ? t("header.assistant")
                : t("header.newConversation")
            }
            activeChatId={activeChatId}
            onRenameChat={handleRenameChat}
            onDeleteChat={handleDeleteChat}
            onToggleFavorite={handleToggleFavorite}
            isFavorite={chatHistory.find(c => c.id === activeChatId)?.isFavorite ?? false}
          />
        </header>

        {/* Content area: Explorer, Panels or Chat */}
        <div className="relative flex-1 overflow-hidden">
          {/* Global Dashboard Tabs Wrapper */}
          {!showFileExplorer && (
            <DashboardTabs 
              activePanel={activePanel} 
              notifications={panelNotifications}
              onChangePanel={(p) => {
                setActivePanel(p);
                clearNotification(p);
                if (p !== 'chat') setSidebarOpen(false);
              }} 
            />
          )}

          {showFileExplorer ? (
            <FileExplorer
              onClose={() => setShowFileExplorer(false)}
              localFiles={allLocalFiles}
              folders={explorerFolders}
              onDeleteFile={handleDeleteFile}
              onCreateFolder={handleCreateFolder}
              onRenameFile={handleRenameFile}
              onMoveFile={handleMoveFile}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onAddFileToChat={handleAddFileToChat}
              onUploadFile={async (file) => {
                if (user) {
                  try {
                    const { url, fullPath } = await uploadFileToStorage(user.uid, "explorer_uploads", file);
                    const newFileRecord = {
                      name: file.name, mimeType: file.mimeType, data: url, previewUrl: url,
                      storagePath: fullPath, source: "uploaded" as const, timestamp: Date.now(),
                      folderId: file.folderId,
                    };
                    const fileId = await saveGlobalFileRecord(user.uid, newFileRecord);
                    await saveExplorerFile(user.uid, { name: file.name, mimeType: file.mimeType, url, folderId: file.folderId });
                    setAllLocalFiles((prev) => [{ ...newFileRecord, id: fileId } as LocalFile, ...prev]);
                  } catch (e) {
                    console.error("Error en subida directa:", e);
                  }
                }
              }}
            />
          ) : (
            <div className="relative w-full h-full">
              {/* Chat Panel */}
              {activePanel === 'chat' && (
                <div 
                  className={cn(
                    "flex flex-col animate-in fade-in duration-500 overflow-hidden transition-all absolute inset-0 z-0 bg-transparent",
                    messages.length === 0 ? "justify-center pb-[10vh]" : ""
                  )}
                >
                  <div className={cn("flex flex-col min-h-0 relative", messages.length === 0 ? "flex-none overflow-visible" : "flex-1 overflow-hidden")}>
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 mb-8">
                        <div className="glass flex size-14 items-center justify-center rounded-full" style={{ animation: "subtleGlow 3s ease-in-out infinite" }}>
                          <Sparkles className="size-7 text-gemini-star" />
                        </div>
                        <h1 className="text-lg md:text-2xl font-normal text-foreground text-center px-6 max-w-sm">{t("chat.greeting")}</h1>
                      </div>
                    ) : (
                      <ChatArea messages={messages} isLoading={isLoading} />
                    )}
                  </div>
                  
                  <div className={cn(
                    "shrink-0 transition-all duration-500 relative z-10",
                    messages.length === 0 
                      ? "w-full max-w-3xl mx-auto px-4" 
                      : "bg-background/50 backdrop-blur-md"
                  )}>
                    <ChatInputBar
                      onSendMessage={(m, a, t) => handleSendMessage(m, a, t, activePanel)}
                      onStopGeneration={handleStopGeneration}
                      isLoading={isLoading}
                      activeTool={activeTool}
                      onToolSelect={setActiveTool}
                      modelSelected={modelSelected}
                      onModelChange={setModelSelected}
                      messages={messages}
                      isSimple={false}
                      onScrollToMessage={(id) => {
                        const el = document.getElementById(`msg-${id}`)
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
                      }}
                    />
                    
                    {messages.length === 0 && (
                      <PromptShortcuts onExecute={(content) => handleSendMessage(content)} />
                    )}
                  </div>
                </div>
              )}

              {/* Other Panels */}
              {activePanel === 'financial' && <div className="absolute inset-0 z-10"><FinancialPanel /></div>}
              {activePanel === 'traffic' && <div className="absolute inset-0 z-10"><TrafficPanel /></div>}
              {activePanel === 'competitors' && <div className="absolute inset-0 z-10"><CompetitorsPanel /></div>}
              {activePanel === 'accounting' && <div className="absolute inset-0 z-10"><AccountingPanel /></div>}
              {activePanel === 'marketing' && <div className="absolute inset-0 z-10"><MarketingPanel /></div>}
              {activePanel === 'reports' && <div className="absolute inset-0 z-10"><ReportsPanel /></div>}
              {activePanel === 'recommendations' && <div className="absolute inset-0 z-10"><RecommendationsPanel /></div>}
              {activePanel === 'cash-report' && <div className="absolute inset-0 z-10"><CashReportPanel /></div>}
              {activePanel === 'vision' && <div className="absolute inset-0 z-10"><VisionPanel /></div>}
              {activePanel === 'inventory' && <div className="absolute inset-0 z-10"><InventoryPanel /></div>}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}