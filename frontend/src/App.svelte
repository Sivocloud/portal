<script>
  import { onMount } from 'svelte';

  let me = $state(null);
  let apps = $state(null);
  let loading = $state(true);
  let error = $state(null);

  async function loadPortal() {
    loading = true;
    error = null;
    try {
      const [meRes, appsRes] = await Promise.all([
        fetch('/portal/api/portal/me', { credentials: 'include' }),
        fetch('/portal/api/portal/apps', { credentials: 'include' }),
      ]);
      const meData = await meRes.json();
      const appsData = await appsRes.json();
      if (!meData.data?.valid) {
        error = 'Sesión inválida o expirada. Volvé a iniciar sesión.';
        return;
      }
      me = meData.data;
      apps = appsData.data?.apps || [];
    } catch (err) {
      error = `Error cargando portal: ${err.message}`;
    } finally {
      loading = false;
    }
  }

  onMount(loadPortal);

  function launchUrl(app) {
    // Map appSlug → URL canónica. _portal solo conoce estos slugs.
    const map = {
      pos: (sub) => `https://apps.sivocloud.dev/sivopos/${sub}`,
      b2b: (sub) => `https://apps.sivocloud.dev/b2b/${sub}`,
    };
    const fn = map[app.appSlug];
    return fn ? fn(me?.tenant?.subdomain || me?.tenant?.id) : '#';
  }

  function logout() {
    // Redirect a _auth logout (deja cookie vacía) y vuelve al login.
    window.location.href = 'https://auth.sivocloud.dev/api/auth/logout?return=/login';
  }
</script>

<div class="navbar bg-base-100 shadow">
  <div class="flex-1">
    <a href="/" class="btn btn-ghost text-xl font-bold">
      <span class="text-primary">SIVO</span>cloud Portal
    </a>
  </div>
  <div class="flex-none gap-2">
    {#if me?.user}
      <div class="badge badge-outline">
        {me.user.id}
        {#if me.user.role}<span class="badge badge-sm badge-primary ml-2">{me.user.role}</span>{/if}
      </div>
    {/if}
    <button class="btn btn-ghost btn-sm" onclick={logout}>Salir</button>
  </div>
</div>

<main class="container mx-auto p-6 max-w-5xl">
  {#if loading}
    <div class="flex justify-center p-12">
      <span class="loading loading-spinner loading-lg"></span>
    </div>
  {:else if error}
    <div class="alert alert-error">
      <span>{error}</span>
      <a href="https://auth.sivocloud.dev/login" class="btn btn-sm">Ir al login</a>
    </div>
  {:else if me}
    <div class="hero bg-base-100 rounded-box shadow mb-6">
      <div class="hero-content text-center py-8">
        <div class="max-w-md">
          <h1 class="text-3xl font-bold">
            {me.tenant?.displayName || me.tenant?.id}
          </h1>
          <p class="py-2 opacity-70">
            plan <span class="badge badge-primary">{me.tenant?.plan}</span>
            · {me.tenant?.defaultCurrency}
            {#if me.tenant?.region}· {me.tenant?.region}{/if}
          </p>
        </div>
      </div>
    </div>

    <h2 class="text-xl font-semibold mb-4">Apps instaladas</h2>

    {#if apps.length === 0}
      <div class="alert">
        <span>No hay apps instaladas todavía.</span>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each apps as app}
          <div class="card bg-base-100 shadow">
            <div class="card-body">
              <h3 class="card-title">
                {app.appSlug}
                <span class="badge badge-sm {app.status === 'active' ? 'badge-success' : 'badge-warning'}">
                  {app.status}
                </span>
              </h3>
              <p class="text-sm opacity-70">
                <span class="font-mono">{app.dbName}</span>
              </p>
              <p class="text-xs opacity-50">
                meter: {app.meteringMode}
                · instalado: {new Date(app.installedAt).toLocaleDateString()}
              </p>
              <div class="card-actions justify-end mt-2">
                {#if app.status === 'active'}
                  <a href={launchUrl(app)} class="btn btn-primary btn-sm">
                    Abrir
                  </a>
                {:else}
                  <button class="btn btn-disabled btn-sm">No disponible</button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="divider"></div>

    <details class="text-xs opacity-50">
      <summary class="cursor-pointer">Info técnica (Phase 4 — zero secrets)</summary>
      <div class="mt-2">
        <p>Este worker NO tiene secrets de plataforma. Toda la metadata viene del
        Service Binding RPC <code>env.AUTH</code>.</p>
        <ul class="list-disc list-inside mt-2 space-y-1">
          <li>Sin TURSO_CONTROL_PLANE_TOKEN</li>
          <li>Sin CONTROL_PLANE_ENCRYPTION_KEY</li>
          <li>Sin D1 binding de plataforma</li>
          <li>Sin SESSION_SECRET (verificación via RPC)</li>
        </ul>
        <p class="mt-2">
          Si esta UI fuera comprometida, el atacante solo vería la metadata
          pública de UN tenant — no podría listar otros tenants ni cambiar
          planes.
        </p>
      </div>
    </details>
  {/if}
</main>
