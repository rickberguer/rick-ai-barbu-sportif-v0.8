require('dotenv').config({ path: ['.env.local', '.env'] });
const { BigQuery } = require('@google-cloud/bigquery');
const fs = require('fs'); // <--- Módulo para manejar archivos (Load API)

// --- CONFIGURACIÓN DE IDENTIDAD Y CONTROLES ---
const PROJECT_ID = "barbu-sportif-ai-center";
const DATASET_ID = "mindbody_analytics";
const SITE_ID = "261882";
const MINDBODY_API = "https://api.mindbodyonline.com/public/v6";

// 🎛️ INTERRUPTORES DE CATÁLOGOS GLOBALES
// Activado para asegurar la importación correcta de la identidad de tus clientes
const SYNC_CLIENTS = false;
const SYNC_PRODUCTS = false;

const bigquery = new BigQuery({ projectId: PROJECT_ID });
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Formateador estricto para las fechas en BigQuery
const bqDate = (isoString) => {
    if (!isoString) return null;
    return isoString.replace('T', ' ').substring(0, 19);
};

let globalHeaders = {};

async function renovarToken() {
    process.stdout.write(`\x1b[35m[🔑 Token...]\x1b[0m `);
    const loginRes = await fetch(`${MINDBODY_API}/usertoken/issue`, {
        method: 'POST',
        headers: { 'Api-Key': process.env.MINDBODY_API_KEY, 'SiteId': SITE_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify({ Username: process.env.MINDBODY_USERNAME, Password: process.env.MINDBODY_PASSWORD })
    });
    if (!loginRes.ok) throw new Error("Fallo al obtener token maestro.");
    const data = await loginRes.json();

    globalHeaders = {
        'Api-Key': process.env.MINDBODY_API_KEY,
        'SiteId': SITE_ID,
        'Authorization': `Bearer ${data.AccessToken}`,
        'Content-Type': 'application/json'
    };
}

// --- MOTOR DE RED DIRECTO ---
async function fetchMindbody(url) {
    let delay = 1500;
    for (let i = 0; i < 3; i++) {
        try {
            const response = await fetch(url, { headers: globalHeaders });
            if (response.status === 429) { await sleep(delay); delay *= 2; continue; }
            if (response.status === 401) { await renovarToken(); continue; }
            if (!response.ok) throw new Error("SKIP");
            return await response.json();
        } catch (error) {
            if (error.message === "SKIP") return null;
            await sleep(delay);
        }
    }
    return null;
}

// --- INFRAESTRUCTURA DE DATOS INTELIGENTE ---
async function inicializarInfraestructura() {
    console.log("🛠️  \x1b[36m[BigQuery] Verificando Data Warehouse...\x1b[0m");
    const dataset = bigquery.dataset(DATASET_ID);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists) await dataset.create();

    // Purgamos solo las tablas transaccionales necesarias (Nómina eliminada)
    const tablas = [
        {
            nombre: 'appointment_history',
            schema: `appointment_id STRING, date_time DATETIME, branch_name STRING, location_id STRING, barber_id STRING, barber_name STRING, client_id STRING, client_name STRING, service STRING, status STRING, is_addon BOOLEAN`,
            partition: `DATE(date_time)`, cluster: `branch_name, barber_name`
        },
        {
            nombre: 'sales_history',
            schema: `sale_id STRING, sale_datetime DATETIME, branch_name STRING, location_id STRING, client_id STRING, total_ticket FLOAT64, item_name STRING, amount FLOAT64, payment_method STRING, barber_credit_id STRING, is_product BOOLEAN`,
            partition: `DATE(sale_datetime)`, cluster: `branch_name`
        }
    ];

    // Si decidimos sincronizar catálogos, entonces SÍ los borramos y recreamos
    if (SYNC_CLIENTS) {
        tablas.push({ nombre: 'client_catalog', schema: `client_id STRING, first_name STRING, last_name STRING, email STRING, phone STRING, postal_code STRING`, partition: null, cluster: null });
    }
    if (SYNC_PRODUCTS) {
        tablas.push({ nombre: 'product_catalog', schema: `product_id STRING, barcode STRING, name STRING, price FLOAT64`, partition: null, cluster: null });
    }

    for (const t of tablas) {
        await bigquery.query(`DROP TABLE IF EXISTS \`${PROJECT_ID}.${DATASET_ID}.${t.nombre}\``);
        const partitionQuery = t.partition ? `PARTITION BY ${t.partition} CLUSTER BY ${t.cluster}` : '';
        await bigquery.query(`CREATE TABLE \`${PROJECT_ID}.${DATASET_ID}.${t.nombre}\` (${t.schema}) ${partitionQuery};`);
    }
    console.log("⏳ \x1b[33mSincronizando caché de BigQuery (5s)...\x1b[0m");
    await sleep(5000);
    console.log("✅ \x1b[32mInfraestructura operativa lista (Catálogos a salvo).\x1b[0m\n");
}

