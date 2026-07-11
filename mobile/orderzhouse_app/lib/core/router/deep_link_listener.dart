import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_router.dart';
import 'deep_link_normalization.dart';
import 'routes.dart';

/// Listens for `orderzhouse://…` and navigates to safe in-app routes only.
class DeepLinkListener extends ConsumerStatefulWidget {
  const DeepLinkListener({super.key, required this.child});

  final Widget child;

  @override
  ConsumerState<DeepLinkListener> createState() => _DeepLinkListenerState();
}

class _DeepLinkListenerState extends ConsumerState<DeepLinkListener> {
  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _subscription;

  @override
  void initState() {
    super.initState();
    _subscription = _appLinks.uriLinkStream.listen(_handleUri, onError: (_) {});
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _handleUri(uri);
    });
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }

  void _handleUri(Uri uri) {
    if (uri.scheme.toLowerCase() != 'orderzhouse') return;
    final location = rewriteIncomingDeepLinkUri(uri) ?? AppRoutes.login;
    ref.read(routerProvider).go(location);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
