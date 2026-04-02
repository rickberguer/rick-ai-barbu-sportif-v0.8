# 🧠 Memoria Corporativa: Rick AI vCOO - Barbu Sportif

Este documento centraliza el contexto, arquitectura y capacidades de Rick AI, el Director Operativo Virtual (vCOO) de la cadena de barberías Barbu Sportif en Quebec. Su propósito es servir como referencia técnica y operativa para asegurar la continuidad del desarrollo y la coherencia del sistema.

---

## 1. Identidad y Misión
**Rick AI** no es solo un chatbot; es el cerebro analítico y operativo de la empresa.
- **Rol:** Director Operativo Virtual (vCOO).
- **Personalidad:** Ejecutivo, directo, estratégico, orientado a resultados, deportivo y varonil.
- **Idiomas:** Francés quebequense (prioridad), Español (dueños) e Inglés (técnico/multimedia).
- **ADN Visual:** Estética "Premium Apple-neo-glassmorphism dark". Fondos oscuros, capas translúcidas y diseño deportivo.

---

## 2. Ecosistema de Datos (BigQuery)
Rick utiliza **BigQuery** como única fuente de verdad. El proyecto central es `barbu-sportif-ai-center`.

### Datasets Principales:
| Dataset | Tabla(s) Clave | Descripción |
| :--- | :--- | :--- |
| `mindbody_analytics` | `sales_history`, `appointment_history`, `payroll_history`, `client_catalog`, `vision_analytics` | Datos operativos, ventas y tráfico. |
| `inventory_system` | `daily_stock` | Inventario consolidado por sucursal. |
| `google_ads` | `CampaignBasicStats_1029563228` | Gasto y rendimiento de pauta en Google. |
| `facebook_ads_analytics`| `campaign_daily_stats` | Gasto y rendimiento en Meta. |
| `tiktok_ads_analytics` | `campaign_daily_stats` | Gasto y rendimiento en TikTok. |

---

## 3. Arquitectura Técnica y URLs
- **Main App (Cloud Run):** `https://barbusportif-ai-497745856294.us-central1.run.app`
- **Region:** `us-central1`
- **Proyecto GCP:** `barbu-sportif-ai-center` (ID: Probablemente `barbu-sportif-ai-center`).

### Endpoints Críticos:
- `POST /api/chat`: Motor de IA (Vertex AI Gemini 1.5 Pro).
- `GET /api/dashboard/inventory`: API que consolida el stock de BigQuery con `PRODUCTS_CONFIG`.
- `POST /api/tasks/execute`: Router de automatización que recibe llamadas de Cloud Scheduler.
- `GET /api/vision/stream`: Endpoint SSE (Server-Sent Events) para streaming de baja latencia.
- `POST /api/vision/latest`: Endpoint donde los workers (Python) inyectan detecciones en Firestore (`vision_detections`).
- `POST /api/vision/analyze`: Proxy que dispara el análisis visual de una sucursal específica.

---

## 4. Capacidades Especiales
### 👁️ Rick Vision (Inteligencia Visual)
Analiza cámaras de seguridad mediante workers remotos que ejecutan modelos Florence-2.
- **Persistencia Física:** Datos guardados en la colección `vision_detections` de Firestore para sincronización multi-instancia.
- **Streaming SSE (Ultra-Low Latency):** El Dashboard ya no hace polling; recibe actualizaciones en "push" instantáneo del servidor.
- **AR Smoothing (Persistencia Temporal):** Implementación de "2-second grace period" en el frontend. Las cajas de detección se mantienen 2s tras su última detección para eliminar el parpadeo (flicker).
- **Dashboard:** `LiveVisionCamera.tsx` con motor de dibujo a 60 FPS y efectos de desvanecimiento (glassmorphism).

### ⏰ Automatización (Cloud Scheduler)
Rick puede "programar el futuro".
- **Herramienta:** `create_scheduled_automation`.
- **Zonas Horarias:** Configurado para `America/Toronto` (Montreal).
- **Auditoría:** Cada ejecución se registra en la colección `automation_logs` de Firestore con estatus (`success`/`failed`) y detalles.
- **Seguridad:** Uso de `X-Cron-Secret` para validar las ejecuciones programadas.

### 🎨 Creatividad y Marketing (GPU)
Generación de contenido publicitario mediante servidores GPU (ComfyUI).
- **Formatos:** 9:16 (TikTok/Reels), 1:1, 16:9.
- **Herramienta:** `generar_multimedia_marketing`.

---

## 5. Reglas de Implementación (Memorias)
1.  **Seguridad SQL:** Las tablas de Mindbody están en UTC. Usar siempre `DATE(DATETIME(col, 'America/Toronto'))`. No usar `TIMESTAMP` sobre esas columnas.
2.  **Identidad de Cliente:** Usar la fórmula de COALESCE (Email > Phone > ClientID) para evitar duplicados históricos de 10 años.
3.  **UI/UX:**
    *   Padding responsivo en desktop (`md:pr-24`) para evitar que el menú flotante tape los dashboards.
    *   Uso de `lib/utils.ts` -> `formatCurrency` para precios en CAD.
    *   Imágenes de productos con `mix-blend-multiply` para adaptarse a temas Light/Dark.
4.  **Internacionalización:** Las traducciones viven en `lib/i18n.tsx`. Siempre añadir nuevas llaves en `fr-CA`, `en-CA` y `es-MX`.
5.  **Persistencia AR:** Para evitar parpadeos visuales, el frontend debe mantener las detecciones vivas 2000ms después de su última aparición en el stream de datos.

---

## 6. Checklist de Despliegue, Atención!, No despliegues salvo que se te solicite.
Para desplegar cambios, el comando estándar de la terminal (según logs recientes) es:
```bash
gcloud run deploy barbusportif-ai --source . --region us-central1 --allow-unauthenticated
```

---
**Documento actualizado:** 2026-04-02 (Rick vCOO Memory - SSE & Smoothing Update)
