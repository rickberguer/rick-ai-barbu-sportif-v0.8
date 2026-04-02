// lib/tavily.ts

const TAVILY_API_URL = "https://api.tavily.com/search";

export async function searchWeb(query: string) {
  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("Falta la variable de entorno TAVILY_API_KEY en el servidor.");

    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic", // Consume solo 1 crédito
        include_answer: true,  // Le pide a Tavily que redacte un resumen directo
        include_raw_content: false,
        max_results: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP de Tavily: ${response.status}`);
    }

    const data = await response.json();

    // Devolvemos el resumen de IA generado por Tavily y los enlaces de referencia
    return {
      resumen_respuesta: data.answer || "No se pudo generar un resumen directo.",
      fuentes: data.results.map((r: any) => ({
        titulo: r.title,
        url: r.url,
        fragmento: r.content
      }))
    };

  } catch (error: any) {
    console.error("Error en búsqueda web (Tavily):", error.message);
    throw new Error(`Fallo en el servicio de búsqueda de internet: ${error.message}`);
  }
}