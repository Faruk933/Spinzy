import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function hmac(key: Uint8Array | string, data: string) {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data)));
}

async function validateTelegramInitData(initData: string) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!botToken) throw new Error('telegram_bot_token_not_configured');

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const userJson = params.get('user');
  if (!receivedHash || !authDate || !userJson) throw new Error('invalid_telegram_init_data');

  const age = Math.floor(Date.now() / 1000) - authDate;
  if (age < -60 || age > 86400) throw new Error('telegram_init_data_expired');

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = await hmac('WebAppData', botToken);
  const calculatedHash = bytesToHex(await hmac(secretKey, dataCheckString));
  if (!constantTimeEqual(calculatedHash, receivedHash)) throw new Error('telegram_init_data_invalid');

  let user;
  try { user = JSON.parse(userJson); } catch { throw new Error('telegram_user_invalid'); }
  if (!user?.id) throw new Error('telegram_user_missing');
  return { user, startParam: params.get('start_param') ?? null };
}

async function getUser(initData: string) {
  const { user, startParam } = await validateTelegramInitData(initData);
  let referrerTelegramId: number | null = null;
  if (startParam) {
    const match = startParam.match(/^ref_(\d+)$/) ?? startParam.match(/^(\d+)$/);
    if (match) referrerTelegramId = Number(match[1]);
  }

  const { data, error } = await supabase.rpc('spinzy_create_or_get_user', {
    p_telegram_id: Number(user.id),
    p_username: user.username ?? null,
    p_first_name: user.first_name ?? null,
    p_last_name: user.last_name ?? null,
    p_referrer_telegram_id: referrerTelegramId,
  });
  if (error) throw error;
  return data;
}

function mapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const known = new Set([
    'telegram_bot_token_not_configured','invalid_telegram_init_data','telegram_init_data_expired','telegram_init_data_invalid','telegram_user_invalid','telegram_user_missing',
    'user_not_found','no_free_spins_remaining','insufficient_coins','coins_per_spin_setting_missing','no_spins_available','normal_spin_settings_invalid',
    'invalid_idempotency_key','cashout_below_minimum','insufficient_balance',
  ]);
  return { message: known.has(message) ? message : 'server_error', detail: message };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const initData = body?.initData;
    if (typeof action !== 'string' || typeof initData !== 'string') return json({ error: 'action_and_initData_required' }, 400);

    const user = await getUser(initData);

    if (action === 'auth' || action === 'profile') {
      return json({ user: { id: user.id, telegram_id: user.telegram_id, username: user.username, first_name: user.first_name, last_name: user.last_name, balance: user.balance, coins: user.coins, spins: user.spins, free_spins_remaining: user.free_spins_remaining } });
    }

    let result;
    if (action === 'claim-free-spin') {
      const { data, error } = await supabase.rpc('spinzy_claim_free_spin', { p_user_id: user.id });
      if (error) throw error;
      result = data;
    } else if (action === 'convert-coins-to-spin') {
      const { data, error } = await supabase.rpc('spinzy_convert_coins_to_spin', { p_user_id: user.id });
      if (error) throw error;
      result = data;
    } else if (action === 'spin') {
      const { data, error } = await supabase.rpc('spinzy_spin', { p_user_id: user.id });
      if (error) throw error;
      result = data;
    } else if (action === 'request-cashout') {
      const { data, error } = await supabase.rpc('spinzy_request_cashout', {
        p_user_id: user.id,
        p_amount: Number(body.amount),
        p_method: String(body.method ?? ''),
        p_destination: String(body.destination ?? ''),
        p_idempotency_key: String(body.idempotencyKey ?? ''),
      });
      if (error) throw error;
      result = data;
    } else {
      return json({ error: 'unknown_action' }, 400);
    }

    return json({ ok: true, result });
  } catch (error) {
    const mapped = mapError(error);
    const status = mapped.message === 'server_error' ? 500 : 400;
    return json({ error: mapped.message, ...(status === 500 ? {} : { detail: mapped.detail }) }, status);
  }
});
