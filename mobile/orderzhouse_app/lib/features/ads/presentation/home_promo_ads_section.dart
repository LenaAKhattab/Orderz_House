import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_colors.dart';
import '../data/public_ad_models.dart';
import 'home_promo_ads_controller.dart';

/// Mobile home promo slot — compact card carousel matching Orderz House chrome.
class HomePromoAdsSection extends ConsumerWidget {
  const HomePromoAdsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncAds = ref.watch(homePromoAdsProvider);

    return asyncAds.when(
      loading: () => const SizedBox.shrink(),
      error: (e, st) => const SizedBox.shrink(),
      data: (ads) {
        if (ads.isEmpty) return const SizedBox.shrink();
        return _PromoAdsCarousel(ads: ads);
      },
    );
  }
}

class _PromoAdsCarousel extends ConsumerStatefulWidget {
  const _PromoAdsCarousel({required this.ads});

  final List<PublicAd> ads;

  @override
  ConsumerState<_PromoAdsCarousel> createState() => _PromoAdsCarouselState();
}

class _PromoAdsCarouselState extends ConsumerState<_PromoAdsCarousel> {
  late final PageController _pageController;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: widget.ads.length == 1 ? 1 : 0.92);
    WidgetsBinding.instance.addPostFrameCallback((_) => _trackVisible());
  }

  @override
  void didUpdateWidget(covariant _PromoAdsCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.ads.map((e) => e.id).join() != widget.ads.map((e) => e.id).join()) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _trackVisible());
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _trackVisible() {
    if (!mounted || widget.ads.isEmpty) return;
    final ad = widget.ads[_index.clamp(0, widget.ads.length - 1)];
    ref.read(homePromoAdsProvider.notifier).trackImpression(ad);
  }

  Future<void> _openAd(PublicAd ad) async {
    await ref.read(homePromoAdsProvider.notifier).trackClick(ad);
    final raw = ad.ctaUrl?.trim();
    if (raw == null || raw.isEmpty) return;
    final uri = Uri.tryParse(raw);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final ads = widget.ads;
    final height = ads.any((a) => a.primaryImageUrl != null) ? 168.0 : 128.0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.secondary.withValues(alpha: 0.22),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text(
                'عروض مميزة',
                style: TextStyle(
                  color: AppColors.primaryDeep,
                  fontWeight: FontWeight.w800,
                  fontSize: 12,
                ),
              ),
            ),
            const Spacer(),
            if (ads.length > 1)
              Text(
                '${_index + 1} / ${ads.length}',
                style: const TextStyle(
                  color: AppColors.textMuted,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: height,
          child: PageView.builder(
            controller: _pageController,
            itemCount: ads.length,
            onPageChanged: (i) {
              setState(() => _index = i);
              _trackVisible();
            },
            itemBuilder: (context, i) {
              return Padding(
                padding: EdgeInsetsDirectional.only(end: ads.length > 1 ? 10 : 0),
                child: _HomePromoAdCard(
                  ad: ads[i],
                  onTap: () => _openAd(ads[i]),
                ),
              );
            },
          ),
        ),
        if (ads.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < ads.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 220),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == _index ? 16 : 7,
                  height: 7,
                  decoration: BoxDecoration(
                    color: i == _index
                        ? AppColors.primary
                        : AppColors.primary.withValues(alpha: 0.22),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _HomePromoAdCard extends StatelessWidget {
  const _HomePromoAdCard({required this.ad, required this.onTap});

  final PublicAd ad;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final image = ad.primaryImageUrl;
    final cta = ad.ctaText?.trim();

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            gradient: const LinearGradient(
              begin: Alignment.topRight,
              end: Alignment.bottomLeft,
              colors: [Color(0xFF3D4D7A), AppColors.primaryDeep],
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.18),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (image != null)
                  Opacity(
                    opacity: 0.35,
                    child: Image.network(
                      image,
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => const SizedBox.shrink(),
                    ),
                  ),
                Positioned(
                  left: -20,
                  bottom: -30,
                  child: Container(
                    width: 120,
                    height: 120,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: AppColors.secondary.withValues(alpha: 0.22),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                  child: Row(
                    children: [
                      if (image != null) ...[
                        ClipRRect(
                          borderRadius: BorderRadius.circular(14),
                          child: SizedBox(
                            width: 72,
                            height: 72,
                            child: Image.network(
                              image,
                              fit: BoxFit.cover,
                              errorBuilder: (context, error, stackTrace) => Container(
                                color: Colors.white.withValues(alpha: 0.12),
                                child: const Icon(Icons.campaign_rounded, color: Colors.white70),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            if (ad.badgeText != null && ad.badgeText!.isNotEmpty)
                              Container(
                                margin: const EdgeInsets.only(bottom: 6),
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: AppColors.secondary,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  ad.badgeText!,
                                  style: const TextStyle(
                                    color: AppColors.primaryDeep,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                            Text(
                              ad.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                height: 1.25,
                              ),
                            ),
                            if (ad.subtitle != null && ad.subtitle!.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                ad.subtitle!,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.82),
                                  fontSize: 12,
                                  height: 1.3,
                                ),
                              ),
                            ],
                            if (cta != null && cta.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Text(
                                    cta,
                                    style: const TextStyle(
                                      color: AppColors.secondary,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 12,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  const Icon(Icons.arrow_back_rounded, size: 14, color: AppColors.secondary),
                                ],
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
