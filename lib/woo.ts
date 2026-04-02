import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

// Variable global para mantener la conexión viva en caché (Lazy Initialization)
let wooClient: WooCommerceRestApi | null = null;

// Esta función solo se ejecutará en TIEMPO DE EJECUCIÓN, cuando las variables ya existan en Cloud Run
function getWooClient() {
  if (!wooClient) {
    if (!process.env.WOOCOMMERCE_URL) {
      throw new Error("Falta la variable de entorno WOOCOMMERCE_URL");
    }

    wooClient = new WooCommerceRestApi({
      url: process.env.WOOCOMMERCE_URL,
      consumerKey: process.env.WOOCOMMERCE_KEY || "",
      consumerSecret: process.env.WOOCOMMERCE_SECRET || "",
      version: "wc/v3"
    });
  }
  return wooClient;
}

/**
 * Consulta el inventario de productos
 */
export async function checkProductStock(search?: string) {
  try {
    const api = getWooClient(); // <- Se llama aquí
    const params: any = { per_page: 10 };
    if (search) params.search = search;

    const response = await api.get("products", params);

    return response.data.map((p: any) => ({
      id: p.id,
      nombre: p.name,
      precio: p.price,
      stock_actual: p.stock_quantity ?? "No gestiona stock",
      estado_stock: p.stock_status,
      sku: p.sku
    }));
  } catch (error: any) {
    console.error("Error Woo Stock:", error.response?.data || error.message);
    throw new Error("No pude conectar con el inventario de WooCommerce.");
  }
}

/**
 * Obtiene los últimos pedidos para ver qué se está vendiendo hoy
 */
export async function getRecentOrders(limit: number = 5, status?: string) {
  try {
    const api = getWooClient(); // <- Se llama aquí
    const params: any = { per_page: limit };
    if (status) params.status = status;

    const response = await api.get("orders", params);

    return response.data.map((o: any) => ({
      id: o.id,
      estado: o.status,
      total: `${o.total} ${o.currency}`,
      cliente: `${o.billing.first_name} ${o.billing.last_name}`,
      fecha: o.date_created,
      items: o.line_items.map((item: any) => `${item.quantity}x ${item.name}`).join(", ")
    }));
  } catch (error: any) {
    console.error("Error Woo Orders:", error.response?.data || error.message);
    throw new Error("Error al leer los pedidos de la tienda.");
  }
}

/**
 * Reporte rápido de ventas del mes actual
 */
export async function getSalesReport() {
  try {
    const api = getWooClient(); // <- Se llama aquí
    const response = await api.get("reports/sales", { period: "month" });
    const report = response.data[0];

    return {
      ventas_totales: report.total_sales,
      pedidos_totales: report.total_orders,
      items_vendidos: report.total_items,
      periodo: "Este mes"
    };
  } catch (error: any) {
    console.error("Error Woo Report:", error.message);
    throw new Error("No pude generar el reporte financiero.");
  }
}