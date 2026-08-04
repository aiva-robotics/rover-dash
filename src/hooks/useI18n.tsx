import { useCallback, useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { LOCALES, translate, type Lang, type TFunc, type TVars } from "@/lib/i18n";

export function useI18n(): { lang: Lang; locale: string; t: TFunc } {
  const { settings } = useSettings();
  const lang = settings.language;
  const t = useCallback<TFunc>((key, vars?: TVars) => translate(lang, key, vars), [lang]);
  return useMemo(() => ({ lang, locale: LOCALES[lang], t }), [lang, t]);
}
