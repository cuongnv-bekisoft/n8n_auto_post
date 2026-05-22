const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const path = require('path');
require('dotenv').config({
  path: require('path').join(__dirname, '.env'),
  override: true
});
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

function sendMessage(text, replyMarkup) {
  const body = JSON.stringify({
    chat_id: CHAT_ID,
    text,
    reply_markup: replyMarkup
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getUpdates(offset) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/getUpdates?timeout=30&offset=${offset || ''}`,
      method: 'GET'
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

function deleteMessage(messageId) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ chat_id: CHAT_ID, message_id: messageId });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/deleteMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', resolve);
    req.write(body);
    req.end();
  });
}

async function askShutdown(message) {
  const sent = await sendMessage(message, {
  inline_keyboard: [[
    { text: '🛑 Tắt máy', callback_data: 'shutdown' },
    { text: '▶️ Tiếp tục', callback_data: 'cancel' }
  ]]
});

  if (!sent.ok) {
    console.error('Telegram lỗi:', sent.description);
    return;
  }

  const messageId = sent.result.message_id;
  const startTime = Date.now();
  let offset = null;

  while (Date.now() - startTime < 10 * 60 * 1000) {
    const updates = await getUpdates(offset);

    if (updates.result && updates.result.length > 0) {
      for (const update of updates.result) {
        offset = update.update_id + 1;

        const cb = update.callback_query;
        if (cb && cb.data === 'shutdown') {
          await deleteMessage(messageId);
          await sendMessage('🛑 Máy sẽ tắt sau 10 giây...');
          exec('shutdown /s /f /t 10', (err, stdout, stderr) => {
            console.log(err);
            console.log(stdout);
            console.log(stderr);
          });
          return;
        } else if (cb && cb.data === 'cancel') {
          await deleteMessage(messageId);
          await sendMessage('👌 OK, máy vẫn chạy bình thường.');
          return;
        }
      }
    }
  }

  // Timeout 10 phút không bấm
  await deleteMessage(messageId);
  await sendMessage('⏰ Hết thời gian chờ, máy vẫn tiếp tục chạy.');
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method === 'POST' && req.url === '/shutdown') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    const { exec } = require('child_process');

    exec('shutdown /s /f /t 10', (err, stdout, stderr) => {
      console.log(err);
      console.log(stdout);
      console.log(stderr);
    });

  } else if (req.method === 'POST' && req.url === '/ask-shutdown') {
  let body = '';

  req.on('data', chunk => body += chunk);

  req.on('end', async () => {
    let status = null;

    try {
      const parsed = JSON.parse(body);
      status = parsed.status;
    } catch (e) {}

    let message;

    if (status === 'done') {
      message = '✅ Đã hoàn thành đăng bài.\n\nBạn có muốn tiếp tục hay tắt máy?';
    } else {
      message = '❌ N8N đã bị lỗi.\n\nBạn có muốn tiếp tục hay tắt máy?';
    }

    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));

    askShutdown(message).catch(console.error);
  });
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'running' }));
  }
}).listen(3001, () => {
  console.log('Shutdown server đang chạy tại http://localhost:3001');
});