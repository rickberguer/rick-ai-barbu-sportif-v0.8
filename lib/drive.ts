import { google } from 'googleapis';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import officeParser from 'officeparser';

// 1. Cliente de Drive autenticado con el token inyectado
const getDriveClient = (accessToken: string) => {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
};

// 2. Función de búsqueda (Restringida a 3 resultados para optimizar Tokens)
export async function searchDriveFiles(query: string, accessToken: string) {
  const drive = getDriveClient(accessToken);
  const safeQuery = query.replace(/'/g, "\\'");

  try {
    const res = await drive.files.list({
      q: `(name contains '${safeQuery}' or fullText contains '${safeQuery}') and trashed = false`,
      fields: 'files(id, name, mimeType, webViewLink, createdTime)',
      pageSize: 3,
      orderBy: 'modifiedTime desc',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return res.data.files || [];
  } catch (error: any) {
    console.error("Error buscando en Drive:", error.message);
    throw new Error("No se pudo buscar en Drive. Verifica que la cuenta de servicio tenga permisos.");
  }
}

// 3. Motor Omnívoro de Extracción de Datos
export async function getDriveFileForAI(fileId: string, mimeType: string, accessToken: string) {
  const drive = getDriveClient(accessToken);

  try {
    // ------------------------------------------------------------------
    // CASO A: DOCUMENTOS NATIVOS DE GOOGLE WORKSPACE
    // ------------------------------------------------------------------
    if (mimeType.includes('vnd.google-apps')) {
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        // Hojas de cálculo -> Texto CSV
        const res = await drive.files.export({ fileId: fileId, mimeType: 'text/csv' });
        return { type: 'text', mimeType: 'text/csv', content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) };
      }
      else if (mimeType === 'application/vnd.google-apps.presentation') {
        // Presentaciones de Google -> Exportar a PDF Visual
        const res = await drive.files.export({ fileId: fileId, mimeType: 'application/pdf' }, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(res.data as ArrayBuffer);
        return { type: 'media', mimeType: 'application/pdf', data: buffer.toString('base64') };
      }
      else {
        // Documentos de texto -> Texto Plano
        const res = await drive.files.export({ fileId: fileId, mimeType: 'text/plain' });
        return { type: 'text', mimeType: 'text/plain', content: typeof res.data === 'string' ? res.data : JSON.stringify(res.data) };
      }
    }

    // Descargamos el buffer en crudo para cualquier archivo que NO sea nativo de Google
    const fileRes = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    const buffer = Buffer.from(fileRes.data as ArrayBuffer);

    // ------------------------------------------------------------------
    // CASO B: ARCHIVOS DE MICROSOFT OFFICE (Traducción a Texto)
    // ------------------------------------------------------------------

    // 1. Archivos de Excel (.xlsx, .xls)
    if (mimeType.includes('spreadsheetml.sheet') || mimeType === 'application/vnd.ms-excel') {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      let csvContent = "";

      // Iteramos sobre todas las pestañas/hojas del Excel
      workbook.SheetNames.forEach(sheetName => {
        csvContent += `\n--- Hoja: ${sheetName} ---\n`;
        csvContent += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      });

      return { type: 'text', mimeType: 'text/csv', content: csvContent };
    }

    // 2. Archivos de Word (.docx)
    if (mimeType.includes('wordprocessingml.document') || mimeType === 'application/msword') {
      const result = await mammoth.extractRawText({ buffer: buffer });
      return { type: 'text', mimeType: 'text/plain', content: result.value };
    }

    // 3. Archivos de PowerPoint (.pptx)
    if (mimeType.includes('presentationml.presentation') || mimeType === 'application/vnd.ms-powerpoint') {
      const text = await officeParser.parseOfficeAsync(buffer);
      return { type: 'text', mimeType: 'text/plain', content: text };
    }

    // ------------------------------------------------------------------
    // CASO C: MULTIMEDIA E IMÁGENES NATIVAS DE GEMINI
    // ------------------------------------------------------------------
    // Si es un PDF, imagen, audio o video, se envía directo en base64
    return {
      type: 'media',
      mimeType: mimeType,
      data: buffer.toString('base64')
    };

  } catch (error: any) {
    const errorMsg = error.response?.data?.error?.message || error.message;
    console.error(`[Drive API Error] Fallo al procesar archivo ${fileId}:`, errorMsg);
    
    if (errorMsg.includes("Forbidden") || errorMsg.includes("not found")) {
      throw new Error(`Rick no tiene permiso para leer este archivo. Asegúrate de que esté compartido con la Cuenta de Servicio del Proyecto.`);
    }
    throw new Error(`Error al leer archivo (${mimeType}): ${errorMsg}`);
  }
}

// 4. Módulo de Escritura: Memoria Corporativa
export async function saveToCorporateMemory(title: string, content: string) {
  try {
    const credentialsString = process.env.DRIVE_SERVICE_ACCOUNT_JSON;
    const folderId = process.env.MEMORY_FOLDER_ID;

    if (!credentialsString) throw new Error("Falta la variable DRIVE_SERVICE_ACCOUNT_JSON en el servidor.");
    if (!folderId) throw new Error("Falta la variable MEMORY_FOLDER_ID en el servidor.");

    const credentials = JSON.parse(credentialsString);

    // Solicitamos permiso explícito para crear/escribir archivos usando Domain-Wide Delegation
    const authClient = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key ? credentials.private_key.replace(/\\n/g, '\n') : '',
      scopes: ['https://www.googleapis.com/auth/drive'],
    });

    const drive = google.drive({ version: 'v3', auth: authClient });

    // Preparamos los metadatos del archivo para asegurar la extensión .md
    const fileMetadata = {
      name: title.endsWith('.md') ? title : `${title}.md`,
      mimeType: 'text/markdown',
      parents: [folderId] // Lo guardamos directamente en la carpeta designada
    };

    const media = {
      mimeType: 'text/markdown',
      body: content,
    };

    // Subimos el archivo a Google Drive habilitando la escritura en Unidades Compartidas
    const file = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true // <-- ESTA ES LA LLAVE PARA ENTRAR AL SHARED DRIVE
    });

    return {
      status: "success",
      info: `El archivo '${file.data.name}' ha sido guardado exitosamente en la Memoria Corporativa. Vertex AI lo indexará en breve.`,
      link: file.data.webViewLink
    };

  } catch (error: any) {
    console.error("Error guardando en la Memoria Corporativa:", error.message);
    throw new Error(`No se pudo guardar el archivo en Drive: ${error.message}`);
  }
}