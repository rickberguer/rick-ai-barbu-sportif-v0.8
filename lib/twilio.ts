import twilio from 'twilio';

/**
 * Envia un SMS usando la cuenta de Twilio configurada en las variables de entorno.
 * @param to El número de teléfono (debe incluir el código de país, ej: +52...)
 * @param body El cuerpo del mensaje
 */
export async function sendTwilioSms(to: string, body: string): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.error("[Twilio] Faltan variables de entorno (TWILIO_ACCOUNT_SID, AUTH_TOKEN o FROM_NUMBER)");
    return false;
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({
      body: body,
      from: from,
      to: to
    });

    console.log(`[Twilio] SMS enviado con ID: ${message.sid}`);
    return true;
  } catch (error: any) {
    console.error(`[Twilio] Error al enviar SMS a ${to}:`, error.message);
    return false;
  }
}
