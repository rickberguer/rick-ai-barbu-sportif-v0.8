import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

// Definimos la interfaz tipada para el payload esperado
interface SMSRequestPayload {
  to_number: string;
  message_body: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Lectura segura de variables de entorno (dentro de la función para el build de Next.js)
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
      console.error("[Twilio Config Error] Faltan variables de entorno esenciales para enviar SMS.");
      return NextResponse.json(
        { success: false, error: "Error de Servidor: Configuración de Twilio incompleta." },
        { status: 500 }
      );
    }

    // 2. Recepción y validación de datos
    const body = (await req.json()) as SMSRequestPayload;
    const { to_number, message_body } = body;

    if (!to_number || !message_body) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Faltan parámetros obligatorios: 'to_number' (destino) y 'message_body' (mensaje)." 
        },
        { status: 400 }
      );
    }

    // 3. Inicialización del cliente Twilio e integración
    const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

    console.log(`[Twilio] Preparando envío de SMS a ${to_number}...`);
    
    const message = await client.messages.create({
      body: message_body,
      from: TWILIO_PHONE_NUMBER,
      to: to_number,
    });

    console.log(`[Twilio] Mensaje enviado exitosamente. SID: ${message.sid}`);

    // 4. Manejo de Respuesta Exitosa
    return NextResponse.json({
      success: true,
      messageSid: message.sid,
      status: message.status,
    });

  } catch (error: any) {
    // Manejo de Respuesta de Error (Específico de Twilio o General)
    console.error("[Twilio API Error]:", error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Fallo inesperado al enviar el mensaje SMS.",
        code: error.code || null, // Twilio suele devolver un código de error específico
      },
      { status: 500 } // Podría ser 400 si el error es de formato, pero 500 es seguro como fallback
    );
  }
}

/*
=================================================================================
TOOL DECLARATION PARA VERTEX AI (app/api/chat/route.ts)
=================================================================================
Copia y pega este objeto JSON dentro de tu array de herramientas (tools)
en la configuración de tu modelo Vertex AI:

{
  name: "enviar_sms_twilio",
  description: "Herramienta que permite enviar mensajes de texto (SMS) reales a los clientes o al staff de la barbería 'Barbu Sportif'. Úsala exclusivamente cuando necesites notificar, recordar una cita, o comunicarte urgentemente. Requiere que el número de destino esté en formato E.164 (Ejemplo: +15145550199 para Canadá/US o +5255... para MX) y un mensaje conciso.",
  parameters: {
    type: "OBJECT",
    properties: {
      to_number: {
        type: "STRING",
        description: "El número telefónico de destino en formato internacional E.164. DEBE incluir el signo más (+) seguido del código de país y el número, sin espacios ni guiones. Ejemplo: '+15145550199'.",
      },
      message_body: {
        type: "STRING",
        description: "El contenido de texto exacto del SMS a enviar. Debe ser claro, directo y conservar el tono representativo de Barbu Sportif.",
      },
    },
    required: ["to_number", "message_body"],
  },
}

=================================================================================
MANEJO DEL LLAMADO EN EL CHAT STREAMING (Bloque 'if / else if'):
=================================================================================
} else if (callName === "enviar_sms_twilio") {
  try {
    const proxyUrl = new URL("/api/tools/sms", req.nextUrl.origin);
    const smsRes = await fetch(proxyUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callArgs),
    });
    if (smsRes.ok) {
      const data = await smsRes.json();
      functionResult = { resultado_sms: "Enviado con éxito", id: data.messageSid };
    } else {
      const errData = await smsRes.json();
      functionResult = { error_envio: errData.error, codigo_twilio: errData.code };
    }
  } catch (e: any) {
    functionResult = { fallo_servidor: e.message };
  }
}
*/
