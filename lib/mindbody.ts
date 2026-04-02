// lib/mindbody.ts

const MINDBODY_API_URL = "https://api.mindbodyonline.com/public/v6";
// Zona horaria estricta para Quebec (evita que las citas de las 8 PM se registren al día siguiente en UTC)
const QUEBEC_TZ_OFFSET = "-05:00"; // Ajustar a -04:00 en horario de verano (EDT)

/**
 * Función central de autenticación con la API de Mindbody.
 * Obtiene el AccessToken fresco usando las credenciales del sistema.
 */
async function getMindbodyAuthHeaders() {
  const apiKey = process.env.MINDBODY_API_KEY;
  const username = process.env.MINDBODY_USERNAME;
  const password = process.env.MINDBODY_PASSWORD;
  const siteId = process.env.MINDBODY_SITE_ID;

  if (!apiKey || !username || !password || !siteId) {
    throw new Error("MINDBODY_API_KEY, MINDBODY_USERNAME, MINDBODY_PASSWORD or MINDBODY_SITE_ID environment variables are missing");
  }

  const loginRes = await fetch(`${MINDBODY_API_URL}/usertoken/issue`, {
    method: 'POST',
    headers: {
      'Api-Key': apiKey,
      'SiteId': siteId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Username: username, Password: password })
  });

  if (!loginRes.ok) {
    const errorText = await loginRes.text();
    throw new Error(`Fallo de autenticación con Mindbody (HTTP ${loginRes.status}): ${errorText}`);
  }

  const data = await loginRes.json();
  
  return {
    'Api-Key': apiKey,
    'SiteId': siteId,
    'Authorization': `Bearer ${data.AccessToken}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Función auxiliar paginada que recibe los headers ya autenticados
 */
async function fetchAllPaginated(endpoint: string, params: Record<string, string>, arrayName: string, headers: any) {
  let allData: any[] = [];
  let offset = 0;
  const limit = 200;

  while (true) {
    const urlParams = new URLSearchParams({
      ...params,
      Limit: limit.toString(),
      Offset: offset.toString()
    });

    const response = await fetch(`${MINDBODY_API_URL}${endpoint}?${urlParams.toString()}`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) throw new Error(`Mindbody HTTP Error (${endpoint}): ${response.status}`);

    const data = await response.json();
    const items = data[arrayName];

    if (!items || items.length === 0) break;

    allData = allData.concat(items);
    if (items.length < limit) break;
    offset += limit;
  }

  return allData;
}

export async function getLocations(): Promise<{ locationId: number; name: string; description: string; city: string; }[]> {
  try {
    const headers = await getMindbodyAuthHeaders();
    const response = await fetch(`${MINDBODY_API_URL}/site/locations`, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    if (!data.Locations) return [];

    return data.Locations.map((loc: any) => ({
      locationId: loc.Id,
      name: loc.Name,
      description: loc.Description || "",
      city: loc.City
    }));
  } catch (error: any) {
    console.error(`Mindbody Locations Error:`, error.message);
    throw new Error(`Could not fetch the location map.`);
  }
}

export async function getAppointments(startDate: string, endDate: string, locationId?: string, staffId?: string) {
  try {
    const headers = await getMindbodyAuthHeaders();
    
    const safeStartDate = `${startDate.split('T')[0]}T00:00:00${QUEBEC_TZ_OFFSET}`;
    const safeEndDate = `${endDate.split('T')[0]}T23:59:59${QUEBEC_TZ_OFFSET}`;

    const params: Record<string, string> = { StartDate: safeStartDate, EndDate: safeEndDate };
    if (locationId) params.LocationIds = locationId;
    if (staffId) params.StaffIds = staffId; // El Francotirador activado

    const allStaff = await fetchAllPaginated("/appointment/staffappointments", params, "StaffMembers", headers);
    const allAppointments: any[] = [];

    allStaff.forEach((staff: any) => {
      if (staff.Appointments) {
        staff.Appointments.forEach((appt: any) => {
          const mainService = {
            appointmentId: appt.Id,
            status: appt.Status,
            startDateTime: appt.StartDateTime,
            endDateTime: appt.EndDateTime,
            barberId: staff.Id,
            barberName: staff.Name,
            clientId: appt.Client?.Id || `walkin_${appt.Id}`,
            clientName: `${appt.Client?.FirstName || ''} ${appt.Client?.LastName || 'Walk-In'}`.trim(),
            serviceName: appt.Program?.Name || appt.SessionType?.Name || "Service not specified",
            locationId: appt.LocationId || locationId,
            isAddOn: false
          };
          allAppointments.push(mainService);

          if (appt.AddOns && appt.AddOns.length > 0) {
            appt.AddOns.forEach((addon: any) => {
              allAppointments.push({
                ...mainService,
                appointmentId: `${appt.Id}_addon_${addon.Id}`,
                serviceName: addon.Name,
                isAddOn: true
              });
            });
          }
        });
      }
    });

    return allAppointments;
  } catch (error: any) {
    throw new Error(`Could not fetch appointments: ${error.message}`);
  }
}

export async function getStaff(locationId?: string) {
  try {
    const headers = await getMindbodyAuthHeaders();
    const params: Record<string, string> = {};
    if (locationId) params.LocationIds = locationId;

    const allStaff = await fetchAllPaginated("/staff/staff", params, "StaffMembers", headers);
    if (allStaff.length === 0) return [];

    return allStaff
      .filter((staff: any) => staff.IsActive)
      .map((staff: any) => ({
        id: staff.Id,
        name: staff.Name,
        bio: staff.Bio,
      }));
  } catch (error: any) {
    throw new Error(`Could not fetch staff: ${error.message}`);
  }
}

export async function getSalesTransactions(startDate: string, endDate: string, locationId?: string, staffId?: string) {
  try {
    const headers = await getMindbodyAuthHeaders();
    
    const safeStartDate = `${startDate.split('T')[0]}T00:00:00${QUEBEC_TZ_OFFSET}`;
    const safeEndDate = `${endDate.split('T')[0]}T23:59:59${QUEBEC_TZ_OFFSET}`;

    // FIX: Variables de fecha exactas para ventas
    const params: Record<string, string> = { StartSaleDateTime: safeStartDate, EndSaleDateTime: safeEndDate };
    if (locationId) params.LocationId = locationId;

    const allSales = await fetchAllPaginated("/sale/sales", params, "Sales", headers);

    const detailedSales: any[] = [];

    allSales.forEach((sale: any) => {
      // Si Rick pide los datos de un barbero en específico, filtramos los items dentro del ticket
      const relevantItems = staffId 
        ? sale.PurchasedItems.filter((i: any) => String(i.ProviderId) === String(staffId))
        : sale.PurchasedItems;

      if (relevantItems && relevantItems.length > 0) {
        const items = relevantItems.map((item: any) => ({
          itemName: item.Name,
          amount: item.TotalAmount,
          barberCreditId: item.ProviderId || null, 
          isProduct: item.IsProduct 
        }));

        detailedSales.push({
          saleId: sale.Id,
          saleDateTime: sale.SaleDateTime,
          clientId: sale.ClientId,
          locationId: sale.LocationId,
          // Sumamos solo el dinero que le corresponde a este barbero, no todo el ticket ciegamente
          totalAttributedToBarber: items.reduce((sum: number, i: any) => sum + i.amount, 0),
          items: items
        });
      }
    });

    return { totalTickets: detailedSales.length, sales: detailedSales };
  } catch (error: any) {
    throw new Error(`Could not fetch sales report: ${error.message}`);
  }
}

export async function getBarberRetention(startDate: string, endDate: string, locationId?: string, staffId?: string) {
  try {
    const headers = await getMindbodyAuthHeaders();
    
    const safeStartDate = `${startDate.split('T')[0]}T00:00:00${QUEBEC_TZ_OFFSET}`;
    const safeEndDate = `${endDate.split('T')[0]}T23:59:59${QUEBEC_TZ_OFFSET}`;

    const params: Record<string, string> = { StartDate: safeStartDate, EndDate: safeEndDate };
    if (locationId) params.LocationIds = locationId;
    if (staffId) params.StaffIds = staffId;

    const allStaff = await fetchAllPaginated("/appointment/staffappointments", params, "StaffMembers", headers);

    const retentionByStaff: Record<string, { uniqueClients: Set<string>, totalServices: number }> = {};
    const validStatuses = ["Completed", "Arrived", "Confirmed", "LateCancelled"];

    allStaff.forEach((staff: any) => {
      const staffName = staff.Name;
      if (!retentionByStaff[staffName]) {
        retentionByStaff[staffName] = { uniqueClients: new Set(), totalServices: 0 };
      }

      if (staff.Appointments) {
        staff.Appointments.forEach((appt: any) => {
          if (!validStatuses.includes(appt.Status)) return;

          retentionByStaff[staffName].totalServices += 1;

          if (appt.AddOns && appt.AddOns.length > 0) {
            retentionByStaff[staffName].totalServices += appt.AddOns.length;
          }

          const safeClientId = appt.Client?.Id ? String(appt.Client.Id) : `walkin_${appt.Id}`;
          retentionByStaff[staffName].uniqueClients.add(safeClientId);
        });
      }
    });

    const result = Object.keys(retentionByStaff).map(staff => {
      const stats = retentionByStaff[staff];
      const uniqueCount = stats.uniqueClients.size;
      const totalServices = stats.totalServices;

      const retentionFactor = uniqueCount > 0 ? (totalServices / uniqueCount).toFixed(2) : "0.00";

      return {
        barberName: staff,
        totalServicesPerformed: totalServices,
        uniqueClients: uniqueCount,
        retentionFactor: parseFloat(retentionFactor)
      };
    });

    return result.filter(r => r.totalServicesPerformed > 0); 
  } catch (error: any) {
    throw new Error(`Could not calculate retention: ${error.message}`);
  }
}