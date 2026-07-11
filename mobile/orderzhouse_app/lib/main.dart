import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';

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
  await initializeDateFormatting('ar');
  runApp(const ProviderScope(child: OrderzHouseApp()));
}
