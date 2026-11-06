import { setReact } from '@ervisio/plugin-sdk/react';
import { setSdk, type PluginSDK } from '@ervisio/plugin-sdk';
import { App, DesktopApp } from './App';
import { registerStrings } from './i18n';
import styles from './style.css?inline';

export default function activate(sdk: PluginSDK): void {
  setSdk(sdk); setReact(sdk.react); registerStrings();
  if (!document.getElementById('backup-styles')) { const style = document.createElement('style'); style.id = 'backup-styles'; style.textContent = styles; document.head.appendChild(style); }
  sdk.registerPage('backup', App);
  sdk.registerPage('backup-desktop', DesktopApp);
}
