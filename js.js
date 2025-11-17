addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const LOG_KV = ACCESS_LOGS

const HTML = `<!DOCTYPE html>
<html lang="zh" oncontextmenu="return false" onselectstart="return false">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Elysia · 全球实时监控</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts-gl@2.0.9/dist/echarts-gl.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/map/js/world.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/remixicon@4.1.0/fonts/remixicon.css" rel="stylesheet">
  <style>
    body { background: linear-gradient(135deg, #0f0c29, #302b63, #24243e); color: #fff; font-family: -apple-system, sans-serif; }
    .glass { background: rgba(255,255,255,0.08); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); }
    .card { transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    .card:hover { transform: translateY(-20px) scale(1.02); }
    .glow { box-shadow: 0 0 40px rgba(139,92,246,0.6); }
    .pulse { animation: pulse 3s infinite; }
    @keyframes pulse { 0%,100% { opacity: 0.8; } 50% { opacity: 1; } }
  </style>
</head>
<body class="min-h-screen" onkeydown="return false">
  <div class="container mx-auto px-6 py-12 max-w-7xl">

    <div class="text-center mb-16">
      <h1 class="text-7xl font-black bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">Elysia Global Monitor</h1>
      <p class="text-2xl opacity-80">实时 · 全球 · 轨迹回放</p>
    </div>

    <!-- 统计 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
      <div class="glass rounded-3xl p-10 text-center card glow"><div class="text-6xl mb-4">🌐</div><div class="text-5xl font-bold" id="today">0</div><div class="text-xl mt-3">今日访问</div></div>
      <div class="glass rounded-3xl p-10 text-center card"><div class="text-6xl mb-4">🆕</div><div class="text-5xl font-bold" id="newUsers">0</div><div class="text-xl mt-3">新用户</div></div>
      <div class="glass rounded-3xl p-10 text-center card"><div class="text-6xl mb-4">🔥</div><div class="text-5xl font-bold" id="total">0</div><div class="text-xl mt-3">总访问</div></div>
      <div class="glass rounded-3xl p-10 text-center card pulse"><div class="text-6xl mb-4">🟢</div><div class="text-5xl font-bold" id="online">0</div><div class="text-xl mt-3">在线</div></div>
    </div>

    <!-- 全球热力图 + 轨迹回放 -->
    <div class="glass rounded-3xl p-10 mb-12 glow">
      <div class="flex justify-between items-center mb-8">
        <h2 class="text-4xl font-bold">全球访问热力图 & 轨迹回放</h2>
        <div class="flex gap-4">
          <button onclick="toggleReplay()" class="px-8 py-4 bg-gradient-to-r from-green-500 to-teal-500 rounded-2xl hover:shadow-2xl transition flex items-center gap-3">
            <i class="ri-play-fill text-2xl" id="playIcon"></i> <span id="playText">开始回放</span>
          </button>
          <button onclick="load()" class="px-6 py-4 bg-white/20 rounded-2xl hover:bg-white/30 transition">刷新</button>
        </div>
      </div>
      <div id="globe" style="height:600px"></div>
    </div>

    <!-- 实时日志 -->
    <div class="glass rounded-3xl p-10">
      <h2 class="text-3xl font-bold mb-8 flex items-center"><i class="ri-history-line mr-4"></i>实时访问记录</h2>
      <div id="list" class="space-y-5"></div>
    </div>
  </div>

  <script>
    let globe, replayTimer, isPlaying = false;
    const logs = [];

    async function load() {
      const res = await fetch('/api/all');
      const data = await res.json();
      logs.length = 0;
      logs.push(...data.logs);

      document.getElementById('today').textContent = data.stats.today.toLocaleString();
      document.getElementById('newUsers').textContent = data.stats.newUsers.toLocaleString();
      document.getElementById('total').textContent = data.stats.total.toLocaleString();
      document.getElementById('online').textContent = data.stats.online;

      renderLogs(data.logs);
      initGlobe(data.logs);
    }

    function initGlobe(logData) {
      if (!globe) {
        globe = echarts.init(document.getElementById('globe'));
      }

      const points = logData.map(l => ({
        name: l.ip,
        value: [getCountryCoord(l.country)[0], getCountryCoord(l.country)[1], Math.random() * 10 + 5],
        time: l.timestamp
      }));

      globe.setOption({
        backgroundColor: 'transparent',
        globe: {
          baseTexture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGAoQf5aQAAAABJRU5ErkJggg==',
          heightTexture: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGAoQf5aQAAAABJRU5ErkJggg==',
          displacementScale: 0.1,
          shading: 'lambert',
          light: { main: { intensity: 2, shadow: true } },
          viewControl: { autoRotate: true, autoRotateSpeed: 5 }
        },
        series: [
          // 热力层
          {
            type: 'scatter3D',
            coordinateSystem: 'globe',
            data: points,
            symbolSize: d => d.value[2],
            itemStyle: { color: '#8b5cf6', opacity: 0.9 },
            emphasis: { itemStyle: { color: '#fff' } },
            blendMode: 'lighter'
          },
          // 波纹效果
          {
            type: 'effectScatter',
            coordinateSystem: 'globe',
            data: points.slice(-50),
            symbolSize: 15,
            rippleEffect: { period: 4, scale: 6, brushType: 'stroke' },
            itemStyle: { color: '#f72585' }
          }
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
          const point = logs[i];
          globe.dispatchAction({
            type: 'showTip',
            seriesIndex: 0,
            dataIndex: i,
            position: [0,0]
          });
          i++;
        }, 800);
      }
    }

    function renderLogs(logs) {
      document.getElementById('list').innerHTML = logs.slice(0,50).map(l => \`
        <div class="glass rounded-2xl p-6 hover:glow transition">
          <div class="flex justify-between items-center">
            <div>
              <strong class="text-2xl">\${l.ip}</strong>
              <span class="ml-4 bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2 rounded-full text-sm">\${l.country}</span>
              <span class="ml-2 bg-gradient-to-r from-indigo-500 to-blue-500 px-5 py-2 rounded-full text-sm">\${l.domain}</span>
            </div>
            <div class="text-sm opacity-80">\${l.time}</div>
          </div>
          <div class="mt-3 text-lg">\${l.path}</div>
          <div class="text-sm opacity-70 mt-2 truncate">\${l.ua}</div>
        </div>
      \`).join('');
    }

    // 国家坐标（部分示例，实际可扩展）
    function getCountryCoord(code) {
      const map = { CN:[104,35], US:[-100,40], SG:[103.8,1.3], JP:[139,35], HK:[114,22], GB:[-2,54], DE:[10,51], FR:[2,46] };
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