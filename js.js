export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 认证：?password=yourpass（替换 'yourpass'）
    if (url.searchParams.get('password') !== 'yourpass') {
      return new Response('Unauthorized', { status: 401 });
    }

    if (path === '/') {
      // 主页：节点状态列表
      const html = await generateStatusHTML(env);
      return new Response(html, { headers: { 'Content-Type': 'text/html' } });
    }

    if (path === '/add') {
      if (request.method === 'POST') {
        // 处理表单提交
        const formData = await request.formData();
        const name = formData.get('name');
        const host = formData.get('host');
        const port = formData.get('port');
        const subscription = formData.get('subscription');

        if (subscription) {
          // 批量导入订阅链接（base64 格式，如 Shadowrocket 导出）
          const decoded = atob(subscription); // 解码 base64
          const lines = decoded.split('\n');
          for (const line of lines) {
            if (line.startsWith('trojan://')) {
              // 解析 Trojan URI: trojan://password@host:port?params
              const parts = line.replace('trojan://', '').split('@');
              const auth = parts[0];
              const addr = parts[1].split(':');
              const nodeHost = addr[0];
              const nodePort = parseInt(addr[1].split('?')[0]);
              const nodeName = `Trojan-${nodeHost}`; // 自动命名
              await env.NODE_LIST_KV.put(nodeName, JSON.stringify({ host: nodeHost, port: nodePort, auth }));
            }
          }
          return new Response('订阅节点已导入', { status: 200 });
        } else if (name && host && port) {
          // 单个添加
          await env.NODE_LIST_KV.put(name, JSON.stringify({ host, port }));
          return new Response('节点已添加', { status: 200 });
        }
        return new Response('无效数据', { status: 400 });
      }

      // GET: 渲染添加表单
      return new Response(generateAddFormHTML(), { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Cron: 检查节点
    const keys = await env.NODE_LIST_KV.list();
    for (const key of keys.keys) {
      const nodeData = JSON.parse(await env.NODE_LIST_KV.get(key.name));
      const { status, latency } = await checkNode(nodeData.host, nodeData.port);
      await env.NODE_STATUS_KV.put(key.name, JSON.stringify({ status, latency, timestamp: Date.now() }));
    }
  }
};

async function checkNode(host, port) {
  const start = Date.now();
  try {
    const response = await fetch(`https://${host}:${port}`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    return { status: response.ok ? '在线' : '离线', latency };
  } catch {
    return { status: '离线', latency: 'N/A' };
  }
}

async function generateStatusHTML(env) {
  const keys = await env.NODE_STATUS_KV.list();
  let table = '<table border="1"><tr><th>节点</th><th>状态</th><th>延迟</th><th>最后检查</th></tr>';
  for (const key of keys.keys) {
    const data = JSON.parse(await env.NODE_STATUS_KV.get(key.name));
    const time = new Date(data.timestamp).toLocaleString('zh-CN');
    table += `<tr><td>${key.name}</td><td>${data.status}</td><td>${data.latency}</td><td>${time}</td></tr>`;
  }
  table += '</table>';

  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head><title>节点监控</title></head>
    <body>
      <h1>Trojan 节点状态（类似小火箭）</h1>
      ${table}
      <a href="/add?password=yourpass">添加节点</a>
      <script>setTimeout(() => location.reload(), 60000);</script>
    </body>
    </html>
  `;
}

function generateAddFormHTML() {
  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head><title>添加节点</title></head>
    <body>
      <h1>添加 Trojan 节点</h1>
      <form method="POST">
        <label>节点名: <input name="name"></label><br>
        <label>Host: <input name="host"></label><br>
        <label>Port: <input name="port" type="number"></label><br>
        <button type="submit">添加单个</button>
      </form>
      <h2>或导入订阅链接 (base64)</h2>
      <form method="POST">
        <label>订阅 base64: <textarea name="subscription"></textarea></label><br>
        <button type="submit">批量导入</button>
      </form>
    </body>
    </html>
  `;
}