const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = 'https://spinzy-9pf.pages.dev/';
const LOGO_URL = 'https://cdn.phototourl.com/free/2026-09-11-2abdc136-4e35-420f-b6b8-a7b63893bcc9.png';

async function telegram(method, body) {
  if (!BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Telegram API error: ${response.status}`);
  return response.json();
}

function welcomeText(firstName) {
  return `🎉 Welcome to Spinzy, ${firstName || 'there'}!\n\n🎰 Spin. Earn. Repeat.\n\nYour first 5 FREE spins are waiting — worth $2.10 in total rewards! 💰\n\n🔥 After your free spins:\n🪙 Watch ads and earn coins\n🎯 Convert coins into more spins\n👥 Invite friends and earn extra spins\n💵 Cash out from just $3.00\n\nReady to start earning? 🚀\nTap the button below and let’s Spin!\n\n🎰 Spinzy — Spin. Earn. Repeat.`;
}

export async function handleUpdate(update) {
  const message = update?.message;
  if (!message?.text) return;

  const match = message.text.trim().match(/^\/start(?:\s+(.+))?$/i);
  if (!match) return;

  // Preserve the Telegram /start parameter for existing referral flows.
  const startParam = match[1] || null;

  await telegram('sendPhoto', {
    chat_id: message.chat.id,
    photo: LOGO_URL,
    caption: welcomeText(message.from?.first_name),
    reply_markup: {
      inline_keyboard: [[{
        text: '🎰 Open Spinzy',
        web_app: { url: WEB_APP_URL }
      }]]
    }
  });

  return { handled: true, startParam };
}