// --- BUCLE PRINCIPAL ---
(async () => {
    const startYear = 2015;
    const endYear = 2016;

    console.log(`========================================================`);
    console.log(`🚀 \x1b[36mINICIANDO BACKFILL GLOBAL OMNICANAL\x1b[0m`);
    console.log(`========================================================`);

    try {
        //await inicializarInfraestructura();
        await renovarToken();

        console.log("\n📦 \x1b[36mFASE 1: Verificando Catálogos...\x1b[0m");
        const locData = await fetchMindbody(`${MINDBODY_API}/site/locations`);
        const sessData = await fetchMindbody(`${MINDBODY_API}/site/sessiontypes`);

        const locationMap = new Map(locData?.Locations?.map(l => [l.Id, l.Name]) || []);
        const serviceMap = new Map(sessData?.SessionTypes?.map(s => [s.Id, s.Name]) || []);

        // --- CLIENTES ---
        process.stdout.write(`   👥 Clientes: `);
        if (SYNC_CLIENTS) {
            let cOffset = 0, cMore = true, allClients = [];
            while (cMore) {
                const cData = await fetchMindbody(`${MINDBODY_API}/client/clients?Limit=200&Offset=${cOffset}`);
                if (cData && cData.Clients && cData.Clients.length > 0) {
                    cData.Clients.forEach(c => allClients.push({
                        client_id: String(c.Id), first_name: c.FirstName || "", last_name: c.LastName || "",
                        email: c.Email || "", phone: c.MobilePhone || c.HomePhone || "", postal_code: c.PostalCode || ""
                    }));
                    cOffset += 200; process.stdout.write(`.`);
                } else { cMore = false; }
            }
            for (let i = 0; i < allClients.length; i += 5000) {
                await bigquery.dataset(DATASET_ID).table('client_catalog').insert(allClients.slice(i, i + 5000));
            }
            console.log(` \x1b[32m✅ ${allClients.length} perfiles actualizados.\x1b[0m`);
        } else {
            console.log(`\x1b[90m[Omitido por configuración - Conservando datos actuales]\x1b[0m`);
        }

        // --- PRODUCTOS ---
        process.stdout.write(`   🛍️  Productos: `);
        if (SYNC_PRODUCTS) {
            let pOffset = 0, pMore = true, allProducts = [];
            while (pMore) {
                const pData = await fetchMindbody(`${MINDBODY_API}/sale/products?Limit=200&Offset=${pOffset}`);
                if (pData && pData.Products && pData.Products.length > 0) {
                    pData.Products.forEach(p => allProducts.push({
                        product_id: String(p.Id), barcode: p.Barcode || "", name: p.Name || "", price: p.Price || 0
                    }));
                    pOffset += 200; process.stdout.write(`.`);
                } else { pMore = false; }
            }
            if (allProducts.length > 0) await bigquery.dataset(DATASET_ID).table('product_catalog').insert(allProducts);
            console.log(` \x1b[32m✅ ${allProducts.length} productos actualizados.\x1b[0m`);
        } else {
            console.log(`\x1b[90m[Omitido por configuración - Conservando datos actuales]\x1b[0m`);
        }

        let stats = { citas: 0, ventas: 0 };
        console.log("\n⏳ \x1b[36mFASE 2: COMENZANDO EXTRACCIÓN MES A MES...\x1b[0m");

        for (let year = startYear; year <= endYear; year++) {
            for (let month = 0; month < 12; month++) {
                if (year === new Date().getFullYear() && month > new Date().getMonth()) break;

                const yStr = year.toString();
                const mStr = String(month + 1).padStart(2, '0');
                const lastDayNum = new Date(year, month + 1, 0).getDate();

                const firstDay = `${yStr}-${mStr}-01`;
                const lastDay = `${yStr}-${mStr}-${String(lastDayNum).padStart(2, '0')}`;

                console.log(`\n📅 \x1b[36m[${yStr}-${mStr}]\x1b[0m Analizando: ${firstDay} al ${lastDay}`);

                // ==========================================
                // 1. CITAS
                // ==========================================
                process.stdout.write(`   ✂️  Citas: `);
                let apptOffset = 0, apptMore = true, monthAppts = [];
                while (apptMore) {
                    try {
                        const data = await fetchMindbody(`${MINDBODY_API}/appointment/staffappointments?StartDate=${firstDay}&EndDate=${lastDay}&Limit=200&Offset=${apptOffset}`);

                        let rawAppts = data?.Appointments || [];
                        if (rawAppts.length === 0 && data?.StaffMembers) {
                            data.StaffMembers.forEach(s => {
                                if (s.Appointments) {
                                    s.Appointments.forEach(a => {
                                        a.StaffId = a.StaffId || s.Id;
                                        a.Staff = a.Staff || { DisplayName: s.Name };
                                        rawAppts.push(a);
                                    });
                                }
                            });
                        }

                        if (rawAppts.length > 0) {
                            rawAppts.forEach(a => {
                                const mainAppt = {
                                    appointment_id: String(a.Id),
                                    date_time: bqDate(a.StartDateTime),
                                    branch_name: locationMap.get(a.LocationId) || "Unknown",
                                    location_id: a.LocationId?.toString() || "",
                                    barber_id: a.StaffId?.toString() || "",
                                    barber_name: a.Staff?.DisplayName || "Unknown",
                                    client_id: a.ClientId?.toString() || `walkin_${a.Id}`,
                                    client_name: `${a.Client?.FirstName || ""} ${a.Client?.LastName || ""}`.trim() || "Walk-In",
                                    service: serviceMap.get(a.SessionTypeId) || a.Program?.Name || "N/A",
                                    status: a.Status || "Unknown",
                                    is_addon: false
                                };
                                monthAppts.push(mainAppt);

                                if (a.AddOns) a.AddOns.forEach(addon => {
                                    monthAppts.push({ ...mainAppt, appointment_id: `${a.Id}_addon_${addon.Id}`, service: addon.Name, is_addon: true });
                                });
                            });
                            process.stdout.write(`.`);
                        }

                        if (rawAppts.length < 200) apptMore = false; else apptOffset += 200;
                    } catch (e) {
                        process.stdout.write(` \x1b[90m[Omitido]\x1b[0m`); apptMore = false;
                    }
                }

                // --- INYECCIÓN DE CITAS CON LOAD API ---
                if (monthAppts.length > 0) {
                    const tempFile = 'temp_appts.json';
                    fs.writeFileSync(tempFile, monthAppts.map(row => JSON.stringify(row)).join('\n'));
                    await bigquery.dataset(DATASET_ID).table('appointment_history').load(tempFile, { sourceFormat: 'NEWLINE_DELIMITED_JSON' });
                    fs.unlinkSync(tempFile);
                    stats.citas += monthAppts.length;
                    process.stdout.write(` \x1b[32m✅ +${monthAppts.length} (Load API)\x1b[0m\n`);
                } else {
                    process.stdout.write(` \x1b[90m(Sin datos)\x1b[0m\n`);
                }

                // ==========================================
                // 2. VENTAS (PRODUCTOS ARREGLADOS)
                // ==========================================
                process.stdout.write(`   🛒 Ventas: `);
                let salesOffset = 0, salesMore = true, monthSales = [];
                while (salesMore) {
                    try {
                        const url = `${MINDBODY_API}/sale/sales?StartSaleDateTime=${firstDay}T00:00:00&EndSaleDateTime=${lastDay}T23:59:59&Limit=200&Offset=${salesOffset}`;
                        const data = await fetchMindbody(url);
                        const sales = data?.Sales || [];

                        sales.forEach(s => {
                            const paymentMethod = s.Payments?.map(p => p.Type || p.Method).join(' + ') || "Desconocido";

                            if (s.PurchasedItems) s.PurchasedItems.forEach(item => {

                                // LA FÓRMULA EXACTA PARA PRODUCTOS VS SERVICIOS
                                const realItemName = item.Description || "Desconocido";
                                const isActuallyProduct = item.IsService === false;

                                monthSales.push({
                                    sale_id: `${s.Id}_${item.Id}`,
                                    sale_datetime: bqDate(s.SaleDateTime),
                                    branch_name: locationMap.get(s.LocationId) || "Unknown",
                                    location_id: String(s.LocationId),
                                    client_id: String(s.ClientId),
                                    total_ticket: s.PurchasedItems.reduce((acc, i) => acc + i.TotalAmount, 0),
                                    item_name: realItemName,
                                    amount: item.TotalAmount,
                                    payment_method: paymentMethod,
                                    barber_credit_id: String(item.ProviderId || ""),
                                    is_product: isActuallyProduct
                                });
                            });
                        });

                        if (sales.length > 0) process.stdout.write(`.`);
                        if (sales.length < 200) salesMore = false; else salesOffset += 200;
                    } catch (e) {
                        process.stdout.write(` \x1b[90m[Omitido]\x1b[0m`); salesMore = false;
                    }
                }

                // --- INYECCIÓN DE VENTAS CON LOAD API ---
                if (monthSales.length > 0) {
                    const tempFile = 'temp_sales.json';
                    fs.writeFileSync(tempFile, monthSales.map(row => JSON.stringify(row)).join('\n'));
                    await bigquery.dataset(DATASET_ID).table('sales_history').load(tempFile, { sourceFormat: 'NEWLINE_DELIMITED_JSON' });
                    fs.unlinkSync(tempFile);
                    stats.ventas += monthSales.length;
                    process.stdout.write(` \x1b[32m✅ +${monthSales.length} (Load API)\x1b[0m\n`);
                } else {
                    process.stdout.write(` \x1b[90m(Sin datos)\x1b[0m\n`);
                }

            }
        }

        console.log(`\n========================================================`);
        console.log(`🏁 \x1b[36mBACKFILL FINALIZADO CON ÉXITO\x1b[0m`);
        console.log(`   ✂️ Citas/Servicios: ${stats.citas}`);
        console.log(`   🛒 Ventas:        ${stats.ventas}`);
        console.log(`========================================================\n`);

    } catch (error) {
        console.error(`\n❌ \x1b[31mERROR CRÍTICO: ${error.message || "Error desconocido"}\x1b[0m`);
        // Esta línea revelará si BigQuery rechazó una fila o columna específica
        if (error.errors) console.error("Detalles de BigQuery:", JSON.stringify(error.errors, null, 2));
    }
})();