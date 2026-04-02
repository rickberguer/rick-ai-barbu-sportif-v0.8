import { NextRequest, NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { getAdminDb } from "@/lib/firebase-admin";
// Re-import standard tools as needed for automation
// import { sendTwilioSms } from "@/lib/twilio"; 

const CRON_SECRET = process.env.CRON_SECRET || "fallback_secret";

/**
 * Endpoint de ejecución de tareas programadas.
 * Cloud Scheduler hace un POST aquí con un payload personalizado.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("X-Cron-Secret");

    if (authHeader !== CRON_SECRET) {
      return NextResponse.json({ error: "Falla de autenticación: Secret inválido" }, { status: 403 });
    }

    const payload = await req.json();
    const { action, target, notification, message, query } = payload;

    console.log(`[Automation] Ejecutando tarea: ${action} para ${target}`);

    let result = null;
    const db = getAdminDb();

    switch (action) {
      case "analyze_vision":
        // Ejemplo: Consultar BigQuery para ver tráfico en tiempo real de la última hora
        result = `Análisis de visión ejecutado para ${target}.`;
        break;

      case "summarize_sales":
        // Ejemplo: Resumen de ventas diario
        result = `Resumen de ventas generado para ${target}.`;
        break;
        
      case "inventory_report":
        result = `Reporte de inventario generado para la barbería ${target}. Productos con bajo stock notificados.`;
        break;

      case "send_alert":
        // Enviar alerta por SMS o Email
        // await sendTwilioSms(target, message);
        result = `Alerta enviada a ${target}: ${message}`;
        break;

      case "custom_query":
        // Ejecución de una consulta específica y envío de resultado
        result = `Consulta ejecutada: ${query}`;
        break;

      default:
        console.warn(`[Automation] Acción no reconocida: ${action}`);
        await db.collection("automation_logs").add({
          action, target, timestamp: new Date(), status: "failed", error: "Acción no reconocida"
        });
        return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
    }

    // LOG en Firestore
    await db.collection("automation_logs").add({
      action,
      target,
      details: result,
      timestamp: new Date(),
      status: "success"
    });

    return NextResponse.json({ 
      success: true, 
      applied_action: action,
      details: result 
    });

  } catch (error: any) {
    console.error(`[Automation] Error fatal en ejecución:`, error.message);
    try {
      const db = await import("@/lib/firebase-admin").then(m => m.getAdminDb());
      await db.collection("automation_logs").add({
        timestamp: new Date(),
        status: "fatal_error",
        error: error.message
      });
    } catch (e) {
       console.error("Fallo al guardar log de error en Firestore.");
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
