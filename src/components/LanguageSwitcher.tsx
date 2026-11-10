import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const id = useId();

  return (
    <div className="lang-switcher">
      <label htmlFor={id} className="visually-hidden">
        {t('common.language')}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {LANGUAGES.map((lng) => (
          <option key={lng} value={lng} lang={lng}>
            {t(`common.languages.${lng}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
