// lib/looker.ts

export function getLookerReportUrls() {
  const reportId = process.env.LOOKER_REPORT_ID;
  
  if (!reportId) {
    throw new Error("Falta la variable LOOKER_REPORT_ID en el entorno.");
  }

  const directUrl = `https://lookerstudio.google.com/reporting/${reportId}`;
  
  // URL especial optimizada para incrustarse (embed) sin los menús de edición
  const embedUrl = `https://lookerstudio.google.com/embed/reporting/${reportId}`;

  // Código HTML seguro para incrustar en el chat
  const iframeCode = `<iframe width="100%" height="600" src="${embedUrl}" frameborder="0" style="border:0; border-radius: 8px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);" allowfullscreen sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>`;

  return { directUrl, embedUrl, iframeCode };
}