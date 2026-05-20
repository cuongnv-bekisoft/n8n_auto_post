const https = require('https');
require('dotenv').config();
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Gửi tin nhắn với 2 nút
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

// Lấy updates từ Telegram (long polling)
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

// Xóa tin nhắn cũ đi cho gọn
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

const { spawn } = require('child_process');
const http = require('http');

async function main() {
  console.log('Gửi tin nhắn hỏi...');

  const sent = await sendMessage('🖥️ Máy tính vừa khởi động!\n\nBạn có muốn bắt đầu chạy n8n tự động đăng bài không?', {
    inline_keyboard: [[
      { text: '✅ Bắt đầu ngay', callback_data: 'start' },
      { text: '❌ Không', callback_data: 'cancel' }
    ]]
  });

  console.log('Telegram response:', JSON.stringify(sent));

  if (!sent.ok) {
    console.error('Telegram lỗi:', sent.description);
    process.exit(1);
  }

  const messageId = sent.result.message_id;
  console.log('Đang chờ phản hồi...');

  // Poll chờ người dùng bấm nút, timeout 5 phút
  const startTime = Date.now();
  let offset = null;

  while (Date.now() - startTime < 5 * 60 * 1000) {
    const updates = await getUpdates(offset);

    if (updates.result && updates.result.length > 0) {
      for (const update of updates.result) {
        offset = update.update_id + 1;

        const cb = update.callback_query;
        if (cb && cb.data === 'start') {
          console.log('✅ Người dùng chọn Bắt đầu!');
          await deleteMessage(messageId);

          // Gửi xác nhận
          await sendMessage('⚙️ Đang khởi động n8n...');

          // Khởi động n8n
          spawn('cmd', ['/k', 'yarn n8n'], {
            detached: true,
            shell: true,
            stdio: 'ignore',
            cwd: 'D:\\n8n-app'
          }).unref();

          console.log('n8n đang khởi động, chờ 15 giây...');
          await sendMessage('⚙️ n8n đang khởi động, vui lòng chờ...');
          await new Promise(r => setTimeout(r, 15000));

          // Gọi webhook kích hoạt workflow
          await new Promise((resolve) => {
            http.get('http://localhost:5678/webhook/start-workflow', (res) => {
              console.log('Workflow triggered:', res.statusCode);
              resolve();
            }).on('error', (err) => {
              console.error('Webhook error:', err.message);
              resolve();
            });
          });

          await sendMessage('✅ Workflow đã bắt đầu chạy!');
          console.log('Xong!');
          process.exit(0);

        } else if (cb && cb.data === 'cancel') {
          console.log('❌ Người dùng hủy.');
          await deleteMessage(messageId);
          await sendMessage('👌 Đã hủy. Máy tính sẽ không chạy n8n.');
          process.exit(0);
        }
      }
    }
  }

  // Timeout 5 phút không bấm → tự hủy
  console.log('Timeout, không có phản hồi.');
  await deleteMessage(messageId);
  await sendMessage('⏰ Hết thời gian chờ (5 phút). n8n không được khởi động.');
  process.exit(0);
}

main().catch(console.error);