// lib/mailgun.ts

export async function sendMailgunEmail(to: string, subject: string, text: string, htmlContent?: string) {
  const domain = process.env.MAILGUN_DOMAIN;
  const apiKey = process.env.MAILGUN_API_KEY;

  if (!domain || !apiKey) {
    throw new Error("Faltan las credenciales MAILGUN_API_KEY o MAILGUN_DOMAIN en las variables de entorno.");
  }

  const url = `https://api.mailgun.net/v3/${domain}/messages`;
  // La API de Mailgun requiere codificar "api:TU_API_KEY" en Base64
  const auth = Buffer.from(`api:${apiKey}`).toString('base64');

  const formData = new URLSearchParams();
  // Rick firma sus propios correos corporativos
  formData.append("from", `Barbu Sportif vCOO <noreply@${domain}>`);
  formData.append("to", to);
  formData.append("subject", subject);
  formData.append("text", text);

  if (htmlContent) {
    formData.append("html", htmlContent);
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: formData.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fallo al enviar correo por Mailgun (${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Obtiene estadísticas agregadas de Mailgun
 */
export async function getMailgunStats(startDate: string, endDate: string) {
  const domain = process.env.MAILGUN_DOMAIN;
  const apiKey = process.env.MAILGUN_API_KEY;

  if (!domain || !apiKey) return null;

  const auth = Buffer.from(`api:${apiKey}`).toString('base64');

  const toRFC2822 = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toUTCString();
  };

  // Mailgun stats/total API
  const url = new URL(`https://api.mailgun.net/v3/${domain}/stats/total`);
  url.searchParams.append("event", "accepted");
  url.searchParams.append("event", "delivered");
  url.searchParams.append("event", "opened");
  url.searchParams.append("event", "clicked");
  url.searchParams.append("start", toRFC2822(startDate));
  url.searchParams.append("end", toRFC2822(endDate));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Authorization": `Basic ${auth}`
      }
    });

    if (!response.ok) {
      console.error(`Error fetching Mailgun stats: ${await response.text()}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Mailgun Stats API Error:", error);
    return null;
  }
}