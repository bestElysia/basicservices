addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const KV = BLOCKED_IPS

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>IP 封禁管理面板</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3498db;
      border-radius: 50%;
      width: 16px;
      height: 16px;
      animation: spin 1s linear infinite;
      display: inline-block;
      margin-left: 6px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    #list > div {
      transition: background 0.2s;
    }
  </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
  <div class="container mx-auto p-6 max-w-4xl">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-indigo-700 mb-2">IP 封禁管理面板</h1>
      <p class="text-gray-600">实时监控 · 永久封禁 · 一键解封</p>
    </div>

    <div class="bg-white rounded-xl shadow-lg p-6">
      <div class="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
        <h2 class="text-xl font-semibold text-gray-800">被封禁的 IP 地址</h2>
        <button onclick="load()" class="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition flex items-center">
          刷新列表
        </button>
      </div>

      <input type="text" id="search" placeholder="搜索 IP、国家或时间..." 
             class="w-full p-3 border border-gray-300 rounded-lg mb-5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
             onkeyup="filter()">

      <div id="list" class="space-y-3 text-sm"></div>
      <div id="empty" class="text-center text-gray-500 py-8 hidden">
        暂无被封禁的 IP 地址
      </div>
    </div>

    <div class="mt-6 text-center text-xs text-gray-500">
      Powered by Cloudflare Workers + KV
    </div>
  </div>

  <script>
    async function load() {
      const res = await fetch('/api/blocked');
      const data = await res.json();
      render(data);
    }

    function render(items) {
      const container = document.getElementById('list');
      const empty = document.getElementById('empty');
      
      if (items.length === 0) {
        container.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }

      empty.classList.add('hidden');
      container.innerHTML = items.map(item => \`
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
          <div class="flex-1 mb-3 sm:mb-0">
            <div class="flex items-center gap-2 flex-wrap">
              <strong class="text-lg font-mono text-indigo-700">\${item.ip}</strong>
              <span class="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs">\${item.country}</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">封禁时间: \${item.time}</p>
          </div>
          <button onclick="unblock('\${item.ip}')" 
                  class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition text-sm flex items-center">
            解封
          </button>
        </div>
      \`).join('');
    }

    async function unblock(ip) {
      if (!confirm(\`确定要解封 IP: \${ip}？\`)) return;
      
      const btn = event.target;
      const original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = \`解封中 <div class="spinner"></div>\`;

      try {
        await fetch('/api/unblock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip })
        });
        load();
      } catch (e) {
        alert('解封失败，请重试');
        btn.innerHTML = original;
        btn.disabled = false;
      }
    }

    function filter() {
      const query = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('#list > div').forEach(div => {
        const text = div.textContent.toLowerCase();
        div.style.display = text.includes(query) ? '' : 'none';
      });
    }

    // 自动加载 + 每10秒刷新
    load();
    setInterval(load, 10000);
  </script>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 首页或 /admin
  if (path === '/' || path === '/admin') {
    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // API: 获取封禁列表
  if (path === '/api/blocked') {
    const { keys } = await KV.list({ prefix: 'ip:' });
    const blocked = [];

    for (const key of keys) {
      const ip = key.name.slice(3);
      const { metadata } = await KV.getWithMetadata(key.name);
      blocked.push({
        ip,
        country: metadata?.country || 'XX',
        time: metadata?.blockedAt 
          ? new Date(metadata.blockedAt).toLocaleString('zh-CN', { 
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            })
          : '未知时间'
      });
    }

    // 按封禁时间倒序
    blocked.sort((a, b) => b.time.localeCompare(a.time));

    return new Response(JSON.stringify(blocked), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // API: 解封 IP
  if (path === '/api/unblock' && request.method === 'POST') {
    try {
      const { ip } = await request.json();
      if (!ip) throw new Error('IP required');
      await KV.delete(`ip:${ip}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Not Found', { status: 404 });
}
