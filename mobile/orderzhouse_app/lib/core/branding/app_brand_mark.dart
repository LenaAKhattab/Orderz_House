import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'app_branding.dart';

/// Shared logo chip + optional title for splash and marketing surfaces.
class AppBrandMark extends StatelessWidget {
  const AppBrandMark({
    super.key,
    this.size = 88,
    this.showTitle = true,
    this.titleColor = Colors.white,
    this.useAssetImage = true,
  });

  final double size;
  final bool showTitle;
  final Color titleColor;
  final bool useAssetImage;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(size * 0.27),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: useAssetImage
              ? Padding(
                  padding: EdgeInsets.all(size * 0.08),
                  child: Image.asset(
                    'assets/branding/app_icon.png',
                    fit: BoxFit.contain,
                  ),
                )
              : Icon(Icons.home_work_rounded, size: size * 0.5, color: AppColors.primary),
        ),
        if (showTitle) ...[
          SizedBox(height: size * 0.22),
          Text(
            AppBranding.displayNameAr,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  color: titleColor,
                  fontWeight: FontWeight.w800,
                ),
            textAlign: TextAlign.center,
          ),
        ],
      ],
    );
  }
}
