import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../theme/app_colors.dart';
import 'i18n.dart';

const _prefsKey = 'app_language';

/// Load the persisted language before the first frame (Arabic when nothing is stored).
Future<void> loadSavedLanguage() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    AppI18n.setLanguage(AppLanguage.fromCode(prefs.getString(_prefsKey)));
  } catch (_) {
    AppI18n.setLanguage(AppLanguage.ar);
  }
}

final languageControllerProvider =
    NotifierProvider<LanguageController, AppLanguage>(LanguageController.new);

class LanguageController extends Notifier<AppLanguage> {
  @override
  AppLanguage build() => AppI18n.language;

  Future<void> setLanguage(AppLanguage language) async {
    if (language == state) return;
    AppI18n.setLanguage(language);
    state = language;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefsKey, language.code);
    } catch (_) {
      // Preference is best-effort; the switch still applies for this session.
    }
  }

  Future<void> toggle() =>
      setLanguage(state == AppLanguage.ar ? AppLanguage.en : AppLanguage.ar);
}

/// Compact switch that always names the OTHER language in that language ("English" / "العربية"),
/// so it is recognizable whichever language is active.
class LanguageSwitchButton extends ConsumerWidget {
  const LanguageSwitchButton({super.key, this.compact = true});

  final bool compact;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = ref.watch(languageControllerProvider);
    final target = language == AppLanguage.ar ? 'English' : 'العربية';
    return TextButton.icon(
      key: const Key('language-switch'),
      onPressed: () => ref.read(languageControllerProvider.notifier).toggle(),
      icon: const Icon(Icons.translate_rounded, size: 18, color: AppColors.primary),
      label: Text(
        target,
        style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary),
      ),
    );
  }
}

/// Settings row with both options and the current one checked.
class LanguageSettingsTile extends ConsumerWidget {
  const LanguageSettingsTile({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final language = ref.watch(languageControllerProvider);
    return RadioGroup<AppLanguage>(
      groupValue: language,
      onChanged: (v) {
        if (v != null) ref.read(languageControllerProvider.notifier).setLanguage(v);
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 16, 4),
            child: Text(
              tr('اللغة'),
              style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.textInk),
            ),
          ),
          const RadioListTile<AppLanguage>(
            key: Key('language-ar'),
            value: AppLanguage.ar,
            title: Text('العربية'),
          ),
          const RadioListTile<AppLanguage>(
            key: Key('language-en'),
            value: AppLanguage.en,
            title: Text('English'),
          ),
        ],
      ),
    );
  }
}
