import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/constants/web_constants.dart';
import 'super_admin_models.dart';

/// Opens a public web dashboard path in the external browser (no secrets).
Future<bool> openSuperAdminWebUrl(String url) async {
  final uri = Uri.tryParse(url.trim());
  if (uri == null || !(uri.isScheme('http') || uri.isScheme('https'))) {
    return false;
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

Future<bool> openSuperAdminSubscriptionsActivationWeb() =>
    openSuperAdminWebUrl(WebConstants.superAdminSubscriptionsActivationUrl);

Future<bool> openSuperAdminInternalOrdersWeb() =>
    openSuperAdminWebUrl(WebConstants.superAdminInternalOrdersUrl);

Future<void> openSuperAdminWebOrSnack(BuildContext context, Future<bool> Function() open) async {
  final ok = await open();
  if (!ok && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text(superAdminWebHandoffFailedAr)),
    );
  }
}
