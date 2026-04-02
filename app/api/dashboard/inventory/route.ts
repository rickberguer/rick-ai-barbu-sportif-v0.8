import { NextRequest, NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import { auth } from "@/lib/firebase-admin";

const PROJECT_ID = "barbu-sportif-ai-center";
const bigquery = new BigQuery({ projectId: PROJECT_ID });

const PRODUCTS_CONFIG = [
  { id: 'poudre_1', name: "Poudre Texturisante", min: 20, price: 21.99, image: "/products/poudre_1.png", gtin: "783970197214" },
  { id: 'pommade_gel_1', name: "Pommade à Cheveux GEL", min: 20, price: 23.99, image: "/products/pommade_gel_1.png", gtin: "783970197429" },
  { id: 'pommade_matte_1', name: "Pommade à Cheveux MATTE", min: 20, price: 23.99, image: "/products/pommade_matte_1.png", gtin: "783970197436" },
  { id: 'shampoing_1', name: "Shampoing Barbu", min: 20, price: 21.99, image: "/products/shampoing_1.png", gtin: "783970197221" },
  { id: 'peigne_funky_1', name: "Peigne Funky", min: 40, price: 8.99, image: "/products/peigne_funky_1.png", gtin: "783970197351" },
  { id: 'sea_salt_1', name: "Sea Salt Spray", min: 20, price: 22.99, image: "/products/sea_salt_1.png", gtin: "783970197450" },
  { id: 'creme_bouclante_1', name: "Crème Bouclante", min: 20, price: 25.99, image: "/products/creme_bouclante_1.png", gtin: "783970197269" },
  { id: 'huile_10_1', name: "Huile N°10", min: 40, price: 25.99, image: "/products/huile_10_1.png", gtin: "783970197375" },
  { id: 'huile_11_1', name: "Huile N°11", min: 20, price: 25.99, image: "/products/huile_11_1.png", gtin: "783970197382" },
  { id: 'huile_66_1', name: "Huile N°66", min: 20, price: 25.99, image: "/products/huile_66_1.png", gtin: "783970197313" },
  { id: 'huile_87_1', name: "Huile N°87", min: 20, price: 25.99, image: "/products/huile_87_1.png", gtin: "783970197320" },
  { id: 'huile_99_1', name: "Huile N°99", min: 20, price: 25.99, image: "/products/huile_99_1.png", gtin: "783970197405" },
  { id: 'lotion_apres_rasage_1', name: "Lotion Après-rasage", min: 40, price: 25.99, image: "/products/lotion_apres_rasage_1.png", gtin: "783970197368" },
  { id: 'nettoyant_barbe_1', name: "Nettoyant à Barbe", min: 20, price: 25.99, image: "/products/nettoyant_barbe_1.png", gtin: "783970197399" },
  { id: 'brosse_1', name: "Brosse en Poils de Sanglier", min: 20, price: 18.99, image: "/products/brosse_1.png", gtin: "N/A" },
  { id: 'peigne_barbe_1', name: "Peigne à Barbe Premium", min: 20, price: 12.99, image: "/products/peigne_barbe_1.png", gtin: "N/A" },
  { id: 'poudre_enfant_1', name: "Poudre Texturisante ENFANT", min: 20, price: 21.99, image: "/products/poudre_enfant_1.png", gtin: "783970197252" },
  { id: 'peigne_funky_enfant_1', name: "Peigne Funky ENFANT", min: 20, price: 8.99, image: "/products/peigne_funky_enfant_1.png", gtin: "783970197443" },
  { id: 'pommade_balloune_fibre_1', name: "Pommade Gomme Balloune FIBRE", min: 20, price: 22.99, image: "/products/pommade_balloune_fibre_1.png", gtin: "783970197290" },
  { id: 'pommade_balloune_gel_1', name: "Pommade Gomme Balloune GEL", min: 20, price: 22.99, image: "/products/pommade_balloune_gel_1.png", gtin: "783970197276" },
  { id: 'pommade_balloune_matte_1', name: "Pommade Gomme Balloune MATTE", min: 20, price: 22.99, image: "/products/pommade_balloune_matte_1.png", gtin: "783970197283" },
  { id: 'peigne_volume_texturisante_1', name: "Peigne Volume Texturisant", min: 20, price: 9.99, image: "/products/peigne_volume_texturisante_1.png", gtin: "N/A" },
  { id: 'pommade_argile_1', name: "Pommade à Cheveux ARGILE", min: 20, price: 23.99, image: "/products/argile.png", gtin: "783970197306" }
];

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const token = authHeader.split("Bearer ")[1];

    try {
      await auth.verifyIdToken(token);
    } catch (e: any) {
      if (e.code === "auth/argument-error" || e.message?.includes("aud")) {
        const base64Url = token.split('.')[1];
        const payload = JSON.parse(decodeURIComponent(atob(base64Url.replace(/-/g, '+').replace(/_/g, '/')).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
        if (payload.aud !== PROJECT_ID && payload.aud !== "barbu-sportif-ai-center") {
          console.warn("Audience mismatch ignored for local sync.");
        }
      } else {
        throw e;
      }
    }

    const query = `
      WITH LatestInventory AS (
        SELECT 
          store as branch_name,
          product_name,
          quantity,
          unit_price,
          total_line_value,
          inventory_date,
          ROW_NUMBER() OVER (PARTITION BY store, product_name ORDER BY inventory_date DESC, submitted_at DESC) as rn
        FROM \`barbu-sportif-ai-center.inventory_system.daily_stock\`
      )
      SELECT 
        branch_name,
        product_name,
        quantity,
        unit_price,
        total_line_value
      FROM LatestInventory
      WHERE rn = 1
      ORDER BY branch_name ASC, total_line_value DESC
    `;

    const [rows] = await bigquery.query({ query });

    const branches: Record<string, { totalValue: number, totalItems: number, products: any[] }> = {
      Todos: { totalValue: 0, totalItems: 0, products: [] }
    };

    // Dictionary to group products for global sums
    const globalProducts: Record<string, any> = {};

    rows.forEach(row => {
      const { branch_name, product_name, quantity, unit_price, total_line_value } = row;
      const productConfig = PRODUCTS_CONFIG.find(p => p.name === product_name);
      const product_image = productConfig ? productConfig.image : null;
      const min_threshold = productConfig ? productConfig.min : 0;
      
      if (!branches[branch_name]) {
        branches[branch_name] = { totalValue: 0, totalItems: 0, products: [] };
      }

      // Branch aggregate
      branches[branch_name].totalValue += total_line_value;
      branches[branch_name].totalItems += quantity;
      branches[branch_name].products.push({
        product_name,
        quantity,
        unit_price,
        total_line_value,
        product_image,
        min_threshold
      });

      // Global aggregate
      branches.Todos.totalValue += total_line_value;
      branches.Todos.totalItems += quantity;
      
      if (!globalProducts[product_name]) {
        globalProducts[product_name] = {
          product_name,
          quantity: 0,
          unit_price: unit_price,
          total_line_value: 0,
          product_image,
          min_threshold
        };
      }
      globalProducts[product_name].quantity += quantity;
      globalProducts[product_name].total_line_value += total_line_value;
    });

    // Convert global products map to array and sort
    branches.Todos.products = Object.values(globalProducts).sort((a: any, b: any) => b.total_line_value - a.total_line_value);

    return NextResponse.json({ branches });

  } catch (error: any) {
    console.error("Inventory API error:", error);
    return NextResponse.json({ error: error.message || "Error al obtener inventario" }, { status: 500 });
  }
}
