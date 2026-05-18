'use server';

import 'server-only';

// ─── Zoho CRM Integration ───
// This module handles syncing order data to Zoho CRM as Contacts and Deals.
//
// SETUP INSTRUCTIONS:
// 1. Go to https://api-console.zoho.com/ and create a "Self Client" application
// 2. Generate a refresh token with the following scopes:
//    - ZohoCRM.modules.contacts.CREATE
//    - ZohoCRM.modules.contacts.UPDATE
//    - ZohoCRM.modules.deals.CREATE
//    - ZohoCRM.modules.deals.UPDATE
// 3. Add the following to your .env.local:
//    - ZOHO_CLIENT_ID=your_client_id
//    - ZOHO_CLIENT_SECRET=your_client_secret
//    - ZOHO_REFRESH_TOKEN=your_refresh_token
//    - ZOHO_API_DOMAIN=https://www.zohoapis.com (or .com.sg for SG data center)

const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_API_DOMAIN = process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com';
const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com';

function isZohoConfigured(): boolean {
  return !!(ZOHO_CLIENT_ID && ZOHO_CLIENT_SECRET && ZOHO_REFRESH_TOKEN);
}

/**
 * Fetches a fresh access token from Zoho using the stored refresh token.
 */
async function getAccessToken(): Promise<string | null> {
  if (!isZohoConfigured()) return null;

  try {
    const res = await fetch(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ZOHO_CLIENT_ID!,
        client_secret: ZOHO_CLIENT_SECRET!,
        refresh_token: ZOHO_REFRESH_TOKEN!,
      }),
    });

    const data = await res.json();
    if (data.access_token) return data.access_token;

    console.error('[Zoho] Failed to get access token:', data);
    return null;
  } catch (err) {
    console.error('[Zoho] Token request failed:', err);
    return null;
  }
}

/**
 * Upserts a Contact in Zoho CRM based on the customer's email.
 * If a contact with the same email exists, it updates it. Otherwise, it creates a new one.
 */
export async function syncContactToZoho(customer: {
  name: string;
  phone: string;
  email: string;
}) {
  if (!isZohoConfigured()) {
    console.log('[Zoho] Skipped — not configured.');
    return null;
  }

  const token = await getAccessToken();
  if (!token) return null;

  // Split name into first/last for Zoho
  const nameParts = customer.name.trim().split(' ');
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || firstName; // Zoho requires Last_Name

  try {
    const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v5/Contacts/upsert`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{
          First_Name: firstName,
          Last_Name: lastName,
          Phone: customer.phone,
          Email: customer.email,
          Lead_Source: 'Sama Sama Platform',
        }],
        duplicate_check_fields: ['Email'],
      }),
    });

    const data = await res.json();
    if (data.data?.[0]?.status === 'success') {
      console.log('[Zoho] Contact synced:', customer.email);
      return data.data[0].details.id;
    }

    console.error('[Zoho] Contact sync failed:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[Zoho] Contact sync error:', err);
    return null;
  }
}

/**
 * Creates a Deal in Zoho CRM linked to a Contact, representing an order.
 */
export async function syncOrderToZoho(order: {
  orderCode: string;
  productName: string;
  quantity: number;
  depositAmount: number;
  customerEmail: string;
  contactId?: string | null;
}) {
  if (!isZohoConfigured()) {
    console.log('[Zoho] Skipped — not configured.');
    return null;
  }

  const token = await getAccessToken();
  if (!token) return null;

  try {
    const dealData: Record<string, unknown> = {
      Deal_Name: `${order.orderCode} — ${order.productName}`,
      Stage: 'Deposit Pending',
      Amount: order.depositAmount * order.quantity,
      Description: `Order Code: ${order.orderCode}\nProduct: ${order.productName}\nQuantity: ${order.quantity}`,
    };

    // Link to Contact if we have the Zoho Contact ID
    if (order.contactId) {
      dealData.Contact_Name = { id: order.contactId };
    }

    const res = await fetch(`${ZOHO_API_DOMAIN}/crm/v5/Deals`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [dealData] }),
    });

    const data = await res.json();
    if (data.data?.[0]?.status === 'success') {
      console.log('[Zoho] Deal created:', order.orderCode);
      return data.data[0].details.id;
    }

    console.error('[Zoho] Deal creation failed:', JSON.stringify(data));
    return null;
  } catch (err) {
    console.error('[Zoho] Deal creation error:', err);
    return null;
  }
}

/**
 * Updates a Deal's stage in Zoho CRM when an order is verified.
 */
export async function updateDealStageInZoho(orderCode: string, newStage: string) {
  if (!isZohoConfigured()) return null;

  const token = await getAccessToken();
  if (!token) return null;

  try {
    // Search for the deal by name (contains order code)
    const searchRes = await fetch(
      `${ZOHO_API_DOMAIN}/crm/v5/Deals/search?criteria=(Deal_Name:starts_with:${orderCode})`,
      {
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` },
      }
    );

    const searchData = await searchRes.json();
    const dealId = searchData.data?.[0]?.id;
    if (!dealId) {
      console.log('[Zoho] Deal not found for order:', orderCode);
      return null;
    }

    // Update the deal stage
    const updateRes = await fetch(`${ZOHO_API_DOMAIN}/crm/v5/Deals`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{ id: dealId, Stage: newStage }],
      }),
    });

    const updateData = await updateRes.json();
    if (updateData.data?.[0]?.status === 'success') {
      console.log('[Zoho] Deal stage updated to:', newStage);
      return dealId;
    }

    console.error('[Zoho] Deal update failed:', JSON.stringify(updateData));
    return null;
  } catch (err) {
    console.error('[Zoho] Deal update error:', err);
    return null;
  }
}
