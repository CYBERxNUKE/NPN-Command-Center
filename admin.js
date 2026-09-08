(function () {
  const status = document.getElementById('status');
  const queue = document.getElementById('queue');
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  async function load() {
    const client = window.npnAuth && window.npnAuth.getClient();
    const user = window.npnAuth && window.npnAuth.getUser();
    if (!client || !user) { status.textContent = 'Configure Supabase and sign in first.'; return; }
    const result = await client.from('review_queue').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    if (result.error) { status.textContent = result.error.message; return; }
    status.textContent = result.data.length + ' pending lead(s)';
    queue.innerHTML = result.data.map(item => `<article class="card"><b>${escapeHtml(item.raw_payload && item.raw_payload.title || 'Untitled lead')}</b><p><a target="_blank" href="${escapeHtml(item.source_url)}">${escapeHtml(item.source_url)}</a></p><p class="muted">Submitted ${escapeHtml(item.created_at)}</p><button data-id="${item.id}" data-action="approved">Approve</button><button data-id="${item.id}" data-action="rejected">Reject</button></article>`).join('') || '<p class="muted">No pending leads.</p>';
    queue.querySelectorAll('button').forEach(button => button.onclick = async function () {
      const update = await client.from('review_queue').update({ status: button.dataset.action, reviewer_id: user.id, reviewed_at: new Date().toISOString() }).eq('id', button.dataset.id);
      if (update.error) status.textContent = update.error.message; else load();
    });
  }
  setTimeout(load, 500);
}());
