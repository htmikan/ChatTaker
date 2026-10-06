import yamlText from "../i18n.yaml";

/** Language id from i18n.yaml `languages:` (en, ja, fr, zh-CN, …). */
export type UiLanguage = string;

type Catalog = {
  languages: Record<string, string>;
  strings: Record<string, Record<string, string>>;
};

const FALLBACK = "en";
const bundled = parseI18nYaml(yamlText);
let catalog: Catalog = bundled;
let current: UiLanguage = FALLBACK;

export function asUiLanguage(value: unknown): UiLanguage {
  if (typeof value !== "string") return FALLBACK;
  const id = value.trim();
  if (!id) return FALLBACK;
  return catalog.languages[id] != null ? id : FALLBACK;
}

export function currentLanguage(): UiLanguage {
  return current;
}

export function setLanguage(language: UiLanguage): void {
  current = asUiLanguage(language);
}

export function languageOptions(): Array<{ id: UiLanguage; label: string }> {
  const entries = Object.entries(catalog.languages);
  if (!entries.length) return [{ id: FALLBACK, label: "English" }];
  return entries.map(([id, label]) => ({ id, label: label || id }));
}

/** Overlay plugin-folder i18n.yaml onto the bundled catalog. Empty/invalid text is ignored. */
export function loadI18nYaml(source: string): void {
  const overlay = parseI18nYaml(source);
  if (!Object.keys(overlay.strings).length && !Object.keys(overlay.languages).length) {
    catalog = bundled;
    return;
  }
  const strings: Catalog["strings"] = { ...bundled.strings };
  for (const [key, entry] of Object.entries(overlay.strings)) {
    strings[key] = { ...strings[key], ...entry };
  }
  catalog = {
    languages: { ...bundled.languages, ...overlay.languages },
    strings,
  };
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = catalog.strings[key];
  const raw = (entry && (entry[current] || entry[FALLBACK])) || key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_all, name: string) => {
    const value = vars[name];
    return value == null ? `{${name}}` : String(value);
  });
}

function parseI18nYaml(source: string): Catalog {
  const languages: Record<string, string> = {};
  const strings: Catalog["strings"] = {};
  let section: "languages" | string | null = null;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const top = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (top && !line.startsWith(" ")) {
      const key = top[1];
      const rest = top[2].trim();
      if (key === "languages") {
        section = "languages";
        continue;
      }
      section = key;
      if (rest) {
        // unused: scalar at top level
      }
      continue;
    }
    const nested = /^\s{2}([A-Za-z0-9_.-]+):\s*(.*)$/.exec(line);
    if (!nested || !section) continue;
    const name = nested[1];
    const value = unquoteYaml(nested[2].trim());
    if (section === "languages") {
      languages[name] = value;
      continue;
    }
    if (!strings[section]) strings[section] = {};
    strings[section][name] = value;
  }
  return { languages, strings };
}

function unquoteYaml(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const inner = value.slice(1, -1);
    return inner.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'");
  }
  return value;
}
