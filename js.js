addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS

const HTML = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elysia 监控中心</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/map/js/world.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
  <style>
    body { 
      background: linear-gradient(135deg, #f0f4ff 0%, #e0eaff 50%, #c7d2fe 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #1d1d1f;
    }
    .glass {
      background: rgba(255,255,255,0.45);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255,255,255,0.6);
      box-shadow: 0 12px 40px rgba(0,0,0,0.08);
      border-radius: 32px;
    }
    .card-hover { transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.1); }
    .card-hover:hover { transform: translateY(-16px); box-shadow: 0 30px 60px rgba(99,102,241,0.2); }
    .ios-text { color: #1d1d1f; font-weight: 600; }
    .ios-light { color: #8e8e93; }
  </style>
</head>
<body class="min-h-screen">
  <div class="container mx-auto px-6 py-12 max-w-7xl">

    <div class="text-center mb-16">
      <h1 class="text-7xl md:text-8xl font-black ios-text mb-4 tracking-tight">Elysia Monitor</h1>
      <p class="text-2xl ios-light">全站实时监控中心</p>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
      <div class="glass p-10 text-center card-hover rounded-3xl">
        <div class="text-6xl mb-4">👀</div>
        <div class="text-5xl font-bold ios-text" id="today">0</div>
        <div class="text-xl ios-light mt-3">今日访问</div>
      </div>
      <div class="glass p-10 text-center card-hover rounded-3xl">
        <div class="text-6xl mb-4">🆕</div>
        <div class="text-5xl font-bold ios-text" id="newUsers">0</div>
        <div class="text-xl ios-light mt-3">今日新用户</div>
      </div>
      <div class="glass p-10 text-center card-hover rounded-3xl">
        <div class="text-6xl mb-4">🌍</div>
        <div class="text-5xl font-bold ios-text" id="total">0</div>
        <div class="text-xl ios-light mt-3">历史总访问</div>
      </div>
      <div class="glass p-10 text-center card-hover rounded-3xl bg-gradient-to-br from-green-50 to-emerald-50">
        <div class="text-6xl mb-4">🟢</div>
        <div class="text-5xl font-bold ios-text" id="online">0</div>
        <div class="text-xl ios-light mt-3">当前在线</div>
      </div>
    </div>

    <!-- 全球热力图 + 轨迹回放 -->
    <div class="glass rounded-3xl p-10 mb-12 card-hover">
      <div class="flex justify-between items-center mb-8">
        <h2 class="text-4xl font-bold ios-text flex items-center"><i class="ri-earth-line mr-4 text-5xl"></i>全球访问热力图 & 轨迹回放</h2>
        <div class="flex gap-4">
          <button onclick="toggleReplay()" class="px-8 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-2xl hover:shadow-2xl transition flex items-center gap-3">
            <i class="ri-play-fill text-2xl" id="playIcon"></i> <span id="playText">开始回放</span>
          </button>
          <button onclick="load()" class="px-8 py-4 bg-white/60 backdrop-blur rounded-2xl hover:bg-white/80 transition">刷新</button>
        </div>
      </div>
      <div id="globe" style="height:600px; border-radius: 24px; overflow:hidden"></div>
    </div>

    <!-- 实时日志 -->
    <div class="glass rounded-3xl p-10">
      <h2 class="text-3xl font-bold ios-text mb-8 flex items-center"><i class="ri-history-line mr-4 text-4xl"></i>实时访问记录</h2>
      <div id="list" class="space-y-6"></div>
    </div>
  </div>

  <script>
    let globe, isPlaying = false, replayTimer;

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();

      document.getElementById('today').textContent = data.stats.today.toLocaleString();
      document.getElementById('newUsers').textContent = data.stats.newUsers.toLocaleString();
      document.getElementById('total').textContent = data.stats.total.toLocaleString();
      document.getElementById('online').textContent = data.stats.online;

      renderLogs(data.logs);
      initGlobe(data.logs);
    }

    function initGlobe(logData) {
      if (!globe) globe = echarts.init(document.getElementById('globe'));

      const points = logData.map(l => ({
        name: l.ip,
        value: [getCoord(l.country)[0] + (Math.random()-0.5)*5, getCoord(l.country)[1] + (Math.random()-0.5)*5, Math.random()*10+5],
        time: l.timestamp
      }));

      globe.setOption({
        backgroundColor: 'transparent',
        globe: {
          baseTexture: 'https://cdn.jsdelivr.net/gh/apache/echarts-website@asf-site/examples/data-gl/asset/world.jpg',
          heightTexture: 'https://cdn.jsdelivr.net/gh/apache/echarts-website@asf-site/examples/data-gl/asset/bathymetry_bw_composite_4k.jpg',
          displacementScale: 0.1,
          shading: 'realistic',
          realisticMaterial: { roughness: 0.8, metalness: 0 },
          postEffect: { enable: true },
          light: { main: { intensity: 2 } },
          viewControl: { autoRotate: true, autoRotateSpeed: 8, distance: 200 }
        },
        series: [
          { type: 'scatter3D', coordinateSystem: 'globe', data: points, symbolSize: d => d.value[2], itemStyle: { color: '#8b5cf6', opacity: 0.9 } },
          { type: 'effectScatter', coordinateSystem: 'globe', data: points.slice(-30), symbolSize: 16, rippleEffect: { scale: 8 }, itemStyle: { color: '#f72585' } }
        ]
      });
    }

    function toggleReplay() {
      if (isPlaying) {
        clearInterval(replayTimer);
        isPlaying = false;
        document.getElementById('playIcon').className = 'ri-play-fill text-2xl';
        document.getElementById('playText').textContent = '开始回放';
      } else {
        isPlaying = true;
        document.getElementById('playIcon').className = 'ri-pause-fill text-2xl';
        document.getElementById('playText').textContent = '暂停回放';
        let i = 0;
        replayTimer = setInterval(() => {
          if (i >= logs.length) i = 0;
          const p = logs[i];
          globe.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: i });
          i++;
        }, 600);
      }
    }

    function renderLogs(logs) {
      document.getElementById('list').innerHTML = logs.slice(0,50).map(l => \`
        <div class="glass rounded-3xl p-8 hover:shadow-2xl transition">
          <div class="flex justify-between items-center">
            <div>
              <strong class="text-2xl ios-text">\${l.ip}</strong>
              <span class="ml-4 bg-indigo-100 text-indigo-700 px-5 py-2 rounded-full text-lg">\${l.country}</span>
              <span class="ml-2 bg-purple-100 text-purple-700 px-5 py-2 rounded-full text-lg">\${l.domain}</span>
            </div>
            <div class="text-lg ios-light">\${l.time}</div>
          </div>
          <div class="mt-4 text-xl ios-text">\${l.path}</div>
          <div class="text-base ios-light mt-2 truncate max-w-4xl">\${l.ua}</div>
        </div>
      \`).join('');
    }

    function getCoord(code) {
      const map = { CN:[104,35], US:[-100,40], SG:[103.8,1.3], JP:[139,35], HK:[114,22], GB:[-2,54], DE:[10,51], FR:[2,46], RU:[100,60], BR:[-55,-10] };
      return map[code] || [0,0];
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
      logs: logs
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // 记录日志
  const hostname = request.headers.get('host') || '';
  const isTarget = ['bestxuyi.us','deyingluxury.com','chinafamoustea.com','elysia.bestxuyi.us'].some(d => hostname===d || hostname.endsWith('.'+d));
  if (isTarget) {
    const logKey = \`log:\${Date.now()}_\${Math.random().toString(36).slice(2)}\`;
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