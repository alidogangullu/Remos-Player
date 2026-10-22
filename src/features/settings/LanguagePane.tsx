import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PaneHeader } from '../../components/common';
import { TVOptionRow } from '../../components/tv';
import { SUPPORTED_LANGUAGES, detectDeviceLanguage, useLanguage } from '../../i18n';
import { paneStyles } from './paneStyles';

/** Settings › Language: follow the TV's language, or pin one of the supported languages. */
export const LanguagePane: React.FC = () => {
  const { t } = useTranslation();
  const { preference, setPreference } = useLanguage();
  const deviceLanguage = SUPPORTED_LANGUAGES.find((l) => l.code === detectDeviceLanguage());

  return (
    <ScrollView style={paneStyles.scroll} contentContainerStyle={paneStyles.content}>
      <PaneHeader title={t('settings.language.title')} subtitle={t('settings.language.subtitle')} />
      <View style={styles.list} accessibilityRole="radiogroup">
        <TVOptionRow
          label={t('settings.language.system')}
          detail={t('settings.language.systemDetail', { language: deviceLanguage?.nativeName })}
          selected={preference === 'system'}
          onPress={() => setPreference('system')}
          testID="language-option-system"
        />
        {/* Native names, so anyone can find their own language whatever the UI is showing. */}
        {SUPPORTED_LANGUAGES.map((lang) => (
          <TVOptionRow
            key={lang.code}
            label={lang.nativeName}
            selected={preference === lang.code}
            onPress={() => setPreference(lang.code)}
            testID={`language-option-${lang.code}`}
          />
        ))}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  list: {
    maxWidth: 560,
    gap: 4,
  },
});
