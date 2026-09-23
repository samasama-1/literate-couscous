import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { campaignSession, limitRequest } from '@/lib/campaigns/security';
import { attribution, record, uuid } from '@/lib/campaigns/validation';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({error:'Invalid origin'},{status:403});
  try {
    const session = await campaignSession();
    await limitRequest('events',240);
    const raw = await request.text();
    if (raw.length>4096) return NextResponse.json({error:'Event too large'},{status:413});
    const body = record(JSON.parse(raw));
    if (!['campaign_view','product_selected','intent_started'].includes(String(body.eventType))) throw new Error('Invalid event');
    const {error} = await supabaseAdmin.rpc('record_campaign_event',{p:{
      campaign_id:uuid(body.campaignId),product_id:body.campaignProductId ? uuid(body.campaignProductId) : null,
      session_id:session,event_type:String(body.eventType),metadata:attribution(body.metadata),
    }});
    if (error) return NextResponse.json({error:'Event unavailable'},{status:400});
    return NextResponse.json({ok:true});
  } catch { return NextResponse.json({error:'Event unavailable'},{status:400}); }
}
