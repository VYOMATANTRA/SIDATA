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

if (typeof appConfig !== 'object' || appConfig === null || Array.isArray(appConfig)) {
  // A function/promise config would otherwise silently drop the app's plugins (Vue, Tailwind).
  throw new Error(
    'e2e/vite.e2e.config.ts expects ../vite.config to default-export a plain object; ' +
      'resolve the function form here before stripping devtools.',
  );
}

export default defineConfig({
  ...appConfig,
  plugins: stripDevtools(appConfig.plugins as PluginOption[] | undefined),
});
