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
    panel.innerHTML = '<b>Signed in</b><div style="color:#91a3ba;margin-top:4px">' + state.user.email + '</div><button id="npnSignOut" style="margin-top:7px;padding:5px">Sign out</button>';
    document.getElementById('npnSignOut').onclick = function () { state.client.auth.signOut(); };
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
    }
  };

  if (window.supabase && config.supabaseUrl && config.supabaseAnonKey && !config.supabaseUrl.includes('YOUR_')) {
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    state.client.auth.getSession().then(function (result) { state.user = result.data.session && result.data.session.user; render(); captureShareLead(); });
    state.client.auth.onAuthStateChange(function (_event, session) { state.user = session && session.user; render(); captureShareLead(); });
  } else {
    render();
  }
}());
