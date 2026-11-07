import type { PluginOption } from 'vite';
import { defineConfig } from 'vite';
import appConfig from '../vite.config';

/**
 * Vite config used only by the Playwright `webServer`.
 *
 * It is the app config minus Vue DevTools: `vite-plugin-vue-devtools` injects a floating panel
 * into every dev page, and that panel sits on top of the page in hit tests, so
 * `document.elementFromPoint` assertions would measure the tool, not the app.
 */
function isDevtools(plugin: PluginOption): boolean {
  return (
    !!plugin &&
    !Array.isArray(plugin) &&
    typeof plugin === 'object' &&
    'name' in plugin &&
    /devtools|vue-inspector|vite-plugin-inspect/i.test(plugin.name)
  );
}

function stripDevtools(plugins: PluginOption[] | undefined): PluginOption[] {
  return (plugins ?? []).flatMap((plugin) => {
    if (Array.isArray(plugin)) return [stripDevtools(plugin)];
    return isDevtools(plugin) ? [] : [plugin];
  });
}

const resolved = typeof appConfig === 'function' ? undefined : appConfig;

export default defineConfig({
  ...resolved,
  plugins: stripDevtools(resolved?.plugins as PluginOption[] | undefined),
});
