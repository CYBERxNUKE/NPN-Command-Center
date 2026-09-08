(function () {
  const config = window.NPN_CONFIG || {};
  const state = { client: null, user: null };
  const intakeUrl = new URLSearchParams(location.search).get('submit_url');
  const intakeTitle = new URLSearchParams(location.search).get('submit_title') || '';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:40;background:#101722;border:1px solid #26344a;border-radius:12px;padding:10px;color:#f4f7fb;box-shadow:0 12px 30px rgba(0,0,0,.35);font-size:12px;max-width:280px';
  document.body.appendChild(panel);

  function render(message) {
    if (!state.client) {
      panel.innerHTML = '<b>Cloud sync disabled</b><div style="color:#91a3ba;margin-top:4px">Add public-config.js to enable sign in.</div>';
      return;
    }
    if (!state.user) {
      panel.innerHTML = '<b>Private account</b><div style="margin-top:7px"><input id="npnEmail" type="email" placeholder="Email address" style="width:160px;padding:5px"><button id="npnSignIn" style="margin-left:5px;padding:5px">Sign in</button></div>' + (message ? '<div style="color:#ffd166;margin-top:6px">' + message + '</div>' : '');
      document.getElementById('npnSignIn').onclick = async function () {
        const email = document.getElementById('npnEmail').value.trim();
        if (!email) return render('Enter an email address.');
        const result = await state.client.auth.signInWithOtp({ email, options: { emailRedirectTo: config.appUrl || location.href } });
        render(result.error ? result.error.message : 'Check your email for the sign-in link.');
      };
      return;
    }
    panel.innerHTML = '<b>Signed in</b><div style="color:#91a3ba;margin-top:4px">' + state.user.email + '</div><div style="margin-top:6px"><a href="account.html" style="color:#9bc3ff">Household</a> | <a href="postage.html" style="color:#9bc3ff">Postage</a> | <a href="manifest.html" style="color:#9bc3ff">Manifest</a> | <a href="admin.html" style="color:#9bc3ff">Review queue</a></div><button id="npnPush" style="margin-top:7px;padding:5px">Enable push</button><button id="npnSignOut" style="margin:7px 0 0 5px;padding:5px">Sign out</button>';
    document.getElementById('npnPush').onclick = async function () {
      try { await window.npnAuth.enablePush(); render('Push notifications enabled.'); } catch (error) { render(error.message); }
    };
    document.getElementById('npnSignOut').onclick = function () { state.client.auth.signOut(); };
  }

  function notifyDashboard() {
    if (typeof window.npnCloudReady === 'function') window.npnCloudReady();
  }

  async function captureShareLead() {
    if (!intakeUrl || !state.user || sessionStorage.getItem('npn-intake-' + intakeUrl)) return;
    const result = await state.client.from('review_queue').insert({ submitted_by: state.user.id, source_url: intakeUrl, raw_payload: { title: intakeTitle, intake: 'share_sheet' } });
    if (!result.error) {
      sessionStorage.setItem('npn-intake-' + intakeUrl, '1');
      history.replaceState({}, document.title, location.pathname);
      render('Lead submitted for review.');
    } else {
      render(result.error.message);
    }
  }

  window.npnAuth = {
    getClient: function () { return state.client; },
    getUser: function () { return state.user; },
    submitLead: async function (url, title) {
      if (!state.client || !state.user) throw new Error('Sign in before submitting a lead.');
      const result = await state.client.from('review_queue').insert({ submitted_by: state.user.id, source_url: url, raw_payload: { title: title || '', intake: 'share_sheet' } });
      if (result.error) throw result.error;
      return result.data;
    },
    syncSubmission: async function (opportunity, status) {
      if (!state.client || !state.user) return;
      const result = await state.client.rpc('record_submission', {
        p_external_key: opportunity.id,
        p_manufacturer: opportunity.manufacturer || '',
        p_product: opportunity.product || '',
        p_source_url: opportunity.source || '',
        p_status: status,
        p_mailed_at: status === 'MAILED' ? new Date().toISOString().slice(0, 10) : null,
        p_postmark_deadline: /^\\d{4}-\\d{2}-\\d{2}$/.test(opportunity.postmarkDeadline || '') ? opportunity.postmarkDeadline : null,
        p_address: opportunity.address || null,
        p_instructions: opportunity.instructions || null
      });
      if (result.error) throw result.error;
      return result.data;
    },
    enablePush: async function () {
      if (!state.client || !state.user) throw new Error('Sign in before enabling push.');
      if (!config.vapidPublicKey || config.vapidPublicKey.includes('YOUR_')) throw new Error('VAPID public key is not configured.');
      if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new Error('Push notifications are not supported here.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const registration = await navigator.serviceWorker.ready;
      const key = Uint8Array.from(atob(config.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const json = subscription.toJSON();
      const result = await state.client.from('push_subscriptions').upsert({ owner_id: state.user.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth_key: json.keys.auth }, { onConflict: 'owner_id,endpoint' });
      if (result.error) throw result.error;
      const preference = await state.client.from('notification_preferences').upsert({ owner_id: state.user.id, channel: 'push', destination: 'browser', enabled: true, event_types: ['deadline_soon', 'source_changed'] }, { onConflict: 'owner_id,channel,destination' });
      if (preference.error) throw preference.error;
    },
    uploadEvidence: async function (opportunity, file, caption) {
      if (!state.client || !state.user) throw new Error('Sign in before uploading evidence.');
      const allowedTypes = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
      if (!file || !allowedTypes[file.type]) throw new Error('Choose a JPEG, PNG, or WebP image.');
      if (file.size > 10 * 1024 * 1024) throw new Error('Evidence images must be 10 MB or smaller.');
      const submissionId = await this.syncSubmission(opportunity, 'PREPARED');
      const path = state.user.id + '/' + crypto.randomUUID() + allowedTypes[file.type];
      const upload = await state.client.storage.from('submission-evidence').upload(path, file, { contentType: file.type, upsert: false });
      if (upload.error) throw upload.error;
      const result = await state.client.from('submission_evidence').insert({ submission_id: submissionId, owner_id: state.user.id, storage_path: path, file_name: file.name, mime_type: file.type, caption: caption || null });
      if (result.error) {
        await state.client.storage.from('submission-evidence').remove([path]);
        throw result.error;
      }
    },
    listEvidence: async function (opportunity) {
      if (!state.client || !state.user) throw new Error('Sign in before viewing evidence.');
      const submissionId = await this.syncSubmission(opportunity, 'PREPARED');
      const result = await state.client.from('submission_evidence').select('file_name,storage_path,caption,created_at').eq('submission_id', submissionId).order('created_at', { ascending: false });
      if (result.error) throw result.error;
      const items = [];
      for (const item of result.data || []) {
        const signed = await state.client.storage.from('submission-evidence').createSignedUrl(item.storage_path, 900);
        if (!signed.error) items.push({ ...item, url: signed.data.signedUrl });
      }
      return items;
    }
  };

  if (window.supabase && config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes('YOUR_')) {
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    state.client.auth.getSession().then(function (result) { state.user = result.data.session && result.data.session.user; render(); captureShareLead(); notifyDashboard(); });
    state.client.auth.onAuthStateChange(function (_event, session) { state.user = session && session.user; render(); captureShareLead(); notifyDashboard(); });
  } else {
    render();
  }
}());
