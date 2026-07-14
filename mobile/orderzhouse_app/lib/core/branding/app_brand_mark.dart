import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'app_branding.dart';

/// Shared logo chip + optional title for splash and marketing surfaces.
class AppBrandMark extends StatelessWidget {
  const AppBrandMark({
    super.key,
    this.size = 72,
    this.showTitle = true,
    this.titleColor = Colors.white,
    this.useAssetImage = true,
    this.showGroundShadow = false,
    this.showWhitePlate = false,
  });

  final double size;
  final bool showTitle;
  final Color titleColor;
  final bool useAssetImage;
  final bool showGroundShadow;
  final bool showWhitePlate;

  @override
  Widget build(BuildContext context) {
    final image = useAssetImage
        ? Image.asset(
            AppBranding.logoAsset,
            fit: BoxFit.contain,
          )
        : Icon(Icons.home_work_rounded, size: size * 0.5, color: AppColors.secondary);

    final mark = showWhitePlate
        ? Container(
            width: size,
            height: size,
            padding: EdgeInsets.all(size * 0.18),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(size * 0.24),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.14),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: image,
          )
        : SizedBox(
            width: size,
            height: size,
            child: Padding(
              padding: EdgeInsets.all(size * 0.06),
              child: image,
            ),
          );

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (showGroundShadow)
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              mark,
              SizedBox(height: size * 0.02),
              _GroundShadow(width: size * 0.72),
            ],
          )
        else
          mark,
        if (showTitle) ...[
          SizedBox(height: size * 0.18),
          Text(
            AppBranding.markWordmark,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  color: titleColor,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.2,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}

class _GroundShadow extends StatelessWidget {
  const _GroundShadow({required this.width});

  final double width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: width * 0.16,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        gradient: RadialGradient(
          colors: [
            AppColors.primary.withValues(alpha: 0.28),
            AppColors.primary.withValues(alpha: 0.10),
            Colors.transparent,
          ],
          stops: const [0.0, 0.45, 1.0],
        ),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.18),
            blurRadius: 14,
            spreadRadius: 1,
            offset: const Offset(0, 2),
          ),
        ],
      ),
    );
  }
}
