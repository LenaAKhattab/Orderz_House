import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'features/push/data/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Release builds must not load bundled/local .env — use --dart-define or production HTTPS fallback.
  if (!kReleaseMode) {
    try {
      await dotenv.load(fileName: '.env.example', isOptional: true);
    } catch (_) {
      // Optional — fall back to dart-define / platform debug defaults.
    }
  }
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp().timeout(const Duration(seconds: 8));
    }
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (_) {
    // No google-services.json / Firebase — app continues with in-app notifications only.
  }
  await initializeDateFormatting('ar');
  runApp(const ProviderScope(child: OrderzHouseApp()));
}
