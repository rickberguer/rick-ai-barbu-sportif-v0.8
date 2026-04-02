// lib/figma.ts
export async function getFigmaDesignAsImage(figmaUrl: string): Promise<string> {
  // 1. Extraer File Key de la URL
  const match = figmaUrl.match(/(?:file|design)\/([a-zA-Z0-9]{22,})/);
  if (!match) throw new Error("URL de Figma inválida. No se encontró el File Key.");
  const fileKey = match[1];
  
  // 2. Extraer el Node ID
  const urlObj = new URL(figmaUrl);
  let nodeId = urlObj.searchParams.get("node-id") || urlObj.searchParams.get("id");
  if (!nodeId) throw new Error("Falta el 'node-id' en la URL. Asegúrate de seleccionar un Frame específico en Figma antes de copiar el enlace.");
  
  // La API de Figma usa ":" en lugar de "-", así que lo reemplazamos
  nodeId = nodeId.replaceAll("-", ":");

  // 3. Pedir a Figma que renderice ese nodo como PNG
  const figmaToken = process.env.FIGMA_ACCESS_TOKEN;
  if (!figmaToken) throw new Error("Falta FIGMA_ACCESS_TOKEN en las variables de entorno.");

  const exportRes = await fetch(`https://api.figma.com/v1/images/${fileKey}?ids=${nodeId}&format=png`, {
    headers: { "X-Figma-Token": figmaToken }
  });
  
  if (!exportRes.ok) throw new Error(`Error de Figma API: ${exportRes.statusText}`);
  const exportData = await exportRes.json();
  const imageUrl = exportData.images[nodeId];

  if (!imageUrl) throw new Error("Figma no pudo generar la imagen. Verifica que el frame exista y tengas permisos.");

  // 4. Descargar la imagen y convertir a Base64 para los "ojos" de Rick
  const imageRes = await fetch(imageUrl);
  const arrayBuffer = await imageRes.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  return buffer.toString("base64");
}