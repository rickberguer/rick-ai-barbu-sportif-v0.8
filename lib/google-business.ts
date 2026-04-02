// lib/google-business.ts
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/business.manage'],
});

export async function getGoogleReviews() {
  const authClient = await auth.getClient();
  const accountId = process.env.GOOGLE_BUSINESS_ACCOUNT_ID;
  const locationId = process.env.GOOGLE_BUSINESS_LOCATION_ID;

  if (!accountId || !locationId) {
    throw new Error("Faltan IDs de Google Business en el entorno.");
  }

  // La API de GBP se consulta a través de este endpoint
  const url = `https://mybusinessreviews.googleapis.com/v1/accounts/${accountId}/locations/${locationId}/reviews`;
  
  const response = await authClient.request({ url });
  return response.data;
}