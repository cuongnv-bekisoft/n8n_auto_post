const http = require('http');
const { exec } = require('child_process');

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'POST' && req.url === '/shutdown') {
    console.log('Nhận lệnh shutdown, máy sẽ tắt sau 10 giây...');
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', message: 'Shutting down...' }));
    setTimeout(() => exec('shutdown /s /t 10'), 500);
  } else {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'running' }));
  }
}).listen(3001, () => {
  console.log('Shutdown server đang chạy tại http://localhost:3001');
});