addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const KV = BLOCKED_IPS
const LOG_KV = ACCESS_LOGS
const PASSWORD = '123456'  // 登录密码

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>访问监控面板</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    .tab { @apply px-4 py-2 rounded-t-lg font-medium transition; }
    .tab-active { @apply bg-white text-indigo-700 border border-b-0; }
    .tab-inactive { @apply bg-gray-200 text-gray-600 hover:bg-gray-300; }
    .log-item { @apply p-3 border-b hover:bg-gray-50 transition; }
    .checkbox { @apply w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500; }
  </style>
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
  <div class="container mx-auto p-6 max-w-6xl">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold text-indigo-700 mb-2">访问监控面板</h1>
      <p class="text-gray-600">实时统计 · 精准封禁 · 高效管理</p>
    </div>

    <!-- 登录提示 -->
    <div id="login" class="bg-white p-6 rounded-lg shadow mb-6">
      <h2 class="text-xl font-semibold mb-4">请输入密码</h2>
      <input type="password" id="pass" class="w-full p-2 border rounded mb-4" placeholder="密码">
      <button onclick="login()" class="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700">登录</button>
    </div>

    <!-- 主面板（登录后显示） -->
    <div id="main" class="hidden">
      <!-- 统计看板 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div class="bg-blue-100 p-4 rounded-lg text-center">
          <div id="todayVisits" class="text-2xl font-bold text-blue-700">0</div>
          <div class="text-sm text-gray-600">今日访问</div>
        </div>
        <div class="bg-red-100 p-4 rounded-lg text-center">
          <div id="todayBlocks" class="text-2xl font-bold text-red-700">0</div>
          <div class="text-sm text-gray-600">今日封禁</div>
        </div>
        <div class="bg-yellow-100 p-4 rounded-lg text-center">
          <div id="totalBlocks" class="text-2xl font-bold text-yellow-700">0</div>
          <div class="text-sm text-gray-600">总封禁</div>
        </div>
        <div class="bg-green-100 p-4 rounded-lg text-center">
          <div id="onlineUsers" class="text-2xl font-bold text-green-700">0</div>
          <div class="text-sm text-gray-600">在线用户</div>
        </div>
      </div>

      <!-- 标签页 -->
      <div class="flex gap-1 mb-6 bg-gray-200 p-1 rounded-t-lg">
        <button onclick="showTab('stats')" id="tab-stats" class="tab tab-active">统计图表</button>
        <button onclick="showTab('blocked')" id="tab-blocked" class="tab tab-inactive">被封禁 IP</button>
        <button onclick="showTab('normal')" id="tab-normal" class="tab tab-inactive">正常访问</button>
      </div>

      <!-- 统计图表 -->
      <div id="stats-panel" class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-xl font-semibold mb-4">24 小时访问趋势</h2>
        <canvas id="chart" height="100"></canvas>
      </div>

      <!-- 被封禁列表 -->
      <div id="blocked-panel" class="bg-white rounded-lg shadow p-6 hidden">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">被封禁的 IP 地址</h2>
          <div>
            <button onclick="batchUnblock()" class="bg-red-600 text-white px-4 py-2 rounded mr-2">批量解封</button>
            <button onclick="exportCSV('blocked')" class="bg-green-600 text-white px-4 py-2 rounded">导出 CSV</button>
          </div>
        </div>
        <input type="text" id="search-blocked" placeholder="搜索 IP、国家、城市" class="w-full p-2 border rounded mb-4" onkeyup="filter('blocked')">
        <div id="blocked-list" class="space-y-2 text-sm"></div>
        <div id="blocked-pagination" class="mt-4 text-center"></div>
      </div>

      <!-- 正常访问记录 -->
      <div id="normal-panel" class="bg-white rounded-lg shadow p-6 hidden">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">最近正常访问（分页）</h2>
          <button onclick="exportCSV('normal')" class="bg-green-600 text-white px-4 py-2 rounded">导出 CSV</button>
        </div>
        <input type="text" id="search-normal" placeholder="搜索 IP、路径、UA" class="w-full p-2 border rounded mb-4" onkeyup="filter('normal')">
        <div id="normal-list" class="space-y-2 text-xs font-mono"></div>
        <div id="normal-pagination" class="mt-4 text-center"></div>
      </div>
    </div>
  </div>

  <script>
    let blockedData = [], normalData = [], stats = {}, page = { blocked: 1, normal: 1 }, perPage = 50;

    function login() {
      if (document.getElementById('pass').value === '123456') {
        document.getElementById('login').classList.add('hidden');
        document.getElementById('main').classList.remove('hidden');
        init();
      } else {
        alert('密码错误');
      }
    }

    async function init() {
      await Promise.all([loadStats(), loadBlocked(), loadNormal()]);
      renderChart();
      setInterval(() => { loadStats(); loadBlocked(); loadNormal(); }, 30000);
    }

    async function loadStats() {
      const res = await fetch('/api/stats');
      stats = await res.json();
      document.getElementById('todayVisits').textContent = stats.todayVisits;
      document.getElementById('todayBlocks').textContent = stats.todayBlocks;
      document.getElementById('totalBlocks').textContent = stats.totalBlocks;
      document.getElementById('onlineUsers').textContent = stats.onlineUsers;
    }

    async function loadBlocked() {
      const res = await fetch('/api/blocked');
      blockedData = await res.json();
      renderBlocked();
    }

    async function loadNormal(pageNum = 1) {
      const res = await fetch('/api/normal?page=' + pageNum + '&limit=' + perPage);
      const data = await res.json();
      normalData = data.items;
      page.normal = pageNum;
      renderNormal();
      renderPagination('normal', data.total);
    }

    function renderBlocked() {
      const start = (page.blocked - 1) * perPage;
      const items = blockedData.slice(start, start + perPage);
      let html = '';
      for (const b of items) {
        html += \`<div class="flex items-center justify-between p-3 bg-red-50 rounded log-item">
          <label class="flex items-center flex-1 cursor-pointer">
            <input type="checkbox" value="\${b.ip}" class="checkbox mr-3">
            <div>
              <strong class="text-red-700">\${b.ip}</strong> 
              <span class="text-gray-600">(\${b.country})</span>
              <span class="text-xs block text-gray-500">\${b.location}</span>
              <span class="text-xs block text-gray-400">封禁于 \${b.time}</span>
            </div>
          </label>
          <button onclick="unblock('\${b.ip}')" class="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">
            解封
          </button>
        </div>\`;
      }
      document.getElementById('blocked-list').innerHTML = html || '<p class="text-gray-500 text-center">暂无封禁</p>';
      renderPagination('blocked', blockedData.length);
    }

    function renderNormal() {
      let html = '';
      for (const n of normalData) {
        html += \`<div class="log-item">
          <div class="flex justify-between text-xs">
            <span><strong>\${n.ip}</strong> (\${n.country})</span>
            <span class="text-gray-500">\${n.time}</span>
          </div>
          <div>\${n.path}</div>
          <div class="text-gray-600 truncate">\${n.ua}</div>
        </div>\`;
      }
      document.getElementById('normal-list').innerHTML = html || '<p class="text-gray-500 text-center">暂无记录</p>';
    }

    function renderPagination(type, total) {
      const pages = Math.ceil(total / perPage);
      const container = document.getElementById(type + '-pagination');
      let html = '';
      for (let i = 1; i <= pages; i++) {
        html += \`<button onclick="load\${type.charAt(0).toUpperCase() + type.slice(1)}(\${i})" class="mx-1 px-3 py-1 rounded \${i === page[type] ? 'bg-indigo-600 text-white' : 'bg-gray-200'}">\${i}</button>\`;
      }
      container.innerHTML = html;
    }

    async function unblock(ip) {
      if (!confirm(\`解封 \${ip}？\`)) return;
      await fetch('/api/unblock', { method: 'POST', body: JSON.stringify({ ip }), headers: { 'Content-Type': 'application/json' } });
      loadBlocked();
    }

    async function batchUnblock() {
      const checked = Array.from(document.querySelectorAll('#blocked-list input:checked')).map(c => c.value);
      if (checked.length === 0) return alert('请选择要解封的 IP');
      if (!confirm(\`批量解封 \${checked.length} 个 IP？\`)) return;
      await Promise.all(checked.map(ip => fetch('/api/unblock', { method: 'POST', body: JSON.stringify({ ip }), headers: { 'Content-Type': 'application/json' } })));
      loadBlocked();
    }

    function exportCSV(type) {
      const data = type === 'blocked' ? blockedData : normalData;
      const headers = type === 'blocked' ? ['IP', '国家', '城市', '运营商', '封禁时间'] : ['IP', '国家', '路径', 'UA', '时间'];
      const rows = data.map(d => type === 'blocked' 
        ? [d.ip, d.country, d.city || '', d.isp || '', d.time]
        : [d.ip, d.country, d.path, d.ua, d.time]
      );
      const csv = [headers, ...rows].map(r => r.join(',')).join('\\n');
      const blob = new Blob(['\\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = \`\${type}_\${new Date().toISOString().slice(0,10)}.csv\`;
      a.click();
    }

    function filter(type) {
      const q = document.getElementById('search-' + type).value.toLowerCase();
      document.querySelectorAll('#' + type + '-list > div').forEach(div => {
        div.style.display = div.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    function showTab(tab) {
      ['stats', 'blocked', 'normal'].forEach(t => {
        document.getElementById(t + '-panel').classList.toggle('hidden', t !== tab);
        document.getElementById('tab-' + t).classList.toggle('tab-active', t === tab);
        document.getElementById('tab-' + t).classList.toggle('tab-inactive', t !== tab);
      });
      if (tab === 'stats') renderChart();
      if (tab === 'blocked') loadBlocked();
      if (tab === 'normal') loadNormal();
    }

    let chart;
    async function renderChart() {
      const res = await fetch('/api/chart');
      const data = await res.json();
      if (chart) chart.destroy();
      chart = new Chart(document.getElementById('chart'), {
        type: 'line',
        data: {
          labels: data.hours,
          datasets: [{
            label: '访问次数',
            data: data.visits,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true
          }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
      });
    }

    String.prototype.capitalize = function() { return this.charAt(0).toUpperCase() + this.slice(1); };
  </script>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // 登录检查
  if (path !== '/' && path !== '/admin' && request.headers.get('x-panel-pass') !== PASSWORD) {
    return new Response('Forbidden', { status: 403 });
  }

  if (path === '/' || path === '/admin') {
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // API: 统计
  if (path === '/api/stats') {
    const today = new Date().toISOString().slice(0, 10);
    const { keys: blockedKeys } = await KV.list();
    const { keys: logKeys } = await LOG_KV.list({ limit: 1000 });
    const todayVisits = logKeys.filter(k => k.name.includes(today)).length;
    const todayBlocks = blockedKeys.filter(k => {
      const { metadata } = KV.getWithMetadata(k.name);
      return metadata?.blockedAt?.startsWith(today);
    }).length;
    return new Response(JSON.stringify({
      todayVisits,
      todayBlocks,
      totalBlocks: blockedKeys.length,
      onlineUsers: new Set(logKeys.map(k => k.name.split('_')[0])).size
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // API: 封禁列表（带归属地）
  if (path === '/api/blocked') {
    const { keys } = await KV.list();
    const list = [];
    for (const k of keys) {
      if (k.name.startsWith('ip:')) {
        const ip = k.name.slice(3);
        const { metadata } = await KV.getWithMetadata(k.name);
        const loc = await getLocation(ip);
        list.push({
          ip, country: metadata?.country || 'XX',
          city: loc.city, isp: loc.isp,
          time: metadata?.blockedAt ? new Date(metadata.blockedAt).toLocaleString('zh-CN') : '未知',
          location: \`\${loc.city || '未知城市'}, \${loc.isp || '未知运营商'}\`
        });
      }
    }
    return new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } });
  }

  // API: 正常访问（分页）
  if (path === '/api/normal') {
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const { keys } = await LOG_KV.list({ limit: 1000 });
    const logs = [];
    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (data) logs.push(JSON.parse(data));
    }
    logs.sort((a, b) => b.timestamp - a.timestamp);
    const total = logs.length;
    const items = logs.slice((page - 1) * limit, page * limit);
    return new Response(JSON.stringify({ items, total }), { headers: { 'Content-Type': 'application/json' } });
  }

  // API: 解封
  if (path === '/api/unblock' && request.method === 'POST') {
    const { ip } = await request.json();
    await KV.delete(`ip:${ip}`);
    return new Response(JSON.stringify({ success: true }));
  }

  // API: 图表数据
  if (path === '/api/chart') {
    const hours = Array.from({ length: 24 }, (_, i) => \`\${i}:00\`);
    const visits = Array(24).fill(0);
    const { keys } = await LOG_KV.list({ limit: 1000 });
    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (data) {
        const d = JSON.parse(data);
        const h = new Date(d.timestamp).getHours();
        visits[h]++;
      }
    }
    return new Response(JSON.stringify({ hours, visits }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response('404', { status: 404 });
}

// IP 归属地查询
async function getLocation(ip) {
  try {
    const res = await fetch(\`http://ip-api.com/json/\${ip}?fields=city,isp,org,country\`);
    return await res.json();
  } catch {
    return { city: '未知', isp: '未知', org: '未知', country: 'XX' };
  }
}