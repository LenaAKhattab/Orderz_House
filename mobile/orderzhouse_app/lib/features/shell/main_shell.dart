import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import '../../core/router/super_admin_access.dart';
import '../ads/presentation/popup_ads_host.dart';
import '../auth/presentation/auth_controller.dart';

class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final isSuperAdmin = auth.user?.usesSuperAdminExperience == true;
    final isFreelancer = auth.user?.usesFreelancerExperience == true;
    final destinations = _destinationsFor(isClient: !isFreelancer);
    final showAds = auth.isAuthenticated && shouldShowPopupAdsForRole(auth.user?.effectiveRole);

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          navigationShell,
          if (showAds) const PopupAdsHost(),
        ],
      ),
      bottomNavigationBar: auth.isAuthenticated && !isSuperAdmin
          ? _SoftBottomNavBar(
              selectedIndex: navigationShell.currentIndex,
              destinations: destinations,
              onDestinationSelected: navigationShell.goBranch,
            )
          : null,
    );
  }

  static List<_ShellDestination> _destinationsFor({required bool isClient}) {
    return [
      const _ShellDestination(
        label: 'الرئيسية',
        icon: Icons.home_outlined,
        selectedIcon: Icons.home_rounded,
        wellShape: _NavWellShape.rounded,
      ),
      const _ShellDestination(
        label: 'طلباتي',
        icon: Icons.receipt_long_outlined,
        selectedIcon: Icons.receipt_long_rounded,
        wellShape: _NavWellShape.circle,
      ),
      const _ShellDestination(
        label: 'الطلبات',
        icon: Icons.storefront_outlined,
        selectedIcon: Icons.storefront_rounded,
        wellShape: _NavWellShape.rounded,
      ),
      isClient
          ? const _ShellDestination(
              label: 'الخدمات',
              icon: Icons.grid_view_outlined,
              selectedIcon: Icons.grid_view_rounded,
              wellShape: _NavWellShape.rounded,
            )
          : const _ShellDestination(
              label: 'الدورات',
              icon: Icons.school_outlined,
              selectedIcon: Icons.school_rounded,
              wellShape: _NavWellShape.rounded,
            ),
      const _ShellDestination(
        label: 'حسابي',
        icon: Icons.person_outline_rounded,
        selectedIcon: Icons.person_rounded,
        wellShape: _NavWellShape.circle,
      ),
    ];
  }
}

enum _NavWellShape { rounded, circle }

class _ShellDestination {
  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.selectedIcon,
    required this.wellShape,
  });

  final String label;
  final IconData icon;
  final IconData selectedIcon;
  final _NavWellShape wellShape;
}

class _SoftBottomNavBar extends StatelessWidget {
  const _SoftBottomNavBar({
    required this.selectedIndex,
    required this.destinations,
    required this.onDestinationSelected,
  });

  final int selectedIndex;
  final List<_ShellDestination> destinations;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.paddingOf(context).bottom;

    return Material(
      color: Colors.transparent,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          boxShadow: [
            BoxShadow(
              color: AppColors.primary.withValues(alpha: 0.10),
              blurRadius: 24,
              offset: const Offset(0, -6),
            ),
          ],
        ),
        padding: EdgeInsets.fromLTRB(10, 12, 10, 10 + bottomInset),
        child: Row(
          children: [
            for (var i = 0; i < destinations.length; i++)
              Expanded(
                child: _SoftNavItem(
                  destination: destinations[i],
                  selected: i == selectedIndex,
                  onTap: () => onDestinationSelected(i),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _SoftNavItem extends StatelessWidget {
  const _SoftNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _ShellDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      splashColor: AppColors.primary.withValues(alpha: 0.08),
      highlightColor: AppColors.primary.withValues(alpha: 0.04),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selected)
              _ActiveGlassIcon(icon: destination.selectedIcon)
            else
              _InactiveSoftIcon(
                icon: destination.icon,
                shape: destination.wellShape,
              ),
            const SizedBox(height: 6),
            Text(
              destination.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 11,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                color: selected ? AppColors.primary : AppColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Active icon: layered translucent primary shapes (soft glass look).
class _ActiveGlassIcon extends StatelessWidget {
  const _ActiveGlassIcon({required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 42,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Positioned(
            left: 2,
            top: 4,
            child: Container(
              width: 34,
              height: 30,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.secondary.withValues(alpha: 0.55),
                    AppColors.primary.withValues(alpha: 0.35),
                  ],
                ),
              ),
            ),
          ),
          Positioned(
            right: 2,
            bottom: 2,
            child: Container(
              width: 34,
              height: 30,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                gradient: LinearGradient(
                  begin: Alignment.topRight,
                  end: Alignment.bottomLeft,
                  colors: [
                    AppColors.primary.withValues(alpha: 0.75),
                    AppColors.primaryMid.withValues(alpha: 0.55),
                  ],
                ),
              ),
            ),
          ),
          Container(
            width: 36,
            height: 32,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.primaryMid, AppColors.primary],
              ),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.28),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 20),
          ),
          Positioned(
            bottom: 4,
            child: Container(
              width: 14,
              height: 3,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Inactive icon: soft neumorphic well.
class _InactiveSoftIcon extends StatelessWidget {
  const _InactiveSoftIcon({
    required this.icon,
    required this.shape,
  });

  final IconData icon;
  final _NavWellShape shape;

  @override
  Widget build(BuildContext context) {
    final radius = shape == _NavWellShape.circle ? 999.0 : 14.0;

    return Container(
      width: 42,
      height: 42,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F4F8),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          BoxShadow(
            color: Colors.white.withValues(alpha: 0.95),
            offset: const Offset(-2, -2),
            blurRadius: 4,
          ),
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.08),
            offset: const Offset(2, 3),
            blurRadius: 6,
          ),
        ],
      ),
      child: Icon(icon, color: AppColors.textMuted, size: 20),
    );
  }
}

class HomeQuickAction extends StatelessWidget {
  const HomeQuickAction({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.cardBorder),
          ),
          child: Column(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: AppColors.iconChipBg,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: AppColors.primary),
              ),
              const SizedBox(height: 8),
              Text(
                label,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
