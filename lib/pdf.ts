// lib/pdf.ts
import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import { Readable } from 'stream';

// Autenticación automática usando las credenciales por defecto de Google Cloud (ADC)
// Esto usa la cuenta de servicio de tu Cloud Run (barbu-drive-reader@...)
const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/drive'],
});
const drive = google.drive({ version: 'v3', auth });

export async function generateAndUploadPDF(title: string, htmlContent: string): Promise<string> {
  let browser;
  try {
    console.log(`[PDF Engine] Generando reporte: ${title}...`);
    
    // 1. Iniciar el navegador virtual (Configuración optimizada para Alpine Linux en Cloud Run)
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu' // Evita errores al no tener tarjeta gráfica en el servidor
      ],
      // Usa la ruta que definimos en el Dockerfile, o el fallback por defecto de Alpine
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    });

    const page = await browser.newPage();
    
    // 2. Inyectar el HTML generado por Rick en la página
    // waitUntil: 'networkidle0' asegura que si Rick incluyó imágenes (ej. logos de Barbu Sportif) o fuentes, espere a que carguen
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // 3. Generar el PDF en un Buffer de memoria
    const pdfBuffer = await page.pdf({
      format: 'Letter',
      printBackground: true, // Crucial para que los colores de fondo y estilos CSS se impriman
      margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
    });

    // Cerramos el navegador inmediatamente para liberar memoria en Cloud Run
    await browser.close();

    // 4. Subir el PDF a Google Drive
    console.log(`[PDF Engine] Subiendo ${title} a Google Drive...`);
    
    const fileMetadata = {
      name: `${title}_${new Date().toISOString().split('T')[0]}.pdf`,
      mimeType: 'application/pdf',
      // IMPORTANTE: Si quieres que los reportes caigan en una carpeta específica, 
      // descomenta la línea de abajo y pon el ID de la carpeta de Drive de tu Memoria Corporativa.
       parents: ['1W4n0umaIhqVNJecCI9J4DgZDt2_ltwvi'] 
    };

    const media = {
      mimeType: 'application/pdf',
      body: Readable.from(Buffer.from(pdfBuffer))
    };

    const driveResponse = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink',
      supportsAllDrives: true,
    });

    console.log(`✅ Reporte creado exitosamente: ${driveResponse.data.webViewLink}`);
    
    return `¡Reporte generado con éxito! Puedes verlo y descargarlo aquí: ${driveResponse.data.webViewLink}`;

  } catch (error: any) {
    if (browser) await browser.close(); // Asegurarnos de cerrar el proceso de Chrome si falla
    console.error("❌ Error en generación de PDF:", error);
    throw new Error(`Error al generar el PDF: ${error.message}`);
  }
}