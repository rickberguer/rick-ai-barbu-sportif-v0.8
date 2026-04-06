import { google } from 'googleapis';

// 1. Cliente de Gmail con Impersonation (JWT explícito para Domain-Wide Delegation)
const getGmailClient = async (targetEmail: string) => {
  // Leemos tu llave maestra de las variables de entorno de Cloud Run
  const credentialsString = process.env.DRIVE_SERVICE_ACCOUNT_JSON;

  if (!credentialsString) {
    throw new Error("Falta la variable DRIVE_SERVICE_ACCOUNT_JSON en el servidor.");
  }

  const credentials = JSON.parse(credentialsString);

  // Usamos google.auth.JWT, el único método que soporta Domain-Wide Delegation (subject)
  const authClient = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key ? credentials.private_key.replace(/\\n/g, '\n') : '',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose'
    ],
    subject: targetEmail // 👈 ¡Esta es la llave mágica que suplanta al correo objetivo!
  });

  return google.gmail({ version: 'v1', auth: authClient });
};

/**
 * Lee los correos de CUALQUIER buzón de Barbu Sportif
 */
export async function readRecentEmails(targetEmail: string, maxResults: number = 5) {
  try {
    const gmail = await getGmailClient(targetEmail);

    const res = await gmail.users.messages.list({
      userId: 'me', // "me" ahora significa el targetEmail gracias a la delegación
      labelIds: ['INBOX'],
      maxResults: maxResults,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = msgData.data.payload?.headers;
        const subject = headers?.find(h => h.name === 'Subject')?.value || 'Sin Asunto';
        const from = headers?.find(h => h.name === 'From')?.value || 'Desconocido';
        const date = headers?.find(h => h.name === 'Date')?.value || '';

        return {
          id: msg.id,
          asunto: subject,
          remitente: from,
          fecha: date,
          resumen: msgData.data.snippet,
        };
      })
    );

    return emailDetails;
  } catch (error: any) {
    const errorDetail = error.response?.data?.error_description || error.message;
    console.error(`[Gmail API Error] Fallo al acceder a ${targetEmail}:`, errorDetail);
    throw new Error(`Rick no pudo acceder al buzón de ${targetEmail}. Detalles: ${errorDetail}. Asegúrate de que la Delegación de Dominio esté activa para este correo.`);
  }
}

/**
 * Crea un borrador en CUALQUIER buzón de Barbu Sportif
 */
export async function draftEmail(targetEmail: string, to: string, subject: string, bodyText: string) {
  try {
    const gmail = await getGmailClient(targetEmail);

    const emailLines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      bodyText
    ];
    const email = emailLines.join('\r\n');
    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: {
          raw: encodedEmail
        }
      }
    });

    return { status: "success", info: `Borrador guardado exitosamente en el buzón de ${targetEmail}.` };
  } catch (error: any) {
    console.error(`Error redactando en ${targetEmail}:`, error.message);
    throw new Error(`No se pudo crear el borrador en ${targetEmail}.`);
  }
}

/**
 * Busca correos en cualquier buzón usando consultas de Gmail (ej. "subject:factura", "from:pedro")
 */
export async function searchEmails(targetEmail: string, query: string, maxResults: number = 5) {
  try {
    const gmail = await getGmailClient(targetEmail);

    // Usamos el parámetro 'q' que acepta la misma sintaxis de búsqueda que la barra de Gmail
    const res = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: maxResults,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return [];

    const emailDetails = await Promise.all(
      messages.map(async (msg) => {
        const msgData = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        });

        const headers = msgData.data.payload?.headers;
        return {
          id: msg.id,
          asunto: headers?.find(h => h.name === 'Subject')?.value || 'Sin Asunto',
          remitente: headers?.find(h => h.name === 'From')?.value || 'Desconocido',
          fecha: headers?.find(h => h.name === 'Date')?.value || '',
          resumen: msgData.data.snippet,
        };
      })
    );

    return emailDetails;
  } catch (error: any) {
    console.error(`Error buscando correos en ${targetEmail}:`, error.message);
    throw new Error(`No se pudo realizar la búsqueda en ${targetEmail}.`);
  }
}