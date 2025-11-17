// API: 封禁列表（带归属地）
if (path === '/api/blocked') {
  const { keys } = await KV.list();
  const list = [];
  for (const k of keys) {
    if (k.name.startsWith('ip:')) {
      const ip = k.name.slice(3);
      const result = await KV.getWithMetadata(k.name);
      const metadata = result.metadata;
      const loc = await getLocation(ip);
      list.push({
        ip,
        country: metadata?.country || 'XX',
        city: loc.city || '未知',
        isp: loc.isp || '未知',
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
    const data = await res.json();
    return {
      city: data.city || '未知',
      isp: data.isp || '未知',
      org: data.org || '未知',
      country: data.country || 'XX'
    };
  } catch (e) {
    console.error('getLocation error:', e);
    return { city: '未知', isp: '未知', org: '未知', country: 'XX' };
  }
}