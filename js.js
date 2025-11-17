addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS

const HTML = `<!DOCTYPE html>
<html lang="zh" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elysia 监控中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
  <style>
    body {
      background: linear-gradient(135deg, #f5f7ff 0%, #e0e7ff 50%, #c7d2fe 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .glass {
      background: rgba(255, 255, 255, 0.35);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.4);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
    }
    .card-hover {
      transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
    }
    .card-hover:hover {
      transform: translateY(-12px);
      box-shadow: 0 25px 50px rgba(99, 102, 241, 0.2);
    }
    .vibrancy {
      background: linear-gradient(145deg, rgba(255,255,255,0.4), rgba(255,255,255,0.1));
    }
    .ios-text { color: #1d1d1f; font-weight: 600; }
    .ios-light { color: #8e8e93; }
  </style>
</head>
<body class="min-h-screen">
  <div class="container mx-auto px-4 py-10 max-w-7xl">

    <!-- 标题 -->
    <div class="text-center mb-16">
      <h1 class="text-6xl md:text-8xl font-black ios-text mb-4 tracking-tight">Elysia Monitor</h1>
      <p class="text-2xl ios-light">全站实时监控中心</p>
    </div>

    <!-- 统计卡片（iOS 26 经典圆角毛玻璃） -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
      <div class="glass rounded-3xl p-8 text-center card-hover">
        <div class="text-5xl mb-4">👀</div>
        <div class="text-5xl font-bold ios-text" id="today">0</div>
        <div class="text-lg ios-light mt-2">今日访问</div>
      </div>
      <div class="glass rounded-3xl p-8 text-center card-hover">
        <div class="text-5xl mb-4">🆕</div>
        <div class="text-5xl font-bold ios-text" id="newUsers">0</div>
        <div class="text-lg ios-light mt-2">今日新用户</div>
      </div>
      <div class="glass rounded-3xl p-8 text-center card-hover">
        <div class="text-5xl mb-4">🌍</div>
        <div class="text-5xl font-bold ios-text" id="total">0</div>
        <div class="text-lg ios-light mt-2">历史总访问</div>
      </div>
      <div class="glass rounded-3xl p-8 text-center card-hover">
        <div class="text-5xl mb-4">🟢</div>
        <div class="text-5xl font-bold ios-text" id="online">0</div>
        <div class="text-lg ios-light mt-2">当前在线</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-10 mb-16">
      <!-- 国家分布 -->
      <div class="glass rounded-3xl p-10 card-hover">
        <h2 class="text-3xl font-bold ios-text mb-8 flex items-center">
          <i class="ri-earth-line text-4xl mr-4"></i>全球访客分布
        </h2>
        <canvas id="countryChart"></canvas>
      </div>
      <!-- 24小时趋势 -->
      <div class="glass rounded-3xl p-10 card-hover">
        <h2 class="text-3xl font-bold ios-text mb-8 flex items-center">
          <i class="ri-line-chart-line text-4xl mr-4"></i>24小时趋势
        </h2>
        <canvas id="trendChart"></canvas>
      </div>
    </div>

    <!-- 实时日志 -->
    <div class="glass rounded-3xl p-10">
      <div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-6">
        <h2 class="text-3xl font-bold ios-text flex items-center">
          <i class="ri-history-line text-4xl mr-4"></i>实时访问记录
        </h2>
        <div class="flex gap-4">
          <input type="text" id="search" placeholder="搜索任意内容…" class="px-6 py-4 glass rounded-2xl ios-text placeholder-ios-light focus:outline-none focus:ring-4 focus:ring-indigo-300 w-96">
          <button onclick="load()" class="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold rounded-2xl hover:shadow-2xl transition flex items-center gap-3">
            <i class="ri-refresh-line"></i>刷新
          </button>
        </div>
      </div>
      <div id="list" class="space-y-5"></div>
    </div>
  </div>

  <script>
    let chartCountry, chartTrend;

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();

      document.getElementById('today').textContent = data.stats.today.toLocaleString();
      document.getElementById('newUsers').textContent = data.stats.newUsers.toLocaleString();
      document.getElementById('total').textContent = data.stats.total.toLocaleString();
      document.getElementById('online').textContent = data.stats.online;

      if (chartCountry) chartCountry.destroy();
      chartCountry = new Chart(document.getElementById('countryChart'), {
        type: 'doughnut',
        data: { labels: Object.keys(data.country), datasets: [{ data: Object.values(data.country), backgroundColor: ['#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4'] }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 14 } } } } }
      });

      if (chartTrend) chartTrend.destroy();
      chartTrend = new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: { labels: data.trend.hours, datasets: [{ label: '访问量', data: data.trend.visits, borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', tension: 0.4, fill: true }] },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });

      document.getElementById('list').innerHTML = data.logs.map(l => \`
        <div class="glass rounded-3xl p-6 hover:shadow-xl transition">
          <div class="flex justify-between items-start flex-wrap gap-4">
            <div>
              <strong class="text-xl ios-text">\${l.ip}</strong>
              <span class="ml-3 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-full text-sm font-medium">\${l.country}</span>
              <span class="ml-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm font-medium">\${l.domain}</span>
            </div>
            <div class="text-sm ios-light">\${l.time}</div>
          </div>
          <div class="mt-3 text-gray-700 font-medium">\${l.path}</div>
          <div class="text-sm ios-light mt-2 truncate max-w-4xl">\${l.ua}</div>
        </div>
      \`).join('') || '<p class="text-center py-16 text-gray-400 text-xl">暂无访问记录 ~</p>';
    }

    function filter() {
      const q = document.getElementById('search').value.toLowerCase();
      document.querySelectorAll('#list > div').forEach(d => {
        d.style.display = d.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    load();
    setInterval(load, 8000);
  </script>
</body>
</html>`;

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/' || path === '/admin') {
    return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  if (path === '/api/all') {
    const { keys } = await LOG_KV.list({ limit: 1000 });
    const logs = [], countryMap = {}, hourMap = Array(24).fill(0);
    const today = new Date().toISOString().slice(0,10);
    const seenIPs = new Set(), todayIPs = new Set();

    for (const k of keys) {
      const data = await LOG_KV.get(k.name);
      if (!data) continue;
      const l = JSON.parse(data);
      logs.push(l);
      countryMap[l.country] = (countryMap[l.country] || 0) + 1;
      hourMap[new Date(l.timestamp).getHours()]++;
      if (Date.now() - l.timestamp < 5*60*1000) seenIPs.add(l.ip);
      if (l.time.startsWith(today)) todayIPs.add(l.ip);
    }

    logs.sort((a,b) => b.timestamp - a.timestamp);

    return new Response(JSON.stringify({
      stats: { today: logs.filter(l=>l.time.startsWith(today)).length, newUsers: todayIPs.size, total: logs.length, online: seenIPs.size },
      country: countryMap,
      trend: { hours: Array.from({length:24},(_,i)=>i+'时'), visits: hourMap },
      logs: logs.slice(0,200)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 记录日志
  const hostname = request.headers.get('host') || '';
  const isTarget = ['bestxuyi.us','deyingluxury.com','chinafamoustea.com','elysia.bestxuyi.us'].some(d => hostname===d || hostname.endsWith('.'+d));
  if (isTarget) {
    const logKey = `log:${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const logData = {
      ip: request.headers.get('cf-connecting-ip') || '未知',
      country: request.headers.get('cf-ipcountry') || 'XX',
      domain: hostname,
      path: url.pathname + url.search,
      ua: request.headers.get('user-agent') || '',
      time: new Date().toLocaleString('zh-CN'),
      timestamp: Date.now()
    };
    LOG_KV.put(logKey, JSON.stringify(logData), { expirationTtl: 60*60*24*30 });
  }

  return fetch(request);
}