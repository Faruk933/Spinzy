const BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const WEB_APP_URL = 'https://spinzy-9pf.pages.dev/';
const LOGO_URL = 'https://cdn.phototourl.com/free/2026-09-11-2abdc136-4e35-420f-b6b8-a7b63893bcc9.png';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-telegram-bot-api-secret-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function telegram(method: string, body: unknown) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Telegram API error: ${response.status}`);
  return response.json();
}

function welcomeText(firstName?: string) {
  return `🎉 Welcome to Spinzy, ${firstName || 'there'}!\n\n🎰 Spin. Earn. Repeat.\n\nYour first 5 FREE spins are waiting — worth $2.10 in total rewards! 💰\n\n🔥 After your free spins:\n🪙 Watch ads and earn coins\n🎯 Convert coins into more spins\n👥 Invite friends and earn extra spins\n💵 Cash out from just $3.00\n\nReady to start earning? 🚀\nTap the button below and let’s Spin!\n\n🎰 Spinzy — Spin. Earn. Repeat.`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405, headers: corsHeaders });

  try {
    const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
    if (secret) {
      const supplied = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
      if (supplied !== secret) return new Response('unauthorized', { status: 401 });
    }

    const update = await req.json();
    const message = update?.message;
    if (!message?.text) return new Response('ok', { headers: corsHeaders });

    const match = message.text.trim().match(/^\/start(?:\s+(.+))?$/i);
    if (!match) return new Response('ok', { headers: corsHeaders });

    const startParam = match[1] || null;
    await telegram('sendPhoto', {
      chat_id: message.chat.id,
      photo: LOGO_URL,
      caption: welcomeText(message.from?.first_name),
      reply_markup: {
        inline_keyboard: [[{
          text: '🎰 Open Spinzy',
          web_app: { url: WEB_APP_URL },
        }]],
      },
    });

    return new Response(JSON.stringify({ ok: true, handled: true, startParam }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'server_error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
