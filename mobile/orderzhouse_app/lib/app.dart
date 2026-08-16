import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/branding/app_branding.dart';
import 'core/router/deep_link_listener.dart';
import 'core/router/push_bootstrap_listener.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';
import 'features/currency/presentation/currency_display_provider.dart';

class OrderzHouseApp extends ConsumerWidget {
  const OrderzHouseApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    ref.watch(currencyDisplaySettingsProvider);

    return PushBootstrapListener(
      child: DeepLinkListener(
        child: MaterialApp.router(
          title: AppBranding.displayNameEn,
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light(),
          locale: const Locale('ar'),
          supportedLocales: const [Locale('ar'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: router,
          builder: (context, child) {
            return Directionality(
              textDirection: TextDirection.rtl,
              child: child ?? const SizedBox.shrink(),
            );
          },
        ),
      ),
    );
  }
}
