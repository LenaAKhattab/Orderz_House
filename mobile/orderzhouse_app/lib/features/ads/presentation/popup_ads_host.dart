import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/network/dio_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/mobile_ads_path.dart';
import '../data/popup_ad_dismiss_store.dart';
import '../data/popup_ad_models.dart';
import '../data/public_ads_api.dart';

final popupAdsApiProvider = Provider<PopupAdsApi>((ref) {
  return PopupAdsApi(ref.watch(dioProvider));
});

final popupAdDismissStoreProvider = Provider<PopupAdDismissStore>((ref) {
  return PopupAdDismissStore();
});

/// Global host — mount inside authenticated shell Stack.
class PopupAdsHost extends ConsumerStatefulWidget {
  const PopupAdsHost({super.key});

  @override
  ConsumerState<PopupAdsHost> createState() => _PopupAdsHostState();
}

class _PopupAdsHostState extends ConsumerState<PopupAdsHost> with WidgetsBindingObserver {
  PopupAd? _active;
  String? _lastFetchKey;
  final Set<String> _impressed = <String>{};
  bool _dialogOpen = false;
  GoRouter? _router;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _attachRouterAndRefresh());
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_onRouteChanged);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _scheduleRefresh();
    }
  }

  void _attachRouterAndRefresh() {
    if (!mounted) return;
    final router = GoRouter.maybeOf(context);
    if (router != null && !identical(_router, router)) {
      _router?.routerDelegate.removeListener(_onRouteChanged);
      _router = router;
      _router!.routerDelegate.addListener(_onRouteChanged);
    }
    _scheduleRefresh();
  }

  void _onRouteChanged() => _scheduleRefresh();

  void _scheduleRefresh() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) unawaited(_refresh());
    });
  }

  Future<void> _refresh() async {
    final auth = ref.read(authControllerProvider);
    if (!auth.isAuthenticated) {
      if (_active != null) setState(() => _active = null);
      return;
    }

    final loc = GoRouter.of(context).routerDelegate.currentConfiguration.uri.toString();
    final pathOnly = MobileAdsPath.normalize(loc);
    if (MobileAdsPath.isPopupRouteBlocked(pathOnly)) {
      if (_active != null) setState(() => _active = null);
      return;
    }

    final user = auth.user;
    final webPath = MobileAdsPath.webPathnameForLocation(pathOnly, user: user);
    final fetchKey = '${user?.id ?? ''}|$webPath|${user?.effectiveRole ?? ''}';
    if (fetchKey == _lastFetchKey && _active != null) return;

    try {
      final api = ref.read(popupAdsApiProvider);
      final store = ref.read(popupAdDismissStoreProvider);
      final list = await api.listPopupAds(pathname: webPath);
      final pick = await store.pickToShow(list, webPath);
      if (!mounted) return;
      _lastFetchKey = fetchKey;

      if (pick == null) {
        if (_active != null) setState(() => _active = null);
        return;
      }

      setState(() => _active = pick);
      if (!_impressed.contains(pick.id)) {
        _impressed.add(pick.id);
        unawaited(api.trackImpression(pick.id));
      }
      if (!_dialogOpen) {
        _dialogOpen = true;
        await _showSheet(pick, webPath);
        _dialogOpen = false;
        if (mounted && _active?.id == pick.id) {
          setState(() => _active = null);
        }
      }
    } catch (_) {
      /* silent — ads must never break navigation */
    }
  }

  Future<void> _showSheet(PopupAd ad, String webPath) async {
    final store = ref.read(popupAdDismissStoreProvider);
    final api = ref.read(popupAdsApiProvider);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.45),
      builder: (ctx) {
        return PopupAdSheet(
          ad: ad,
          onClose: () => Navigator.of(ctx).maybePop(),
          onCta: () async {
            unawaited(api.trackClick(ad.id));
            final raw = ad.ctaUrl?.trim();
            if (raw != null && raw.isNotEmpty) {
              final uri = Uri.tryParse(raw);
              if (uri != null) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
              }
            }
            if (ctx.mounted) Navigator.of(ctx).maybePop();
          },
        );
      },
    );

    await store.markDismissed(ad, webPath);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(authControllerProvider, (prev, next) {
      if (next.isAuthenticated) _scheduleRefresh();
      if (!next.isAuthenticated && _active != null) {
        setState(() => _active = null);
      }
    });

    // Host is overlay-only; UI is a modal sheet.
    return const SizedBox.shrink();
  }
}

void unawaited(Future<void> future) {
  future.catchError((_) {});
}

/// Mobile-first popup ad bottom sheet.
class PopupAdSheet extends StatelessWidget {
  const PopupAdSheet({
    super.key,
    required this.ad,
    required this.onClose,
    required this.onCta,
  });

  final PopupAd ad;
  final VoidCallback onClose;
  final Future<void> Function() onCta;

  @override
  Widget build(BuildContext context) {
    final title = ad.titleArPreferred;
    final body = ad.bodyArPreferred;
    final cta = ad.ctaText?.trim() ?? '';
    final hasCta = cta.isNotEmpty && (ad.ctaUrl?.trim().isNotEmpty == true);

    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(28),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.18),
              blurRadius: 28,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (ad.imageUrl != null && ad.imageUrl!.isNotEmpty)
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        ad.imageUrl!,
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(
                          color: AppColors.primary.withValues(alpha: 0.08),
                          child: const Icon(Icons.campaign_rounded, size: 40, color: AppColors.primary),
                        ),
                      ),
                      Positioned(
                        top: 10,
                        left: 10,
                        child: _CloseChip(onClose: onClose),
                      ),
                      Positioned(
                        top: 12,
                        right: 12,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.92),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: const Text(
                            'إعلان',
                            style: TextStyle(
                              color: AppColors.primaryDeep,
                              fontWeight: FontWeight.w800,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                )
              else
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.secondary.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: const Text(
                          'إعلان',
                          style: TextStyle(
                            color: AppColors.primaryDeep,
                            fontWeight: FontWeight.w800,
                            fontSize: 11,
                          ),
                        ),
                      ),
                      const Spacer(),
                      _CloseChip(onClose: onClose),
                    ],
                  ),
                ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (title.isNotEmpty)
                      Text(
                        title,
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          color: AppColors.primaryDeep,
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          height: 1.35,
                        ),
                      ),
                    if (body.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        body,
                        textAlign: TextAlign.right,
                        style: const TextStyle(
                          color: AppColors.textMuted,
                          fontSize: 14,
                          height: 1.65,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                    if (hasCta) ...[
                      const SizedBox(height: 18),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: () => onCta(),
                          style: FilledButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(14),
                            ),
                          ),
                          child: Text(
                            cta,
                            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CloseChip extends StatelessWidget {
  const _CloseChip({required this.onClose});

  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.95),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onClose,
        child: const SizedBox(
          width: 36,
          height: 36,
          child: Icon(Icons.close_rounded, size: 20, color: AppColors.primaryDeep),
        ),
      ),
    );
  }
}
