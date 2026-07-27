module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    res.status(500).json({ error: 'Missing CRON_SECRET in Vercel environment variables' });
    return;
  }

  const supplied =
    String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
    String(req.query?.secret || '');
  if (supplied !== cronSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = process.env.GH_WORKFLOW_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'Missing GH_WORKFLOW_TOKEN in Vercel environment variables' });
    return;
  }

  const repository = process.env.GH_REPOSITORY || '713000970/713000970SugarXiaoyi';
  const workflow = process.env.GH_WORKFLOW_FILE || 'weekly-autopublish.yml';
  const ref = process.env.GH_WORKFLOW_REF || 'main';
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`;

  const gh = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'k12-weekly-vercel-cron',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref }),
  });

  if (!gh.ok) {
    const body = await gh.text();
    res.status(502).json({
      error: 'GitHub workflow dispatch failed',
      status: gh.status,
      body: body.slice(0, 500),
    });
    return;
  }

  res.status(200).json({
    ok: true,
    repository,
    workflow,
    ref,
    triggeredAt: new Date().toISOString(),
  });
};
