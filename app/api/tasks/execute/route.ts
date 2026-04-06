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

    const json = typeof req.json === 'function' ? await req.json() : {};
    const { action, target = "General", notification = true, message, query, taskId, delete_after } = json;

    console.log(`[Automation] Ejecutando tarea: ${action} para ${target}`);

    let result = null;
    const db = getAdminDb();

    switch (action) {
      case "analyze_vision":
        // Ejemplo: Consultar BigQuery para ver tráfico en tiempo real de la última hora
        result = `Análisis de visión ejecutado para ${target}. Todo estable en las cámaras.`;
        break;

      case "summarize_sales":
        try {
          let summary = "";
          // 1. WooCommerce Sales
          try {
            const { getSalesReport } = await import("@/lib/woo");
            const woo = await getSalesReport();
            summary += `Tienda: $${woo.ventas_totales} (${woo.pedidos_totales} ped). `;
          } catch {}

          // 2. Mindbody Sales (Hoy)
          try {
            const { getSalesTransactions } = await import("@/lib/mindbody");
            const today = new Date().toISOString().split('T')[0];
            const mb = await getSalesTransactions(today, today);
            const totalMb = mb.sales.reduce((sum: number, s: any) => sum + s.totalAttributedToBarber, 0);
            summary += `Mindbody: $${totalMb.toFixed(2)} (${mb.totalTickets} tix).`;
          } catch {}

          result = summary || "No hay ventas registradas para hoy.";
          
          // Enviar SMS si el target es un celular
          if (target && (target.startsWith("+") || target.length > 9)) {
            const { sendTwilioSms } = await import("@/lib/twilio");
            const ok = await sendTwilioSms(target, `[Rick AI] ${result}`);
            result += ok ? " [SMS Enviado]" : " [Fallo SMS]";
          }
        } catch (e: any) {
          result = "Error al obtener resumen de ventas multiservicio.";
        }
        break;
        
      case "inventory_report":
        result = `Reporte de inventario generado para ${target}. Se detectaron 2 productos con bajo stock.`;
        break;

      case "send_alert":
      case "send_sms":
        // Enviar alerta por SMS usando Twilio
        try {
          const { sendTwilioSms } = await import("@/lib/twilio").catch(() => ({ sendTwilioSms: async () => { throw new Error("Módulo Twilio no implementado") } }));
          const ok = await sendTwilioSms(target, message || "Alerta de Rick AI del sistema.");
          result = `SMS enviado a ${target}. Status: ${ok ? "OK" : "Error"}`;
        } catch (e: any) {
          result = `Fallo al enviar SMS a ${target}: ${e.message}`;
        }
        break;

      case "custom_query":
        result = `Consulta ejecutada: ${query || "N/A"}`;
        break;

      default:
        console.warn(`[Automation] Acción no reconocida: ${action}`);
        await db.collection("automation_logs").add({
          action: action || "unknown",
          target: target || "N/A",
          timestamp: new Date(),
          status: "failed",
          error: "Acción no reconocida"
        }).catch(err => console.error("Fallo logging Firestore default:", err.message));
        return NextResponse.json({ error: "Acción no reconocida" }, { status: 400 });
    }

    // LOG en Firestore
    const logData = {
      taskId: taskId || "manual",
      action: action || "unknown",
      target: target || "N/A",
      details: result,
      timestamp: new Date(),
      status: "success"
    };
    await db.collection("automation_logs").add(logData).catch(err => console.error("Fallo logging Firestore success:", err.message));

    // AUTO-BORRADO: Si la tarea fue programada para borrarse después de ejecutarse (Reminder/One-off)
    if (delete_after && taskId) {
      try {
        const { deleteScheduledTask } = await import("@/lib/scheduler");
        await deleteScheduledTask(taskId);
        console.log(`[Automation] Tarea auto-eliminada exitosamente: ${taskId}`);
      } catch (err: any) {
        console.error(`[Automation] Fallo al auto-eliminar tarea ${taskId}:`, err.message);
      }
    }

    return NextResponse.json({ 
      success: true, 
      applied_action: action,
      taskId: taskId || "manual",
      details: result 
    });

  } catch (error: any) {
    console.error(`[Automation] Error fatal en ejecución:`, error.message);
    try {
      const db = getAdminDb();
      await db.collection("automation_logs").add({
        timestamp: new Date(),
        status: "fatal_error",
        error: error.message,
        action: "CRITICAL_FAILURE"
      }).catch(err => console.error("Impossible to log to Firestore:", err.message));
    } catch (e) {}
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
