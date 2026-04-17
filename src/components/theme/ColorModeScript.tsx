import { COLOR_SCHEME_STORAGE_KEY } from "./colorModeStorage";

/** Run before paint to reduce light→dark flash when user prefers dark. */
export function ColorModeScript() {
  const js = `(function(){try{var k=${JSON.stringify(COLOR_SCHEME_STORAGE_KEY)};var s=localStorage.getItem(k)||'system';var d=document.documentElement;var dark=s==='dark'||(s==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);d.classList.toggle('dark',dark);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
