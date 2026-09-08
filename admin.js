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
    queue.innerHTML = result.data.map(item => { const raw = item.raw_payload || {}; return `<article class="card" data-id="${item.id}"><b>${escapeHtml(raw.title || 'Untitled lead')}</b><p><a target="_blank" href="${escapeHtml(item.source_url)}">${escapeHtml(item.source_url)}</a></p><p class="muted">Submitted ${escapeHtml(item.created_at)}</p><label>Manufacturer<br><input data-field="manufacturer" value="${escapeHtml(raw.manufacturer || '')}"></label><label>Product<br><input data-field="product" value="${escapeHtml(raw.title || '')}"></label><label>Official or checklist URL<br><input data-field="source_url" value="${escapeHtml(item.source_url)}" style="width:90%"></label><label>Checklist URL<br><input data-field="checklist_url" style="width:90%"></label><label>Odds URL<br><input data-field="odds_url" style="width:90%"></label><label>Prize name<br><input data-field="prize_name"></label><label>Card pool<br><input data-field="card_pool"></label><label>Odds text<br><input data-field="odds_text"></label><p><button data-action="approved">Approve as lead</button><button data-action="rejected">Reject</button></p></article>`; }).join('') || '<p class="muted">No pending leads.</p>';
    queue.querySelectorAll('button').forEach(button => button.onclick = async function () {
      const card = button.closest('[data-id]');
      let update;
      if (button.dataset.action === 'approved') {
        const value = field => card.querySelector('[data-field="' + field + '"]').value.trim();
        const result = await client.rpc('approve_review_lead', { p_review_id: card.dataset.id, p_manufacturer: value('manufacturer'), p_product: value('product'), p_source_url: value('source_url'), p_checklist_url: value('checklist_url'), p_odds_url: value('odds_url'), p_prize_name: value('prize_name'), p_card_pool: value('card_pool'), p_odds_text: value('odds_text') });
        if (result.error) status.textContent = result.error.message; else load();
        return;
      }
      update = await client.from('review_queue').update({ status: 'rejected', reviewer_id: user.id, reviewed_at: new Date().toISOString() }).eq('id', card.dataset.id);
      if (update.error) status.textContent = update.error.message; else load();
    });
  }
  setTimeout(load, 500);
}());
