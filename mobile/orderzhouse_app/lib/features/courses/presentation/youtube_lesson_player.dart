import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';

import '../../../core/config/environment_config.dart';

/// In-app YouTube embed — same nocookie URL pattern as the web course player.
///
/// YouTube Error 153 ("Video player configuration error") happens when the
/// embed request has no HTTP Referer. We load an HTML iframe with a real HTTPS
/// base URL (production site origin) so WebView sends a valid Referer, matching
/// the website iframe behaviour.
class YoutubeLessonPlayer extends StatefulWidget {
  const YoutubeLessonPlayer({
    super.key,
    required this.embedUrl,
  });

  final String embedUrl;

  @override
  State<YoutubeLessonPlayer> createState() => _YoutubeLessonPlayerState();
}

class _YoutubeLessonPlayerState extends State<YoutubeLessonPlayer> {
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

  /// Stable HTTPS origin YouTube accepts as Referer (not a local debug URL).
  static const _embedOrigin = EnvironmentConfig.productionWebBaseUrl;

  @override
  void initState() {
    super.initState();
    _controller = _createController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0B1220))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (mounted) {
              setState(() {
                _loading = true;
                _error = null;
              });
            }
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onWebResourceError: (_) {
            // YouTube emits noisy subframe errors; only surface if still loading.
            if (!mounted || !_loading) return;
            setState(() {
              _loading = false;
              _error = 'تعذر تحميل الفيديو.';
            });
          },
          onNavigationRequest: (request) {
            if (_isAllowedYoutubeUrl(request.url)) return NavigationDecision.navigate;
            return NavigationDecision.prevent;
          },
        ),
      );

    _configurePlatform(_controller);
    _loadEmbed(widget.embedUrl);
  }

  @override
  void didUpdateWidget(covariant YoutubeLessonPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.embedUrl != widget.embedUrl) {
      setState(() {
        _loading = true;
        _error = null;
      });
      _loadEmbed(widget.embedUrl);
    }
  }

  void _loadEmbed(String embedUrl) {
    // Prefer iframe+baseUrl (Referer) — mirrors web FreelancerCourseDetailsPage.
    _controller.loadHtmlString(
      _buildPlayerHtml(embedUrl),
      baseUrl: '$_embedOrigin/',
    );
  }

  String _buildPlayerHtml(String embedUrl) {
    final src = Uri.encodeFull(embedUrl);
    return '''
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b1220; overflow: hidden; }
    .wrap { position: fixed; inset: 0; }
    iframe { border: 0; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div class="wrap">
    <iframe
      src="$src"
      title="Lesson video"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe>
  </div>
</body>
</html>
''';
  }

  WebViewController _createController() {
    if (WebViewPlatform.instance is WebKitWebViewPlatform) {
      final params = WebKitWebViewControllerCreationParams(
        allowsInlineMediaPlayback: true,
        mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
      );
      return WebViewController.fromPlatformCreationParams(params);
    }
    return WebViewController.fromPlatformCreationParams(
      const PlatformWebViewControllerCreationParams(),
    );
  }

  void _configurePlatform(WebViewController controller) {
    final platform = controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
      AndroidWebViewController.enableDebugging(kDebugMode);
    }
  }

  bool _isAllowedYoutubeUrl(String raw) {
    final uri = Uri.tryParse(raw);
    if (uri == null) return false;
    if (uri.scheme == 'about' || uri.scheme == 'data' || uri.scheme == 'blob') return true;
    final host = uri.host.toLowerCase();
    return host.endsWith('youtube.com') ||
        host.endsWith('youtube-nocookie.com') ||
        host.endsWith('youtu.be') ||
        host.endsWith('googlevideo.com') ||
        host.endsWith('google.com') ||
        host.endsWith('gstatic.com') ||
        host.endsWith('ytimg.com') ||
        host.endsWith('orderzhouse.com');
  }

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(14),
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: ColoredBox(
          color: const Color(0xFF0B1220),
          child: Stack(
            fit: StackFit.expand,
            children: [
              if (_error == null) WebViewWidget(controller: _controller),
              if (_loading && _error == null)
                const Center(
                  child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 2.5),
                ),
              if (_error != null)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
