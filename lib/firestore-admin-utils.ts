import { getAdminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export interface Recommendation {
  id: string;
  title: string;
  simplifiedSummary: string;
  content: string; // Markdown
  type: 'Marketing' | 'Operaciones' | 'Finanzas' | 'Estrategia';
  icon?: string;
  priority: 'Baja' | 'Media' | 'Alta' | 'Urgente';
  impact: string;
  status: string;
  links?: { label: string, url: string }[];
  hasVisualMedia: boolean;
  suggestedPrompt?: string;
  createdAt?: any;
}

/** Helper: strip undefined values from an object before sending to Firestore */
function cleanData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([_, v]) => v !== undefined)
  );
}

export async function saveRecommendationsAdmin(userId: string, recommendationsArr: Recommendation[]) {
  const db = getAdminDb();
  const recsRef = db.collection(`users/${userId}/recommendations`);
  const snapshot = await recsRef.get();
  
  // Clean slate
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();

  // Save new ones
  for (const rec of recommendationsArr) {
    const docRef = recsRef.doc(rec.id);
    await docRef.set(cleanData({
      ...rec,
      createdAt: FieldValue.serverTimestamp()
    }));
  }
}

export async function getRecommendationsAdmin(userId: string): Promise<Recommendation[]> {
  const db = getAdminDb();
  const recsRef = db.collection(`users/${userId}/recommendations`);
  const snapshot = await recsRef.orderBy("createdAt", "desc").get();
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Recommendation));
}
