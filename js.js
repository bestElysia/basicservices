export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 认证：?password=only
    if (url.searchParams.get('password') !== 'only') {
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
        try {
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
                // 解析 Trojan URI: trojan://password@host:port?params#name
                const uriParts = line.replace('trojan://', '').split('#');
                const nodeName = uriParts[1] ? decodeURIComponent(uriParts[1]) : `Trojan-${Math.random().toString(36).slice(2)}`; // 使用 # 后名称或随机
                const mainParts = uriParts[0].split('@');
                const auth = mainParts[0];
                const addrParts = mainParts[1].split('?')[0].split(':');
                const nodeHost = addrParts[0];
                const nodePort = parseInt(addrParts[1]);
                const params = new URLSearchParams(mainParts[1].split('?')[1] || '');
                const allowInsecure = params.get('allowInsecure') === '1';
                const peer = params.get('peer') || '';

                await env.NODE_LIST_KV.put(nodeName, JSON.stringify({ host: nodeHost, port: nodePort, auth, allowInsecure, peer }));
              }
            }
            return new Response('订阅节点已导入', { status: 200 });
          } else if (name && host && port) {
            // 单个添加
            await env.NODE_LIST_KV.put(name, JSON.stringify({ host, port: parseInt(port) }));
            return new Response('节点已添加', { status: 200 });
          }
          return new Response('无效数据', { status: 400 });
        } catch (e) {
          return new Response(`错误: ${e.message}`, { status: 500 });
        }
      }

      // GET: 渲染添加表单
      return new Response(generateAddFormHTML(), { headers: { 'Content-Type': 'text/html' } });
    }

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // Cron: 检查节点
    try {
      const keys = await env.NODE_LIST_KV.list();
      for (const key of keys.keys) {
        const nodeData = JSON.parse(await env.NODE_LIST_KV.get(key.name));
        const { status, latency } = await checkNode(nodeData.host, nodeData.port, nodeData);
        await env.NODE_STATUS_KV.put(key.name, JSON.stringify({ status, latency, timestamp: Date.now() }));
      }
    } catch (e) {
      console.error('Cron error:', e);
    }
  }
};

async function checkNode(host, port, nodeData) {
  const start = Date.now();
  try {
    // 如果 allowInsecure 为 true，使用 http 而非 https（根据节点配置调整）
    const protocol = nodeData.allowInsecure ? 'http' : 'https';
    const response = await fetch(`${protocol}://${host}:${port}`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    return { status: response.ok ? '在线' : '离线', latency };
  } catch {
    return { status: '离线', latency: 'N/A' };
  }
}

async function generateStatusHTML(env) {
  let table = '<table class="status-table"><tr><th>节点</th><th>状态</th><th>延迟</th><th>最后检查</th></tr>';
  try {
    const keys = await env.NODE_STATUS_KV.list();
    for (const key of keys.keys) {
      const data = JSON.parse(await env.NODE_STATUS_KV.get(key.name));
      const time = new Date(data.timestamp).toLocaleString('zh-CN');
      table += `<tr><td>${key.name}</td><td>${data.status}</td><td>${data.latency}</td><td>${time}</td></tr>`;
    }
  } catch (e) {
    table += `<tr><td colspan="4">错误: KV 加载失败 (${e.message})。请检查绑定。</td></tr>`;
  }
  table += '</table>';

  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
      <title>节点监控</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; }
        h1 { text-align: center; color: #333; }
        .status-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .status-table th, .status-table td { border: 1px solid #ddd; padding: 8px; text-align: center; }
        .status-table th { background: #4CAF50; color: white; }
        a { display: block; text-align: center; margin: 20px 0; color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>Trojan 节点状态（类似小火箭）</h1>
      ${table}
      <a href="/add?password=only">添加节点</a>
      <script>setTimeout(() => location.reload(), 60000);</script>
    </body>
    </html>
  `;
}

function generateAddFormHTML() {
  return `
    <!DOCTYPE html>
    <html lang="zh">
    <head>
      <title>添加节点</title>
      <style>
        body { font-family: Arial, sans-serif; background: #f0f0f0; padding: 20px; max-width: 600px; margin: auto; }
        h1, h2 { color: #333; }
        form { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); margin-bottom: 20px; }
        label { display: block; margin: 10px 0 5px; }
        input, textarea { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
        textarea { height: 100px; }
        button { background: #4CAF50; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; cursor: pointer; }
        button:hover { background: #45a049; }
        a { display: block; text-align: center; color: #2196F3; text-decoration: none; }
      </style>
    </head>
    <body>
      <h1>添加 Trojan 节点</h1>
      <form method="POST">
        <label>节点名: <input name="name" placeholder="e.g., 节点1" required></label>
        <label>Host: <input name="host" placeholder="e.g., example.com" required></label>
        <label>Port: <input name="port" type="number" placeholder="e.g., 443" required></label>
        <button type="submit">添加单个节点</button>
      </form>
      <h2>或导入订阅链接 (base64)</h2>
      <form method="POST">
        <label>订阅 base64: <textarea name="subscription" placeholder="粘贴 base64 编码的订阅内容" required></textarea></label>
        <button type="submit">批量导入</button>
      </form>
      <a href="/?password=only">返回主页</a>
    </body>
    </html>
  `;
}